#!/bin/bash
# Diagnose Grafana datasource connectivity issues

set -e

ENVIRONMENT="${ENVIRONMENT:-pipeline}"
AWS_REGION="${AWS_REGION:-eu-west-1}"

echo "========================================="
echo "Grafana Datasource Diagnostics"
echo "========================================="
echo ""

# Get instance ID
INSTANCE_ID=$(aws ec2 describe-instances \
  --filters "Name=tag:Environment,Values=$ENVIRONMENT" \
            "Name=tag:Purpose,Values=Monitoring" \
            "Name=instance-state-name,Values=running" \
  --query 'Reservations[0].Instances[0].InstanceId' \
  --output text \
  --region "$AWS_REGION")

if [ "$INSTANCE_ID" = "None" ] || [ -z "$INSTANCE_ID" ]; then
  echo "ERROR: No monitoring instance found"
  exit 1
fi

echo "Instance ID: $INSTANCE_ID"
echo ""

# Run diagnostics via SSM
echo "Running diagnostics on instance..."
echo ""

COMMAND_ID=$(aws ssm send-command \
  --instance-ids "$INSTANCE_ID" \
  --document-name "AWS-RunShellScript" \
  --parameters 'commands=[
    "#!/bin/bash",
    "echo \"=== Host Information ===\"",
    "HOST_IP=$(curl -s http://169.254.169.254/latest/meta-data/local-ipv4)",
    "echo \"Host Private IP: $HOST_IP\"",
    "echo \"\"",
    "",
    "echo \"=== Grafana Datasource Config ===\"",
    "cat /mnt/grafana-provisioning/datasources/prometheus.yml",
    "echo \"\"",
    "",
    "echo \"=== Running Containers ===\"",
    "docker ps --format \"table {{.Names}}\t{{.Status}}\t{{.Ports}}\"",
    "echo \"\"",
    "",
    "echo \"=== Prometheus Connectivity Test ===\"",
    "echo \"Testing from host:\"",
    "curl -s http://localhost:9090/prometheus/-/healthy && echo \"✓ Prometheus healthy\" || echo \"✗ Prometheus not responding\"",
    "curl -s http://localhost:9090/prometheus/api/v1/status/config > /dev/null && echo \"✓ Prometheus API accessible\" || echo \"✗ Prometheus API not accessible\"",
    "echo \"\"",
    "",
    "echo \"Testing from Grafana container:\"",
    "GRAFANA_CONTAINER=$(docker ps -q -f name=grafana)",
    "if [ -n \"$GRAFANA_CONTAINER\" ]; then",
    "  docker exec $GRAFANA_CONTAINER wget -qO- http://$HOST_IP:9090/prometheus/-/healthy 2>&1 | head -5",
    "  echo \"\"",
    "  docker exec $GRAFANA_CONTAINER wget -qO- http://$HOST_IP:9090/prometheus/api/v1/query?query=up 2>&1 | head -10",
    "else",
    "  echo \"Grafana container not found\"",
    "fi",
    "echo \"\"",
    "",
    "echo \"=== Grafana Logs (last 20 lines) ===\"",
    "docker logs grafana --tail 20 2>&1 | grep -E \"(datasource|prometheus|error|failed)\" || echo \"No relevant logs\"",
    "echo \"\"",
    "",
    "echo \"=== Network Connectivity ===\"",
    "echo \"Grafana container network:\"",
    "docker inspect grafana | grep -A 10 NetworkMode || echo \"Cannot inspect Grafana\"",
    "echo \"\"",
    "echo \"Prometheus container network:\"",
    "docker inspect prometheus | grep -A 10 NetworkMode || echo \"Cannot inspect Prometheus\"",
    "echo \"\"",
    "",
    "echo \"=== Port Listening ===\"",
    "netstat -tlnp | grep 9090 || echo \"Port 9090 not listening\"",
    "netstat -tlnp | grep 3000 || echo \"Port 3000 not listening\""
  ]' \
  --region "$AWS_REGION" \
  --output text \
  --query 'Command.CommandId')

echo "Command ID: $COMMAND_ID"
echo "Waiting for command to complete..."
sleep 5

# Get output
aws ssm get-command-invocation \
  --command-id "$COMMAND_ID" \
  --instance-id "$INSTANCE_ID" \
  --region "$AWS_REGION" \
  --query 'StandardOutputContent' \
  --output text

echo ""
echo "========================================="
echo "Diagnostics Complete"
echo "========================================="
echo ""
echo "Common Issues:"
echo "  1. HOST_IP not set correctly in datasource config"
echo "  2. Grafana container can't reach host network"
echo "  3. Prometheus not running or not healthy"
echo "  4. Network mode mismatch between containers"
echo ""
echo "To fix:"
echo "  1. Check datasource URL in Grafana UI"
echo "  2. Update datasource config if needed"
echo "  3. Restart Grafana: docker restart grafana"
echo ""

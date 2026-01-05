#!/bin/bash
# Fix Grafana datasource configuration

set -e

ENVIRONMENT="${ENVIRONMENT:-pipeline}"
AWS_REGION="${AWS_REGION:-eu-west-1}"

echo "========================================="
echo "Fix Grafana Datasource"
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

# Fix datasource configuration
echo "Fixing datasource configuration..."
echo ""

COMMAND_ID=$(aws ssm send-command \
  --instance-ids "$INSTANCE_ID" \
  --document-name "AWS-RunShellScript" \
  --parameters 'commands=[
    "#!/bin/bash",
    "set -e",
    "",
    "echo \"Getting host IP...\"",
    "HOST_IP=$(curl -s http://169.254.169.254/latest/meta-data/local-ipv4)",
    "echo \"Host IP: $HOST_IP\"",
    "echo \"\"",
    "",
    "echo \"Creating Grafana datasource configuration...\"",
    "cat > /mnt/grafana-provisioning/datasources/prometheus.yml << EOF",
    "apiVersion: 1",
    "",
    "datasources:",
    "  - name: Prometheus",
    "    type: prometheus",
    "    uid: prometheus",
    "    access: proxy",
    "    url: http://${HOST_IP}:9090/prometheus",
    "    isDefault: true",
    "    editable: true",
    "    jsonData:",
    "      timeInterval: \"15s\"",
    "      httpMethod: GET",
    "    version: 1",
    "EOF",
    "",
    "echo \"✓ Datasource config created\"",
    "cat /mnt/grafana-provisioning/datasources/prometheus.yml",
    "echo \"\"",
    "",
    "echo \"Setting permissions...\"",
    "chown -R 472:0 /mnt/grafana-provisioning",
    "chmod -R 755 /mnt/grafana-provisioning",
    "echo \"✓ Permissions set\"",
    "echo \"\"",
    "",
    "echo \"Restarting Grafana container...\"",
    "docker restart grafana",
    "sleep 5",
    "echo \"✓ Grafana restarted\"",
    "echo \"\"",
    "",
    "echo \"Testing Prometheus connectivity...\"",
    "curl -s http://localhost:9090/prometheus/-/healthy && echo \"✓ Prometheus is healthy\" || echo \"✗ Prometheus not responding\"",
    "echo \"\"",
    "",
    "echo \"Waiting for Grafana to start...\"",
    "sleep 10",
    "",
    "echo \"Testing Grafana health...\"",
    "curl -s http://localhost:3000/api/health | grep -q ok && echo \"✓ Grafana is healthy\" || echo \"✗ Grafana not responding\"",
    "echo \"\"",
    "",
    "echo \"Checking Grafana logs for datasource...\"",
    "docker logs grafana --tail 30 2>&1 | grep -E \"(datasource|prometheus)\" | tail -10 || echo \"No datasource logs yet\"",
    "echo \"\"",
    "",
    "echo \"=========================================\"",
    "echo \"Fix Complete\"",
    "echo \"=========================================\"",
    "echo \"\"",
    "echo \"Next steps:\"",
    "echo \"  1. Open Grafana in browser\"",
    "echo \"  2. Go to Configuration → Data Sources\"",
    "echo \"  3. Click on Prometheus datasource\"",
    "echo \"  4. Click \\\"Save & Test\\\" button\"",
    "echo \"  5. Should see \\\"Data source is working\\\"\"",
    "echo \"\""
  ]' \
  --region "$AWS_REGION" \
  --output text \
  --query 'Command.CommandId')

echo "Command ID: $COMMAND_ID"
echo "Waiting for command to complete..."
sleep 8

# Get output
aws ssm get-command-invocation \
  --command-id "$COMMAND_ID" \
  --instance-id "$INSTANCE_ID" \
  --region "$AWS_REGION" \
  --query 'StandardOutputContent' \
  --output text

echo ""
echo "========================================="
echo "Datasource Fix Complete"
echo "========================================="
echo ""

# Get ALB DNS
ALB_DNS=$(aws cloudformation describe-stacks \
  --stack-name MonitoringEcsStack-$ENVIRONMENT \
  --query 'Stacks[0].Outputs[?OutputKey==`MonitoringAlbDns`].OutputValue' \
  --output text \
  --region "$AWS_REGION" 2>/dev/null || echo "")

if [ -n "$ALB_DNS" ]; then
  echo "Access Grafana:"
  echo "  URL: http://${ALB_DNS}/grafana"
  echo "  Username: admin"
  echo "  Password: admin"
  echo ""
  echo "Test Prometheus datasource:"
  echo "  1. Go to Configuration → Data Sources"
  echo "  2. Click Prometheus"
  echo "  3. Click 'Save & Test'"
  echo ""
fi

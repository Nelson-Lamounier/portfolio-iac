#!/bin/bash
set -e

PROFILE=${AWS_PROFILE:-github-actions}
REGION=${AWS_REGION:-eu-west-1}
ENV=${1:-pipeline}

echo "=== Getting Instance ID for $ENV ==="
INSTANCE_ID=$(aws ec2 describe-instances \
  --profile $PROFILE \
  --region $REGION \
  --filters "Name=tag:Environment,Values=$ENV" "Name=instance-state-name,Values=running" \
  --query 'Reservations[0].Instances[0].InstanceId' \
  --output text)

echo "Instance ID: $INSTANCE_ID"

echo ""
echo "=== Checking Grafana Datasource Configuration ==="
COMMAND_ID=$(aws ssm send-command \
  --profile $PROFILE \
  --region $REGION \
  --instance-ids $INSTANCE_ID \
  --document-name "AWS-RunShellScript" \
  --parameters 'commands=[
    "echo \"=== Datasource Directory ===\"",
    "ls -la /mnt/efs/config/grafana/provisioning/datasources/ 2>&1 || echo \"Directory does not exist\"",
    "echo",
    "echo \"=== Prometheus Health ===\"",
    "curl -s http://localhost:9090/-/healthy 2>&1 || echo \"Prometheus not responding\"",
    "echo",
    "echo \"=== Grafana Container Can Reach Prometheus? ===\"",
    "GRAFANA_CONTAINER=$(docker ps -q --filter name=grafana | head -1)",
    "if [ -n \"$GRAFANA_CONTAINER\" ]; then",
    "  docker exec $GRAFANA_CONTAINER wget -qO- http://localhost:9090/-/healthy 2>&1 || echo \"Cannot reach\"",
    "else",
    "  echo \"No Grafana container running\"",
    "fi"
  ]' \
  --query 'Command.CommandId' \
  --output text)

echo "Command ID: $COMMAND_ID"
echo "Waiting for results..."
sleep 8

aws ssm get-command-invocation \
  --profile $PROFILE \
  --region $REGION \
  --command-id $COMMAND_ID \
  --instance-id $INSTANCE_ID \
  --query 'StandardOutputContent' \
  --output text

echo ""
echo "=== Creating Prometheus Datasource Configuration ==="
COMMAND_ID=$(aws ssm send-command \
  --profile $PROFILE \
  --region $REGION \
  --instance-ids $INSTANCE_ID \
  --document-name "AWS-RunShellScript" \
  --parameters 'commands=[
    "sudo mkdir -p /mnt/efs/config/grafana/provisioning/datasources",
    "cat > /tmp/prometheus-datasource.yml <<EOF
apiVersion: 1

datasources:
  - name: Prometheus
    type: prometheus
    access: proxy
    url: http://localhost:9090
    isDefault: true
    editable: true
    jsonData:
      timeInterval: 15s
EOF",
    "sudo mv /tmp/prometheus-datasource.yml /mnt/efs/config/grafana/provisioning/datasources/prometheus.yml",
    "sudo chown 472:0 /mnt/efs/config/grafana/provisioning/datasources/prometheus.yml",
    "sudo chmod 644 /mnt/efs/config/grafana/provisioning/datasources/prometheus.yml",
    "echo \"Datasource config created\"",
    "cat /mnt/efs/config/grafana/provisioning/datasources/prometheus.yml"
  ]' \
  --query 'Command.CommandId' \
  --output text)

echo "Command ID: $COMMAND_ID"
echo "Waiting for results..."
sleep 5

aws ssm get-command-invocation \
  --profile $PROFILE \
  --region $REGION \
  --command-id $COMMAND_ID \
  --instance-id $INSTANCE_ID \
  --query 'StandardOutputContent' \
  --output text

echo ""
echo "=== Restarting Grafana to Load Datasource ==="
COMMAND_ID=$(aws ssm send-command \
  --profile $PROFILE \
  --region $REGION \
  --instance-ids $INSTANCE_ID \
  --document-name "AWS-RunShellScript" \
  --parameters 'commands=[
    "GRAFANA_CONTAINER=$(docker ps -q --filter name=grafana | head -1)",
    "if [ -n \"$GRAFANA_CONTAINER\" ]; then",
    "  docker restart $GRAFANA_CONTAINER",
    "  echo \"Grafana restarted\"",
    "  sleep 5",
    "  docker logs $GRAFANA_CONTAINER 2>&1 | grep -i datasource | tail -10",
    "else",
    "  echo \"No Grafana container running\"",
    "fi"
  ]' \
  --query 'Command.CommandId' \
  --output text)

echo "Command ID: $COMMAND_ID"
echo "Waiting for results..."
sleep 8

aws ssm get-command-invocation \
  --profile $PROFILE \
  --region $REGION \
  --command-id $COMMAND_ID \
  --instance-id $INSTANCE_ID \
  --query 'StandardOutputContent' \
  --output text

echo ""
echo "✓ Done! Check Grafana UI for Prometheus datasource"

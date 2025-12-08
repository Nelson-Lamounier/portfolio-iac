#!/bin/bash
# Check monitoring instance status and setup

set -e

ENVIRONMENT="${ENVIRONMENT:-pipeline}"
AWS_REGION="${AWS_REGION:-eu-west-1}"

echo "========================================="
echo "Monitoring Instance Check"
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

# Run comprehensive check
COMMAND_ID=$(aws ssm send-command \
  --instance-ids "$INSTANCE_ID" \
  --document-name "AWS-RunShellScript" \
  --parameters 'commands=[
    "#!/bin/bash",
    "echo \"=========================================\"",
    "echo \"System Information\"",
    "echo \"=========================================\"",
    "echo \"Host IP: $(curl -s http://169.254.169.254/latest/meta-data/local-ipv4)\"",
    "echo \"Uptime: $(uptime)\"",
    "echo \"\"",
    "",
    "echo \"=========================================\"",
    "echo \"User Data Execution\"",
    "echo \"=========================================\"",
    "if [ -f /var/log/monitoring-setup.log ]; then",
    "  echo \"Setup log exists\"",
    "  tail -50 /var/log/monitoring-setup.log",
    "else",
    "  echo \"Setup log NOT found - checking cloud-init\"",
    "  tail -100 /var/log/cloud-init-output.log | grep -A 5 -B 5 \"monitoring\\|prometheus\\|grafana\" || echo \"No monitoring setup found in cloud-init\"",
    "fi",
    "echo \"\"",
    "",
    "echo \"=========================================\"",
    "echo \"Directory Structure\"",
    "echo \"=========================================\"",
    "echo \"Checking /mnt directories:\"",
    "ls -la /mnt/ | grep -E \"(prometheus|grafana|efs)\" || echo \"No monitoring directories found\"",
    "echo \"\"",
    "",
    "if [ -d /mnt/efs ]; then",
    "  echo \"EFS mounted:\"",
    "  df -h | grep efs",
    "  echo \"EFS contents:\"",
    "  ls -la /mnt/efs/",
    "else",
    "  echo \"EFS NOT mounted\"",
    "fi",
    "echo \"\"",
    "",
    "if [ -d /mnt/prometheus-config ]; then",
    "  echo \"Prometheus config directory:\"",
    "  ls -la /mnt/prometheus-config/",
    "else",
    "  echo \"Prometheus config directory NOT found\"",
    "fi",
    "echo \"\"",
    "",
    "if [ -d /mnt/grafana-provisioning ]; then",
    "  echo \"Grafana provisioning directory:\"",
    "  ls -la /mnt/grafana-provisioning/",
    "  if [ -d /mnt/grafana-provisioning/datasources ]; then",
    "    echo \"Datasources:\"",
    "    ls -la /mnt/grafana-provisioning/datasources/",
    "  fi",
    "else",
    "  echo \"Grafana provisioning directory NOT found\"",
    "fi",
    "echo \"\"",
    "",
    "echo \"=========================================\"",
    "echo \"Docker Status\"",
    "echo \"=========================================\"",
    "systemctl status docker --no-pager | head -10",
    "echo \"\"",
    "",
    "echo \"Running containers:\"",
    "docker ps --format \"table {{.Names}}\t{{.Status}}\t{{.Ports}}\" || echo \"Docker not responding\"",
    "echo \"\"",
    "",
    "echo \"All containers (including stopped):\"",
    "docker ps -a --format \"table {{.Names}}\t{{.Status}}\" || echo \"Docker not responding\"",
    "echo \"\"",
    "",
    "echo \"=========================================\"",
    "echo \"ECS Agent Status\"",
    "echo \"=========================================\"",
    "systemctl status ecs --no-pager | head -10",
    "echo \"\"",
    "",
    "echo \"=========================================\"",
    "echo \"Port Listening\"",
    "echo \"=========================================\"",
    "netstat -tlnp | grep -E \"(9090|3000|9100)\" || echo \"No monitoring ports listening\"",
    "echo \"\"",
    "",
    "echo \"=========================================\"",
    "echo \"Recent Logs\"",
    "echo \"=========================================\"",
    "echo \"ECS Agent logs (last 20 lines):\"",
    "journalctl -u ecs -n 20 --no-pager",
    "echo \"\"",
    "",
    "if docker ps -q -f name=prometheus > /dev/null 2>&1; then",
    "  echo \"Prometheus logs (last 20 lines):\"",
    "  docker logs prometheus --tail 20 2>&1",
    "else",
    "  echo \"Prometheus container not running\"",
    "fi",
    "echo \"\"",
    "",
    "if docker ps -q -f name=grafana > /dev/null 2>&1; then",
    "  echo \"Grafana logs (last 20 lines):\"",
    "  docker logs grafana --tail 20 2>&1",
    "else",
    "  echo \"Grafana container not running\"",
    "fi"
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
echo "Check Complete"
echo "========================================="
echo ""
echo "Next steps based on findings:"
echo "  1. If user data didn't complete: Check /var/log/cloud-init-output.log"
echo "  2. If directories missing: User data script failed"
echo "  3. If containers not running: Check ECS task status"
echo "  4. If ECS agent not running: Start it with 'systemctl start ecs'"
echo ""

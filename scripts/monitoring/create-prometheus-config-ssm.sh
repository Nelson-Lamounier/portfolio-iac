#!/bin/bash
# Create Prometheus config via SSM Run Command

set -e

INSTANCE_ID="${1:-}"
ENVIRONMENT="${2:-pipeline}"
AWS_REGION="${AWS_REGION:-eu-west-1}"

if [ -z "$INSTANCE_ID" ]; then
  echo "Usage: $0 <instance-id> [environment]"
  echo ""
  echo "Example: $0 i-0cd2264a37e683a4a pipeline"
  echo ""
  echo "Or auto-detect instance:"
  INSTANCE_ID=$(aws ec2 describe-instances \
    --filters "Name=tag:Environment,Values=$ENVIRONMENT" \
              "Name=tag:Purpose,Values=Monitoring" \
              "Name=instance-state-name,Values=running" \
    --query 'Reservations[0].Instances[0].InstanceId' \
    --output text 2>/dev/null)
  
  if [ "$INSTANCE_ID" = "None" ] || [ -z "$INSTANCE_ID" ]; then
    echo "ERROR: No running monitoring instance found for environment: $ENVIRONMENT"
    exit 1
  fi
  
  echo "Auto-detected instance: $INSTANCE_ID"
fi

echo "========================================="
echo "Creating Prometheus Config via SSM"
echo "========================================="
echo ""
echo "Instance ID: $INSTANCE_ID"
echo "Environment: $ENVIRONMENT"
echo "Region: $AWS_REGION"
echo ""

# Create the config file via SSM
COMMAND_ID=$(aws ssm send-command \
  --instance-ids "$INSTANCE_ID" \
  --document-name "AWS-RunShellScript" \
  --parameters 'commands=[
    "#!/bin/bash",
    "set -e",
    "echo Creating Prometheus configuration...",
    "mkdir -p /mnt/prometheus-config",
    "cat > /mnt/prometheus-config/prometheus.yml << \"EOFCONFIG\"",
    "global:",
    "  scrape_interval: 15s",
    "  evaluation_interval: 15s",
    "  external_labels:",
    "    environment: \"'"$ENVIRONMENT"'\"",
    "",
    "scrape_configs:",
    "  - job_name: \"prometheus\"",
    "    static_configs:",
    "      - targets: [\"localhost:9090\"]",
    "",
    "  - job_name: \"node-exporter\"",
    "    ec2_sd_configs:",
    "      - region: '"$AWS_REGION"'",
    "        port: 9100",
    "        filters:",
    "          - name: tag:Environment",
    "            values: [\"'"$ENVIRONMENT"'\"]",
    "          - name: instance-state-name",
    "            values: [\"running\"]",
    "    relabel_configs:",
    "      - source_labels: [__meta_ec2_private_ip]",
    "        target_label: __address__",
    "        replacement: \$1:9100",
    "      - source_labels: [__meta_ec2_instance_id]",
    "        target_label: instance_id",
    "      - source_labels: [__meta_ec2_availability_zone]",
    "        target_label: availability_zone",
    "      - source_labels: [__meta_ec2_tag_Purpose]",
    "        target_label: cluster",
    "      - source_labels: [__meta_ec2_tag_Name]",
    "        target_label: instance",
    "EOFCONFIG",
    "chown -R 65534:65534 /mnt/prometheus-config",
    "chmod -R 755 /mnt/prometheus-config",
    "ls -la /mnt/prometheus-config/",
    "echo Config file created successfully",
    "cat /mnt/prometheus-config/prometheus.yml"
  ]' \
  --region "$AWS_REGION" \
  --output text \
  --query 'Command.CommandId')

echo "Command ID: $COMMAND_ID"
echo ""
echo "Waiting for command to complete..."
sleep 5

# Get command output
aws ssm get-command-invocation \
  --command-id "$COMMAND_ID" \
  --instance-id "$INSTANCE_ID" \
  --region "$AWS_REGION" \
  --query 'StandardOutputContent' \
  --output text

echo ""
echo "========================================="
echo "Config Created - Restart Prometheus"
echo "========================================="
echo ""
echo "Option 1: Force new deployment (recommended)"
echo "aws ecs update-service \\"
echo "  --cluster $ENVIRONMENT-monitoring-cluster \\"
echo "  --service $ENVIRONMENT-prometheus \\"
echo "  --force-new-deployment \\"
echo "  --region $AWS_REGION"
echo ""
echo "Option 2: Restart container via SSM"
echo "aws ssm send-command \\"
echo "  --instance-ids $INSTANCE_ID \\"
echo "  --document-name AWS-RunShellScript \\"
echo "  --parameters 'commands=[\"docker restart \\\$(docker ps -q -f name=prometheus)\"]' \\"
echo "  --region $AWS_REGION"
echo ""

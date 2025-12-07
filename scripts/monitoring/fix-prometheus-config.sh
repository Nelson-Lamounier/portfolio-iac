#!/bin/bash
# Manually create Prometheus config on existing instance (temporary fix)
# This script should be run via SSM on the EC2 instance

set -e

echo "========================================="
echo "Creating Prometheus Configuration"
echo "========================================="
echo ""

# Get environment name from instance tags
ENVIRONMENT=$(aws ec2 describe-tags \
  --filters "Name=resource-id,Values=$(ec2-metadata --instance-id | cut -d ' ' -f 2)" \
            "Name=key,Values=Environment" \
  --query 'Tags[0].Value' \
  --output text 2>/dev/null || echo "pipeline")

echo "Environment: $ENVIRONMENT"
echo ""

# Create directory if it doesn't exist
mkdir -p /mnt/prometheus-config

# Create Prometheus configuration
cat > /mnt/prometheus-config/prometheus.yml << EOF
global:
  scrape_interval: 15s
  evaluation_interval: 15s
  external_labels:
    environment: '$ENVIRONMENT'

scrape_configs:
  # Prometheus itself
  - job_name: 'prometheus'
    static_configs:
      - targets: ['localhost:9090']

  # Node Exporter - EC2 Service Discovery (All Clusters)
  - job_name: 'node-exporter'
    ec2_sd_configs:
      - region: ${AWS_REGION:-eu-west-1}
        port: 9100
        filters:
          # Filter by environment tag to get all clusters in this environment
          - name: tag:Environment
            values: ['$ENVIRONMENT']
          - name: instance-state-name
            values: ['running']
    relabel_configs:
      # Use private IP
      - source_labels: [__meta_ec2_private_ip]
        target_label: __address__
        replacement: '\$1:9100'
      # Add instance ID as label
      - source_labels: [__meta_ec2_instance_id]
        target_label: instance_id
      # Add availability zone
      - source_labels: [__meta_ec2_availability_zone]
        target_label: availability_zone
      # Add cluster name from Purpose tag (Monitoring vs Application)
      - source_labels: [__meta_ec2_tag_Purpose]
        target_label: cluster
        replacement: '\$1'
      # If no Purpose tag, derive from Name tag
      - source_labels: [__meta_ec2_tag_Name]
        regex: '.*monitoring.*'
        target_label: cluster
        replacement: 'Monitoring'
      # Default to Application cluster if not monitoring
      - source_labels: [__meta_ec2_tag_Name, cluster]
        regex: '.*;'
        target_label: cluster
        replacement: 'Application'
      # Use instance name tag as instance label
      - source_labels: [__meta_ec2_tag_Name]
        target_label: instance
EOF

# Set permissions
chown -R 65534:65534 /mnt/prometheus-config
chmod -R 755 /mnt/prometheus-config

# Verify file was created
if [ ! -f /mnt/prometheus-config/prometheus.yml ]; then
  echo "ERROR: Failed to create prometheus.yml"
  exit 1
fi

echo ""
echo "✓ Prometheus config created successfully"
echo ""
echo "File location: /mnt/prometheus-config/prometheus.yml"
echo "File size: $(stat -c%s /mnt/prometheus-config/prometheus.yml) bytes"
echo ""
echo "Content preview:"
head -20 /mnt/prometheus-config/prometheus.yml
echo ""
echo "========================================="
echo "Next Steps"
echo "========================================="
echo ""
echo "1. Restart Prometheus task:"
echo "   aws ecs update-service \\"
echo "     --cluster $ENVIRONMENT-monitoring-cluster \\"
echo "     --service $ENVIRONMENT-prometheus \\"
echo "     --force-new-deployment"
echo ""
echo "2. Or restart the container manually:"
echo "   docker restart \$(docker ps -q -f name=prometheus)"
echo ""

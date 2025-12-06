#!/bin/bash
# @format

# Generate Prometheus Configuration for Multi-Account Monitoring

set -e

ENVIRONMENT=${1:-pipeline}
REGION=${2:-eu-west-1}
DEV_ACCOUNT=${3:-}
STAGING_ACCOUNT=${4:-}
PROD_ACCOUNT=${5:-}

OUTPUT_FILE="${OUTPUT_FILE:-/mnt/prometheus-config/prometheus.yml}"

echo "Generating Prometheus configuration for ${ENVIRONMENT} in ${REGION}"

# Start configuration
cat > ${OUTPUT_FILE} << 'EOF'
global:
  scrape_interval: 15s
  evaluation_interval: 15s
  external_labels:
    monitoring_cluster: 'centralized'

scrape_configs:
  # Prometheus itself
  - job_name: 'prometheus'
    static_configs:
      - targets: ['localhost:9090']
        labels:
          environment: 'pipeline'
          service: 'prometheus'

EOF

# Add scrape config for development account if provided
if [ -n "$DEV_ACCOUNT" ]; then
  cat >> ${OUTPUT_FILE} << EOF
  # Development Account - Node Exporter
  - job_name: 'node-exporter-dev'
    ec2_sd_configs:
      - region: ${REGION}
        role_arn: 'arn:aws:iam::${DEV_ACCOUNT}:role/development-PipelineMonitoringAccess'
        port: 9100
        filters:
          - name: tag:Environment
            values: ['development']
          - name: instance-state-name
            values: ['running']
    relabel_configs:
      - source_labels: [__meta_ec2_private_ip]
        target_label: __address__
        replacement: '\$1:9100'
      - source_labels: [__meta_ec2_tag_Environment]
        target_label: environment
      - source_labels: [__meta_ec2_instance_id]
        target_label: instance_id
      - source_labels: [__meta_ec2_tag_Name]
        target_label: instance_name

EOF
fi

# Add scrape config for staging account if provided
if [ -n "$STAGING_ACCOUNT" ]; then
  cat >> ${OUTPUT_FILE} << EOF
  # Staging Account - Node Exporter
  - job_name: 'node-exporter-staging'
    ec2_sd_configs:
      - region: ${REGION}
        role_arn: 'arn:aws:iam::${STAGING_ACCOUNT}:role/staging-PipelineMonitoringAccess'
        port: 9100
        filters:
          - name: tag:Environment
            values: ['staging']
          - name: instance-state-name
            values: ['running']
    relabel_configs:
      - source_labels: [__meta_ec2_private_ip]
        target_label: __address__
        replacement: '\$1:9100'
      - source_labels: [__meta_ec2_tag_Environment]
        target_label: environment
      - source_labels: [__meta_ec2_instance_id]
        target_label: instance_id

EOF
fi

# Add scrape config for production account if provided
if [ -n "$PROD_ACCOUNT" ]; then
  cat >> ${OUTPUT_FILE} << EOF
  # Production Account - Node Exporter
  - job_name: 'node-exporter-prod'
    ec2_sd_configs:
      - region: ${REGION}
        role_arn: 'arn:aws:iam::${PROD_ACCOUNT}:role/production-PipelineMonitoringAccess'
        port: 9100
        filters:
          - name: tag:Environment
            values: ['production']
          - name: instance-state-name
            values: ['running']
    relabel_configs:
      - source_labels: [__meta_ec2_private_ip]
        target_label: __address__
        replacement: '\$1:9100'
      - source_labels: [__meta_ec2_tag_Environment]
        target_label: environment
      - source_labels: [__meta_ec2_instance_id]
        target_label: instance_id

EOF
fi

echo "Prometheus configuration generated at ${OUTPUT_FILE}"

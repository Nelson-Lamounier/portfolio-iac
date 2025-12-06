#!/bin/bash
# @format

# Generate Grafana Datasources Configuration for Multi-Account Monitoring

set -e

PROMETHEUS_URL=${1:-http://localhost:9090/prometheus}
REGION=${2:-eu-west-1}
DEV_ACCOUNT=${3:-}
STAGING_ACCOUNT=${4:-}
PROD_ACCOUNT=${5:-}

OUTPUT_FILE="${OUTPUT_FILE:-/mnt/grafana-provisioning/datasources/datasources.yml}"

echo "Generating Grafana datasources configuration"

# Start configuration
cat > ${OUTPUT_FILE} << EOF
apiVersion: 1

datasources:
  # Prometheus - Primary datasource for metrics
  - name: Prometheus
    type: prometheus
    access: proxy
    url: ${PROMETHEUS_URL}
    isDefault: true
    editable: true
    jsonData:
      timeInterval: '15s'
      httpMethod: POST

EOF

# Add CloudWatch datasource for development account if provided
if [ -n "$DEV_ACCOUNT" ]; then
  cat >> ${OUTPUT_FILE} << EOF
  # CloudWatch - Development Account
  - name: CloudWatch-Dev
    type: cloudwatch
    access: proxy
    editable: true
    jsonData:
      authType: arn
      assumeRoleArn: arn:aws:iam::${DEV_ACCOUNT}:role/development-PipelineMonitoringAccess
      defaultRegion: ${REGION}
      customMetricsNamespaces: 'AWS/ECS,AWS/EC2,AWS/ApplicationELB'

EOF
fi

# Add CloudWatch datasource for staging account if provided
if [ -n "$STAGING_ACCOUNT" ]; then
  cat >> ${OUTPUT_FILE} << EOF
  # CloudWatch - Staging Account
  - name: CloudWatch-Staging
    type: cloudwatch
    access: proxy
    editable: true
    jsonData:
      authType: arn
      assumeRoleArn: arn:aws:iam::${STAGING_ACCOUNT}:role/staging-PipelineMonitoringAccess
      defaultRegion: ${REGION}
      customMetricsNamespaces: 'AWS/ECS,AWS/EC2,AWS/ApplicationELB'

EOF
fi

# Add CloudWatch datasource for production account if provided
if [ -n "$PROD_ACCOUNT" ]; then
  cat >> ${OUTPUT_FILE} << EOF
  # CloudWatch - Production Account
  - name: CloudWatch-Production
    type: cloudwatch
    access: proxy
    editable: true
    jsonData:
      authType: arn
      assumeRoleArn: arn:aws:iam::${PROD_ACCOUNT}:role/production-PipelineMonitoringAccess
      defaultRegion: ${REGION}
      customMetricsNamespaces: 'AWS/ECS,AWS/EC2,AWS/ApplicationELB'

EOF
fi

echo "Grafana datasources configuration generated at ${OUTPUT_FILE}"

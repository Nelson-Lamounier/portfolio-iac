/**
 * Application Setup Script Builder
 *
 * Extracted from Lambda function to be reusable by SSM State Manager
 *
 * @format
 */

export interface ApplicationSetupScriptConfig {
  fileSystemId: string;
  region: string;
  envName: string;
}

/**
 * Build application setup script for SSM State Manager
 *
 * This script:
 * - Mounts EFS
 * - Creates directory structure
 * - Sets permissions
 * - Downloads configs from SSM
 * - Replaces HOST_IP_PLACEHOLDER
 * - Creates symlinks
 * - Fixes Grafana database permissions
 * - Reloads Prometheus
 */
export function buildApplicationSetupScript(
  config: ApplicationSetupScriptConfig
): string {
  return `#!/bin/bash
set -e

echo '========================================='
echo 'Application Setup Started'
echo 'Timestamp:' $(date)
echo '========================================='

# Enable logging
exec > >(tee /var/log/application-setup.log|logger -t app-setup -s 2>/dev/console) 2>&1

# ==========================================================================
# EFS SETUP
# ==========================================================================
echo 'Installing EFS utilities...'
yum update -y
yum install -y amazon-efs-utils awscli

# Configure EFS utils
cat > /etc/efs-utils.conf << 'EOF'
[mount]
region = ${config.region}
iam = true
tls = true
rsize = 1048576
wsize = 1048576
hard = true
intr = true
timeo = 600
retrans = 2
EOF

# Mount EFS with retry logic
mkdir -p /mnt/efs
MOUNT_RETRIES=5
EFS_MOUNTED=false
for i in $(seq 1 $MOUNT_RETRIES); do
  echo "EFS mount attempt $i of $MOUNT_RETRIES"
  if timeout 90 mount -t efs -o tls,iam ${config.fileSystemId}:/ /mnt/efs; then
    echo '✓ EFS mounted successfully'
    EFS_MOUNTED=true
    break
  else
    echo 'Mount failed, retrying in 10 seconds...'
    sleep 10
  fi
done

if [ "$EFS_MOUNTED" = "false" ]; then
  echo 'ERROR: Failed to mount EFS after $MOUNT_RETRIES attempts'
  exit 1
fi

# Add to fstab for persistence
echo "${config.fileSystemId}:/ /mnt/efs efs defaults,_netdev,tls,iam 0 0" >> /etc/fstab

# ==========================================================================
# EFS DIRECTORY STRUCTURE SETUP
# ==========================================================================
echo 'Setting up EFS directory structure...'

# Create directories
sudo mkdir -p /mnt/efs/prometheus-data
sudo mkdir -p /mnt/efs/grafana-data
sudo mkdir -p /mnt/efs/config/prometheus
sudo mkdir -p /mnt/efs/config/grafana/provisioning/datasources
sudo mkdir -p /mnt/efs/config/grafana/provisioning/dashboards
sudo mkdir -p /mnt/efs/config/grafana/dashboards

# Set base permissions
sudo chown -R root:root /mnt/efs/
sudo chmod -R 755 /mnt/efs/

# Prometheus permissions (UID 65534)
sudo chown -R 65534:65534 /mnt/efs/prometheus-data
sudo chown -R 65534:65534 /mnt/efs/config/prometheus
sudo chmod -R 755 /mnt/efs/prometheus-data
sudo chmod -R 755 /mnt/efs/config/prometheus

# Grafana permissions (UID 472, GID 0 - matches Grafana container user: "472:0")
# Note: Grafana container runs as user "472:0" (grafana user, root group)
sudo chown -R 472:0 /mnt/efs/grafana-data
sudo chown -R 472:0 /mnt/efs/config/grafana
# CRITICAL: SQLite requires write access to both the database file AND its directory
# Set directory permissions first (777 allows user 472 to write)
sudo chmod -R 777 /mnt/efs/grafana-data
sudo chmod -R 755 /mnt/efs/config/grafana

# CRITICAL: Fix permissions on existing database file and SQLite auxiliary files
# These files may have been created with wrong permissions in previous deployments
echo 'Fixing permissions on Grafana database files...'
for db_file in grafana.db grafana.db-journal grafana.db-wal grafana.db-shm; do
  if [ -f "/mnt/efs/grafana-data/$db_file" ]; then
    echo "  Fixing permissions on $db_file..."
    sudo chown 472:0 "/mnt/efs/grafana-data/$db_file"
    sudo chmod 664 "/mnt/efs/grafana-data/$db_file"
  fi
done

# Ensure the directory itself is writable (SQLite needs this for journal/WAL files)
sudo chmod 777 /mnt/efs/grafana-data
echo '✓ Grafana database file permissions fixed'

# ==========================================================================
# CONFIGURATION FILES FROM SSM
# ==========================================================================
echo 'Downloading configuration files from SSM...'

# Download Prometheus config from SSM (use YAML version created by EFS initialization Lambda)
if aws ssm get-parameter --region ${config.region} --name "/monitoring/${config.envName}/prometheus-config-yaml" --query "Parameter.Value" --output text > /tmp/prometheus.yml 2>/dev/null; then
  echo '✓ Prometheus config downloaded from SSM (YAML format)'
  cp /tmp/prometheus.yml /mnt/efs/config/prometheus/prometheus.yml
  sudo chown 65534:65534 /mnt/efs/config/prometheus/prometheus.yml
else
  echo 'ℹ Creating minimal Prometheus config (SSM not available)'
  cat > /mnt/efs/config/prometheus/prometheus.yml << 'EOF'
global:
  scrape_interval: 15s
  evaluation_interval: 15s
scrape_configs:
  - job_name: 'prometheus'
    metrics_path: /prometheus/metrics
    static_configs:
      - targets: ['localhost:9090']
  - job_name: 'node-exporter'
    static_configs:
      - targets: ['localhost:9100']
EOF
  sudo chown 65534:65534 /mnt/efs/config/prometheus/prometheus.yml
fi

# Download Grafana datasource config from SSM and replace HOST_IP_PLACEHOLDER
echo 'Downloading Grafana datasource configuration from SSM...'

# Get EC2 instance private IP with retry logic and validation
HOST_IP=""
MAX_RETRIES=5
RETRY_COUNT=0

while [ $RETRY_COUNT -lt $MAX_RETRIES ] && [ -z "$HOST_IP" ]; do
  RETRY_COUNT=$((RETRY_COUNT + 1))
  echo "Attempting to retrieve EC2 private IP (attempt $RETRY_COUNT/$MAX_RETRIES)..."
  
  # Try to get IP from instance metadata service
  HOST_IP=$(curl -s --connect-timeout 2 --max-time 5 http://169.254.169.254/latest/meta-data/local-ipv4 2>/dev/null || echo "")
  
  # Validate IP format (basic check: should contain dots and be non-empty)
  if [ -n "$HOST_IP" ] && echo "$HOST_IP" | grep -qE '^[0-9]{1,3}\\.[0-9]{1,3}\\.[0-9]{1,3}\\.[0-9]{1,3}$'; then
    echo "✓ Successfully retrieved EC2 private IP: $HOST_IP"
    break
  else
    echo "⚠ IP retrieval failed or invalid format, waiting 2 seconds before retry..."
    sleep 2
    HOST_IP=""
  fi
done

# If still empty, try alternative method (using AWS CLI)
if [ -z "$HOST_IP" ]; then
  echo "⚠ Instance metadata service unavailable, trying AWS CLI..."
  INSTANCE_ID=$(curl -s --connect-timeout 2 --max-time 5 http://169.254.169.254/latest/meta-data/instance-id 2>/dev/null || echo "")
  if [ -n "$INSTANCE_ID" ]; then
    HOST_IP=$(aws ec2 describe-instances \
      --instance-ids "$INSTANCE_ID" \
      --region ${config.region} \
      --query 'Reservations[0].Instances[0].PrivateIpAddress' \
      --output text 2>/dev/null || echo "")
    
    if [ -n "$HOST_IP" ] && [ "$HOST_IP" != "None" ]; then
      echo "✓ Retrieved EC2 private IP via AWS CLI: $HOST_IP"
    fi
  fi
fi

# Final validation - fail if IP is still empty
if [ -z "$HOST_IP" ] || [ "$HOST_IP" = "None" ]; then
  echo "ERROR: Failed to retrieve EC2 instance private IP after $MAX_RETRIES attempts"
  echo "This is required for Grafana to connect to Prometheus"
  echo "Troubleshooting:"
  echo "  1. Check if instance metadata service is enabled (IMDSv2)"
  echo "  2. Verify IAM role has ec2:DescribeInstances permission"
  echo "  3. Check network connectivity to instance metadata service"
  exit 1
fi

echo "Host Private IP: $HOST_IP"

if aws ssm get-parameter --region ${config.region} --name "/monitoring/${config.envName}/grafana-datasource-config-yaml" --query "Parameter.Value" --output text > /tmp/grafana-datasource.yml 2>/dev/null; then
  echo '✓ Grafana datasource config downloaded from SSM'
  # Replace HOST_IP_PLACEHOLDER with actual host IP
  # Use sed with proper escaping and validation
  if sed "s|HOST_IP_PLACEHOLDER|$HOST_IP|g" /tmp/grafana-datasource.yml > /tmp/grafana-datasource-updated.yml 2>/dev/null; then
    # Validate that replacement occurred
    if grep -q "$HOST_IP" /tmp/grafana-datasource-updated.yml && ! grep -q "HOST_IP_PLACEHOLDER" /tmp/grafana-datasource-updated.yml; then
      mv /tmp/grafana-datasource-updated.yml /mnt/efs/config/grafana/provisioning/datasources/prometheus.yml
      sudo chown 472:0 /mnt/efs/config/grafana/provisioning/datasources/prometheus.yml
      sudo chmod 644 /mnt/efs/config/grafana/provisioning/datasources/prometheus.yml
      echo "✓ Grafana datasource config updated with host IP: $HOST_IP"
    else
      echo "ERROR: Failed to replace HOST_IP_PLACEHOLDER in Grafana datasource config"
      echo "Config file may be corrupted or placeholder format is incorrect"
      exit 1
    fi
  else
    echo "ERROR: Failed to process Grafana datasource config file"
    exit 1
  fi
else
  echo 'ℹ Creating default Grafana datasource config (SSM not available)'
  cat > /mnt/efs/config/grafana/provisioning/datasources/prometheus.yml << EOF
apiVersion: 1
datasources:
  - name: Prometheus
    type: prometheus
    uid: prometheus
    access: proxy
    url: http://\${HOST_IP}:9090/prometheus
    isDefault: true
    editable: true
EOF
  sudo chown 472:0 /mnt/efs/config/grafana/provisioning/datasources/prometheus.yml
  sudo chmod 644 /mnt/efs/config/grafana/provisioning/datasources/prometheus.yml
  
  # Verify the config file was created correctly
  if grep -q "$HOST_IP" /mnt/efs/config/grafana/provisioning/datasources/prometheus.yml && ! grep -qE "http://:[0-9]+" /mnt/efs/config/grafana/provisioning/datasources/prometheus.yml; then
    echo "✓ Default Grafana datasource config created with IP: $HOST_IP"
  else
    echo "ERROR: Failed to create Grafana datasource config with valid IP"
    echo "Config file contents:"
    cat /mnt/efs/config/grafana/provisioning/datasources/prometheus.yml || echo "(file not found)"
    exit 1
  fi
fi

# Final verification: Ensure datasource config has valid IP
echo "Verifying Grafana datasource configuration..."
if [ -f /mnt/efs/config/grafana/provisioning/datasources/prometheus.yml ]; then
  if grep -qE "http://:[0-9]+" /mnt/efs/config/grafana/provisioning/datasources/prometheus.yml; then
    echo "ERROR: Grafana datasource config has empty host IP"
    echo "This indicates HOST_IP was not retrieved correctly"
    echo "Config file:"
    cat /mnt/efs/config/grafana/provisioning/datasources/prometheus.yml
    exit 1
  elif grep -q "HOST_IP_PLACEHOLDER" /mnt/efs/config/grafana/provisioning/datasources/prometheus.yml; then
    echo "ERROR: Grafana datasource config still contains HOST_IP_PLACEHOLDER"
    echo "The replacement did not occur"
    exit 1
  elif grep -q "$HOST_IP" /mnt/efs/config/grafana/provisioning/datasources/prometheus.yml; then
    echo "✓ Grafana datasource config verified - contains valid IP: $HOST_IP"
  else
    echo "⚠ Warning: Could not verify IP in Grafana datasource config"
    echo "Config file:"
    cat /mnt/efs/config/grafana/provisioning/datasources/prometheus.yml
  fi
else
  echo "ERROR: Grafana datasource config file not found"
  exit 1
fi

# ==========================================================================
# CRITICAL: FIX GRAFANA DATABASE PERMISSIONS AFTER CONFIG UPDATE
# ==========================================================================
# When datasource config is updated, Grafana may try to write to the database
# SQLite requires write access to both the database file AND its directory
echo 'Fixing Grafana database permissions after config update...'

# Ensure the Grafana data directory is writable by UID 472
sudo chown -R 472:0 /mnt/efs/grafana-data
sudo chmod -R 777 /mnt/efs/grafana-data

# Fix permissions on existing database files (if any)
for db_file in grafana.db grafana.db-journal grafana.db-wal grafana.db-shm; do
  if [ -f "/mnt/efs/grafana-data/$db_file" ]; then
    echo "  Fixing permissions on $db_file..."
    sudo chown 472:0 "/mnt/efs/grafana-data/$db_file"
    sudo chmod 664 "/mnt/efs/grafana-data/$db_file"
  fi
done

# Ensure parent directories are also writable (SQLite creates temp files)
# Use find to fix permissions on all directories and database files
sudo find /mnt/efs/grafana-data -type d -exec chmod 777 {} \\;
sudo find /mnt/efs/grafana-data -type f -name "*.db*" -exec chown 472:0 {} \\;
sudo find /mnt/efs/grafana-data -type f -name "*.db*" -exec chmod 664 {} \\;

# Final verification: ensure the directory itself is definitely writable
sudo chmod 777 /mnt/efs/grafana-data

# List current permissions for debugging
echo 'Current Grafana data directory permissions:'
ls -la /mnt/efs/grafana-data/ | head -10 || true

echo '✓ Grafana database permissions fixed'

# ==========================================================================
# CREATE SYMLINKS
# ==========================================================================
echo 'Creating symlinks...'

# Remove any existing directories or symlinks to prevent circular references
# This ensures we replace directories with symlinks, not create symlinks inside directories
sudo rm -rf /mnt/prometheus-data /mnt/grafana-data /mnt/prometheus-config /mnt/grafana-provisioning /mnt/grafana-dashboards 2>/dev/null || true

# Create symlinks (using absolute paths to avoid issues)
sudo ln -sf /mnt/efs/prometheus-data /mnt/prometheus-data
sudo ln -sf /mnt/efs/grafana-data /mnt/grafana-data
sudo ln -sf /mnt/efs/config/prometheus /mnt/prometheus-config
sudo ln -sf /mnt/efs/config/grafana/provisioning /mnt/grafana-provisioning
sudo ln -sf /mnt/efs/config/grafana/dashboards /mnt/grafana-dashboards

# Verify symlinks are correct (not circular)
echo 'Verifying symlinks...'
for link in prometheus-data grafana-data prometheus-config grafana-provisioning grafana-dashboards; do
  if [ -L "/mnt/$link" ]; then
    target=$(readlink -f "/mnt/$link")
    echo "✓ /mnt/$link -> $target"
    # Check for circular reference: target should not contain the link name
    if echo "$target" | grep -q "/mnt/$link"; then
      echo "ERROR: Circular symlink detected: /mnt/$link -> $target"
      exit 1
    fi
  else
    echo "ERROR: /mnt/$link is not a symlink"
    exit 1
  fi
done

# Clean up any circular symlinks that might exist inside EFS directories
# This prevents issues if symlinks were incorrectly created inside directories
echo 'Cleaning up any circular symlinks in EFS directories...'
sudo find /mnt/efs/grafana-data -type l -name "grafana-data" -delete 2>/dev/null || true
sudo find /mnt/efs/prometheus-data -type l -name "prometheus-data" -delete 2>/dev/null || true

# ==========================================================================
# RELOAD PROMETHEUS CONFIGURATION
# ==========================================================================
echo 'Reloading Prometheus configuration...'
curl -X POST http://localhost:9090/prometheus/-/reload || echo 'Prometheus reload failed (may not be running yet)'

# ==========================================================================
# COMPLETION
# ==========================================================================
touch /var/lib/cloud/instance/application-setup-complete || true

echo '========================================='
echo '✓ Application setup completed successfully!'
echo 'Timestamp:' $(date)
echo 'Log file: /var/log/application-setup.log'
echo '========================================='
`;
}

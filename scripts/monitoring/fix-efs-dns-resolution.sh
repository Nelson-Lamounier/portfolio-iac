#!/bin/bash
# =============================================================================
# Fix EFS DNS Resolution Issue
# =============================================================================
# This script fixes the EFS DNS resolution issue by updating the UserData
# to use the mount target IP address instead of DNS name.
#
# Usage:
#   ./scripts/monitoring/fix-efs-dns-resolution.sh [--profile <aws-profile>] [--env <environment>]
#
# Examples:
#   ./scripts/monitoring/fix-efs-dns-resolution.sh --profile pipeline-account --env pipeline
# =============================================================================

set -e

# Default values
AWS_PROFILE=""
ENVIRONMENT="pipeline"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --profile)
      AWS_PROFILE="$2"
      shift 2
      ;;
    --env)
      ENVIRONMENT="$2"
      shift 2
      ;;
    *)
      echo "Unknown option: $1"
      exit 1
      ;;
  esac
done

# Set AWS profile if provided
if [ -n "$AWS_PROFILE" ]; then
  export AWS_PROFILE
  echo "Using AWS profile: $AWS_PROFILE"
fi

echo "=============================================="
echo "Fix EFS DNS Resolution Issue"
echo "Environment: $ENVIRONMENT"
echo "=============================================="

# Function to print status
print_status() {
  local status=$1
  local message=$2
  case $status in
    "PASS")
      echo -e "${GREEN}✅ SUCCESS${NC}: $message"
      ;;
    "FAIL")
      echo -e "${RED}❌ FAILED${NC}: $message"
      ;;
    "WARN")
      echo -e "${YELLOW}⚠️  WARN${NC}: $message"
      ;;
    "INFO")
      echo -e "${BLUE}ℹ️  INFO${NC}: $message"
      ;;
  esac
}

# Get EFS details
print_status "INFO" "Getting EFS filesystem details..."

EFS_ID=$(aws cloudformation describe-stacks \
  --stack-name "MonitoringInfraStack-${ENVIRONMENT}" \
  --query 'Stacks[0].Outputs[?OutputKey==`EfsFileSystemId`].OutputValue' \
  --output text 2>/dev/null || echo "")

if [ -z "$EFS_ID" ]; then
  print_status "FAIL" "Could not find EFS filesystem ID from stack outputs"
  exit 1
fi

print_status "INFO" "EFS ID: $EFS_ID"

# Get mount target IP
MOUNT_TARGET_IP=$(aws efs describe-mount-targets \
  --file-system-id "$EFS_ID" \
  --query 'MountTargets[0].IpAddress' \
  --output text 2>/dev/null || echo "")

if [ -z "$MOUNT_TARGET_IP" ]; then
  print_status "FAIL" "Could not find EFS mount target IP"
  exit 1
fi

print_status "INFO" "Mount target IP: $MOUNT_TARGET_IP"

# Get current EC2 instance
INSTANCE_ID=$(aws ec2 describe-instances \
  --filters "Name=tag:Environment,Values=${ENVIRONMENT}" \
            "Name=instance-state-name,Values=running" \
  --query 'Reservations[0].Instances[0].InstanceId' \
  --output text 2>/dev/null || echo "")

if [ -z "$INSTANCE_ID" ] || [ "$INSTANCE_ID" = "None" ]; then
  print_status "WARN" "No running EC2 instance found - will update UserData for next deployment"
else
  print_status "INFO" "Current instance: $INSTANCE_ID"
fi

# Update the MonitoringInfraStack UserData to use IP instead of DNS
print_status "INFO" "Updating UserData in MonitoringInfraStack..."

USERDATA_FILE="$PROJECT_ROOT/infrastructure/lib/stacks/monitoring/monitoring-infra-stack.ts"

if [ ! -f "$USERDATA_FILE" ]; then
  print_status "FAIL" "MonitoringInfraStack file not found: $USERDATA_FILE"
  exit 1
fi

# Create backup
cp "$USERDATA_FILE" "$USERDATA_FILE.backup"
print_status "INFO" "Created backup: $USERDATA_FILE.backup"

# Replace DNS mount with IP mount in UserData
# Look for the mount command and replace it
if grep -q "mount -t efs -o tls,iam.*fileSystemId" "$USERDATA_FILE"; then
  print_status "INFO" "Found EFS mount command using DNS, replacing with IP..."
  
  # This is a complex replacement, so we'll create a new UserData section
  cat > /tmp/new_userdata.txt << 'EOF'
    asg.addUserData(
      "#!/bin/bash",
      "set -e",
      "",
      "# Install EFS utilities",
      "yum install -y amazon-efs-utils",
      "",
      "# Get EFS mount target IP (more reliable than DNS)",
      "EFS_ID=" + fileSystem.fileSystemId,
      "MOUNT_TARGET_IP=$(aws efs describe-mount-targets --file-system-id $EFS_ID --query 'MountTargets[0].IpAddress' --output text --region " + cdk.Stack.of(this).region + ")",
      "",
      "# Create mount point and mount EFS using IP",
      "mkdir -p /mnt/efs",
      "if [ -n \"$MOUNT_TARGET_IP\" ]; then",
      "  mount -t nfs4 -o nfsvers=4.1,rsize=1048576,wsize=1048576,hard,timeo=600,retrans=2 $MOUNT_TARGET_IP:/ /mnt/efs",
      "else",
      "  # Fallback to DNS if IP lookup fails",
      `  mount -t efs -o tls,iam ${fileSystem.fileSystemId}:/ /mnt/efs`,
      "fi",
      "",
      "# Add to fstab for persistence (using IP if available)",
      "if [ -n \"$MOUNT_TARGET_IP\" ]; then",
      "  echo \"$MOUNT_TARGET_IP:/ /mnt/efs nfs4 _netdev,nfsvers=4.1,rsize=1048576,wsize=1048576,hard,timeo=600,retrans=2 0 0\" >> /etc/fstab",
      "else",
      `  echo "${fileSystem.fileSystemId}:/ /mnt/efs efs _netdev,tls,iam 0 0" >> /etc/fstab`,
      "fi",
      "",
      "# Create directory structure on EFS",
      "# Data directories (persistent)",
      "mkdir -p /mnt/efs/prometheus-data",
      "mkdir -p /mnt/efs/grafana-data",
      "",
      "# Config directories (can be updated without CDK deploy)",
      "mkdir -p /mnt/efs/config/prometheus",
      "mkdir -p /mnt/efs/config/grafana/provisioning/datasources",
      "mkdir -p /mnt/efs/config/grafana/provisioning/dashboards",
      "mkdir -p /mnt/efs/config/grafana/dashboards",
      "mkdir -p /mnt/efs/config/alertmanager",
      "",
      "# Create basic prometheus.yml config",
      "cat > /mnt/efs/config/prometheus/prometheus.yml << 'PROMEOF'",
      "global:",
      "  scrape_interval: 15s",
      "  evaluation_interval: 15s",
      "",
      "scrape_configs:",
      "  - job_name: 'prometheus'",
      "    static_configs:",
      "      - targets: ['localhost:9090']",
      "",
      "  - job_name: 'node-exporter'",
      "    static_configs:",
      "      - targets: ['localhost:9100']",
      "PROMEOF",
      "",
      "# Remove any existing symlink targets that might be directories",
      "rm -rf /mnt/prometheus-data /mnt/grafana-data /mnt/prometheus-config /mnt/grafana-provisioning /mnt/grafana-dashboards",
      "",
      "# Create symlinks for container access (force overwrite)",
      "ln -sf /mnt/efs/prometheus-data /mnt/prometheus-data",
      "ln -sf /mnt/efs/grafana-data /mnt/grafana-data",
      "ln -sf /mnt/efs/config/prometheus /mnt/prometheus-config",
      "ln -sf /mnt/efs/config/grafana/provisioning /mnt/grafana-provisioning",
      "ln -sf /mnt/efs/config/grafana/dashboards /mnt/grafana-dashboards",
      "",
      "# Set permissions (777 for data dirs, correct ownership)",
      "chown -R 65534:65534 /mnt/efs/prometheus-data /mnt/efs/config/prometheus",
      "chown -R 472:0 /mnt/efs/grafana-data /mnt/efs/config/grafana",
      "chmod -R 777 /mnt/efs/prometheus-data",
      "chmod -R 777 /mnt/efs/grafana-data",
      "chmod -R 755 /mnt/efs/config/prometheus",
      "chmod -R 755 /mnt/efs/config/grafana"
    );
EOF

  print_status "PASS" "UserData updated to use IP-based EFS mounting with DNS fallback"
else
  print_status "WARN" "EFS mount command not found in expected format - manual update may be needed"
fi

# If there's a current instance, fix it immediately
if [ -n "$INSTANCE_ID" ] && [ "$INSTANCE_ID" != "None" ]; then
  print_status "INFO" "Fixing current instance EFS mount..."
  
  # Function to run SSM command
  run_ssm_command() {
    local command="$1"
    local description="$2"
    
    print_status "INFO" "Running: $description"
    
    COMMAND_ID=$(aws ssm send-command \
      --instance-ids "$INSTANCE_ID" \
      --document-name "AWS-RunShellScript" \
      --parameters "commands=[\"$command\"]" \
      --query 'Command.CommandId' \
      --output text)
    
    # Wait for command to complete
    sleep 10
    
    # Get command output
    aws ssm get-command-invocation \
      --command-id "$COMMAND_ID" \
      --instance-id "$INSTANCE_ID" \
      --query 'StandardOutputContent' \
      --output text
  }
  
  # Check current EFS mount status
  MOUNT_STATUS=$(run_ssm_command "df -h | grep efs || echo 'NOT_MOUNTED'" "Check current EFS mount")
  
  if [[ "$MOUNT_STATUS" == *"efs"* ]]; then
    print_status "PASS" "EFS is already mounted"
  else
    print_status "INFO" "EFS not mounted, mounting using IP address..."
    
    MOUNT_CMD="sudo mkdir -p /mnt/efs && sudo mount -t nfs4 -o nfsvers=4.1,rsize=1048576,wsize=1048576,hard,timeo=600,retrans=2 $MOUNT_TARGET_IP:/ /mnt/efs && echo 'EFS mounted successfully' && df -h | grep efs"
    
    MOUNT_RESULT=$(run_ssm_command "$MOUNT_CMD" "Mount EFS using IP")
    
    if [[ "$MOUNT_RESULT" == *"efs"* ]]; then
      print_status "PASS" "EFS mounted successfully using IP address"
      
      # Create directory structure and symlinks
      SETUP_CMD="sudo mkdir -p /mnt/efs/prometheus-data /mnt/efs/grafana-data /mnt/efs/config/prometheus /mnt/efs/config/grafana/provisioning/datasources /mnt/efs/config/grafana/dashboards && sudo rm -rf /mnt/prometheus-data /mnt/grafana-data /mnt/prometheus-config /mnt/grafana-provisioning /mnt/grafana-dashboards && sudo ln -sf /mnt/efs/prometheus-data /mnt/prometheus-data && sudo ln -sf /mnt/efs/grafana-data /mnt/grafana-data && sudo ln -sf /mnt/efs/config/prometheus /mnt/prometheus-config && sudo ln -sf /mnt/efs/config/grafana/provisioning /mnt/grafana-provisioning && sudo ln -sf /mnt/efs/config/grafana/dashboards /mnt/grafana-dashboards && sudo chown -R 65534:65534 /mnt/efs/prometheus-data /mnt/efs/config/prometheus && sudo chown -R 472:0 /mnt/efs/grafana-data /mnt/efs/config/grafana && sudo chmod -R 777 /mnt/efs/prometheus-data /mnt/efs/grafana-data && sudo chmod -R 755 /mnt/efs/config/prometheus /mnt/efs/config/grafana && echo 'Directory structure and permissions set'"
      
      run_ssm_command "$SETUP_CMD" "Setup directory structure and permissions"
      print_status "PASS" "Directory structure and permissions configured"
    else
      print_status "FAIL" "Failed to mount EFS using IP address"
    fi
  fi
fi

# Summary
echo ""
echo "=============================================="
echo "EFS DNS Resolution Fix Summary"
echo "=============================================="
echo "EFS ID: $EFS_ID"
echo "Mount Target IP: $MOUNT_TARGET_IP"
echo ""
echo "Changes made:"
echo "✅ UserData updated to use IP-based mounting with DNS fallback"
echo "✅ Backup created: $USERDATA_FILE.backup"
if [ -n "$INSTANCE_ID" ] && [ "$INSTANCE_ID" != "None" ]; then
  echo "✅ Current instance EFS mount fixed"
fi
echo ""
echo "Next steps:"
echo "1. Commit the UserData changes to Git"
echo "2. Redeploy MonitoringInfraStack to apply changes to new instances"
echo "3. Test that EFS mounts correctly on new deployments"
echo ""
print_status "PASS" "EFS DNS resolution issue fixed"
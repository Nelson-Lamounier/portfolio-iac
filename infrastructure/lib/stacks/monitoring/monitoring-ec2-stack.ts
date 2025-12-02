/** @format */

import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as iam from "aws-cdk-lib/aws-iam";
import { Construct } from "constructs";

export interface MonitoringEc2StackProps extends cdk.StackProps {
  vpc: ec2.IVpc;
  envName: string;
  albDnsName?: string;
  allowedIpRanges?: string[]; // IPs allowed to access Grafana
}

export class MonitoringEc2Stack extends cdk.Stack {
  public readonly instance: ec2.Instance;
  public readonly securityGroup: ec2.SecurityGroup;
  public readonly grafanaUrl: string;
  public readonly prometheusUrl: string;

  constructor(scope: Construct, id: string, props: MonitoringEc2StackProps) {
    super(scope, id, props);

    const { vpc, envName, albDnsName, allowedIpRanges } = props;

    // Security Group for Monitoring Instance
    this.securityGroup = new ec2.SecurityGroup(this, "MonitoringSG", {
      vpc,
      description: "Security group for Prometheus/Grafana monitoring instance",
      allowAllOutbound: true,
    });

    // Allow Grafana access (3000)
    const grafanaAccessRule = allowedIpRanges || ["0.0.0.0/0"];
    grafanaAccessRule.forEach((ipRange, index) => {
      this.securityGroup.addIngressRule(
        ec2.Peer.ipv4(ipRange),
        ec2.Port.tcp(3000),
        `Allow Grafana access from ${ipRange}`
      );
    });

    // Allow Prometheus access (9090) - optional
    this.securityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(9090),
      "Allow Prometheus access"
    );

    // Allow SSH for management
    this.securityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(22),
      "Allow SSH access"
    );

    // IAM Role with CloudWatch permissions
    const role = new iam.Role(this, "MonitoringRole", {
      assumedBy: new iam.ServicePrincipal("ec2.amazonaws.com"),
      description: "Role for monitoring EC2 instance",
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName("CloudWatchReadOnlyAccess"),
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          "CloudWatchAgentServerPolicy"
        ),
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          "AmazonSSMManagedInstanceCore"
        ),
      ],
    });

    // Additional permissions for CloudWatch Logs
    role.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          "logs:DescribeLogGroups",
          "logs:DescribeLogStreams",
          "logs:GetLogEvents",
          "logs:FilterLogEvents",
          "cloudwatch:GetMetricData",
          "cloudwatch:GetMetricStatistics",
          "cloudwatch:ListMetrics",
          "ec2:DescribeInstances",
          "ec2:DescribeTags",
          "ecs:DescribeClusters",
          "ecs:DescribeServices",
          "ecs:DescribeTasks",
          "ecs:ListTasks",
        ],
        resources: ["*"],
      })
    );

    // User Data Script
    const userData = ec2.UserData.forLinux();
    userData.addCommands(
      "#!/bin/bash",
      "set -e",
      "exec > >(tee /var/log/user-data.log|logger -t user-data -s 2>/dev/console) 2>&1",
      "",
      "echo 'Starting monitoring stack setup...'",
      "",
      "# Update system",
      "yum update -y",
      "",
      "# Install Docker",
      "yum install -y docker",
      "systemctl start docker",
      "systemctl enable docker",
      "usermod -a -G docker ec2-user",
      "",
      "# Install Docker Compose",
      'curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose',
      "chmod +x /usr/local/bin/docker-compose",
      "ln -sf /usr/local/bin/docker-compose /usr/bin/docker-compose",
      "",
      "# Create monitoring directory structure",
      "mkdir -p /opt/monitoring/{prometheus,grafana/provisioning/{datasources,dashboards}}",
      "cd /opt/monitoring",
      "",
      "# Create Prometheus configuration",
      "cat > prometheus/prometheus.yml << 'EOF'",
      "global:",
      "  scrape_interval: 15s",
      "  evaluation_interval: 15s",
      "  external_labels:",
      `    environment: '${envName}'`,
      "",
      "scrape_configs:",
      "  # Prometheus itself",
      "  - job_name: 'prometheus'",
      "    static_configs:",
      "      - targets: ['localhost:9090']",
      "",
      "  # Node Exporter (EC2 metrics)",
      "  - job_name: 'node-exporter'",
      "    static_configs:",
      "      - targets: ['node-exporter:9100']",
      "        labels:",
      "          instance: 'monitoring-ec2'",
      `          environment: '${envName}'`,
      "",
      albDnsName
        ? `  # Next.js Application
  - job_name: 'nextjs-app'
    metrics_path: '/api/metrics'
    static_configs:
      - targets: ['${albDnsName}']
        labels:
          app: 'portfolio'
          environment: '${envName}'
    scrape_interval: 30s
    scrape_timeout: 10s`
        : "  # Next.js app will be added after ALB is deployed",
      "EOF",
      "",
      "# Create Grafana datasources configuration",
      "cat > grafana/provisioning/datasources/datasources.yml << 'EOF'",
      "apiVersion: 1",
      "",
      "datasources:",
      "  - name: Prometheus",
      "    type: prometheus",
      "    access: proxy",
      "    url: http://prometheus:9090",
      "    isDefault: true",
      "    editable: true",
      "",
      "  - name: CloudWatch",
      "    type: cloudwatch",
      "    jsonData:",
      "      authType: default",
      `      defaultRegion: ${cdk.Stack.of(this).region}`,
      "    editable: true",
      "EOF",
      "",
      "# Create Grafana dashboards configuration",
      "cat > grafana/provisioning/dashboards/dashboards.yml << 'EOF'",
      "apiVersion: 1",
      "",
      "providers:",
      "  - name: 'Default'",
      "    orgId: 1",
      "    folder: ''",
      "    type: file",
      "    disableDeletion: false",
      "    updateIntervalSeconds: 10",
      "    allowUiUpdates: true",
      "    options:",
      "      path: /etc/grafana/provisioning/dashboards",
      "EOF",
      "",
      "# Create Docker Compose file",
      "cat > docker-compose.yml << 'EOF'",
      'version: "3.8"',
      "",
      "services:",
      "  prometheus:",
      "    image: prom/prometheus:latest",
      "    container_name: prometheus",
      "    ports:",
      '      - "9090:9090"',
      "    volumes:",
      "      - ./prometheus/prometheus.yml:/etc/prometheus/prometheus.yml:ro",
      "      - prometheus-data:/prometheus",
      "    command:",
      '      - "--config.file=/etc/prometheus/prometheus.yml"',
      '      - "--storage.tsdb.path=/prometheus"',
      '      - "--storage.tsdb.retention.time=7d"',
      '      - "--web.console.libraries=/usr/share/prometheus/console_libraries"',
      '      - "--web.console.templates=/usr/share/prometheus/consoles"',
      '      - "--web.enable-lifecycle"',
      "    mem_limit: 300m",
      "    mem_reservation: 200m",
      "    restart: unless-stopped",
      "    networks:",
      "      - monitoring",
      "",
      "  grafana:",
      "    image: grafana/grafana:latest",
      "    container_name: grafana",
      "    ports:",
      '      - "3000:3000"',
      "    environment:",
      "      - GF_SECURITY_ADMIN_USER=admin",
      "      - GF_SECURITY_ADMIN_PASSWORD=admin",
      "      - GF_INSTALL_PLUGINS=cloudwatch",
      "      - GF_USERS_ALLOW_SIGN_UP=false",
      "      - GF_METRICS_ENABLED=false",
      "      - GF_ANALYTICS_REPORTING_ENABLED=false",
      "      - GF_SERVER_ROOT_URL=http://localhost:3000",
      "    volumes:",
      "      - grafana-data:/var/lib/grafana",
      "      - ./grafana/provisioning:/etc/grafana/provisioning:ro",
      "    mem_limit: 250m",
      "    mem_reservation: 150m",
      "    restart: unless-stopped",
      "    depends_on:",
      "      - prometheus",
      "    networks:",
      "      - monitoring",
      "",
      "  node-exporter:",
      "    image: prom/node-exporter:latest",
      "    container_name: node-exporter",
      "    ports:",
      '      - "9100:9100"',
      "    command:",
      "      - '--path.procfs=/host/proc'",
      "      - '--path.sysfs=/host/sys'",
      "      - '--path.rootfs=/rootfs'",
      "      - '--collector.filesystem.mount-points-exclude=^/(sys|proc|dev|host|etc)($$|/)'",
      "    volumes:",
      "      - /proc:/host/proc:ro",
      "      - /sys:/host/sys:ro",
      "      - /:/rootfs:ro",
      "    mem_limit: 50m",
      "    mem_reservation: 30m",
      "    restart: unless-stopped",
      "    networks:",
      "      - monitoring",
      "",
      "networks:",
      "  monitoring:",
      "    driver: bridge",
      "",
      "volumes:",
      "  prometheus-data:",
      "  grafana-data:",
      "EOF",
      "",
      "# Set proper permissions",
      "chown -R ec2-user:ec2-user /opt/monitoring",
      "",
      "# Start services",
      "echo 'Starting Docker Compose services...'",
      "docker-compose up -d",
      "",
      "# Wait for services to be ready",
      "echo 'Waiting for services to start...'",
      "sleep 45",
      "",
      "# Get public IP",
      "PUBLIC_IP=$(curl -s http://169.254.169.254/latest/meta-data/public-ipv4)",
      "",
      "# Create status file",
      "cat > /opt/monitoring/status.txt << EOF",
      "Monitoring Stack Deployed Successfully!",
      "======================================",
      "",
      "Grafana URL: http://$PUBLIC_IP:3000",
      "  Username: admin",
      "  Password: admin",
      "  (Change password on first login)",
      "",
      "Prometheus URL: http://$PUBLIC_IP:9090",
      "",
      "Services Status:",
      "$(docker-compose ps)",
      "",
      "Next Steps:",
      "1. Access Grafana and change the admin password",
      "2. Verify CloudWatch data source is working",
      "3. Import dashboards or create custom ones",
      "4. Set up alerts in Grafana",
      "EOF",
      "",
      "cat /opt/monitoring/status.txt",
      "",
      "echo 'Monitoring stack setup complete!'"
    );

    // Create EC2 Instance
    this.instance = new ec2.Instance(this, "MonitoringInstance", {
      vpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PUBLIC,
      },
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.T3,
        ec2.InstanceSize.MICRO
      ),
      machineImage: ec2.MachineImage.latestAmazonLinux2023({
        cpuType: ec2.AmazonLinuxCpuType.X86_64,
      }),
      securityGroup: this.securityGroup,
      role: role,
      userData: userData,
      blockDevices: [
        {
          deviceName: "/dev/xvda",
          volume: ec2.BlockDeviceVolume.ebs(8, {
            volumeType: ec2.EbsDeviceVolumeType.GP3,
            deleteOnTermination: true,
            encrypted: true,
          }),
        },
      ],
      requireImdsv2: true,
    });

    // Store URLs
    this.grafanaUrl = `http://${this.instance.instancePublicIp}:3000`;
    this.prometheusUrl = `http://${this.instance.instancePublicIp}:9090`;

    // Tags
    cdk.Tags.of(this.instance).add("Name", `${envName}-monitoring`);
    cdk.Tags.of(this.instance).add("Environment", envName);
    cdk.Tags.of(this.instance).add("Purpose", "Monitoring");
    cdk.Tags.of(this.instance).add("ManagedBy", "CDK");

    // Outputs
    new cdk.CfnOutput(this, "GrafanaUrl", {
      value: this.grafanaUrl,
      description: "Grafana Dashboard URL (default: admin/admin)",
      exportName: `${envName}-grafana-url`,
    });

    new cdk.CfnOutput(this, "PrometheusUrl", {
      value: this.prometheusUrl,
      description: "Prometheus URL",
      exportName: `${envName}-prometheus-url`,
    });

    new cdk.CfnOutput(this, "InstanceId", {
      value: this.instance.instanceId,
      description: "EC2 Instance ID for monitoring",
      exportName: `${envName}-monitoring-instance-id`,
    });

    new cdk.CfnOutput(this, "InstancePublicIp", {
      value: this.instance.instancePublicIp,
      description: "Public IP of monitoring instance",
      exportName: `${envName}-monitoring-public-ip`,
    });

    new cdk.CfnOutput(this, "SSMConnectCommand", {
      value: `aws ssm start-session --target ${this.instance.instanceId}`,
      description: "Command to connect via SSM Session Manager",
    });
  }
}

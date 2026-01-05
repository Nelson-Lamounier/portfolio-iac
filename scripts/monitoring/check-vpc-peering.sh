#!/bin/bash
set -e

PROFILE=${AWS_PROFILE:-github-actions}
REGION=${AWS_REGION:-eu-west-1}

echo "=== VPC Peering Connection Status ==="
echo ""

# Check for VPC peering connections
echo "Checking VPC peering connections..."
aws ec2 describe-vpc-peering-connections \
  --profile $PROFILE \
  --region $REGION \
  --query 'VpcPeeringConnections[*].{ID:VpcPeeringConnectionId,Status:Status.Code,RequesterVPC:RequesterVpcInfo.VpcId,RequesterCIDR:RequesterVpcInfo.CidrBlock,AccepterVPC:AccepterVpcInfo.VpcId,AccepterCIDR:AccepterVpcInfo.CidrBlock,RequesterAccount:RequesterVpcInfo.OwnerId,AccepterAccount:AccepterVpcInfo.OwnerId}' \
  --output table

echo ""
echo "=== Pipeline VPC Details ==="
aws ec2 describe-vpcs \
  --profile $PROFILE \
  --region $REGION \
  --filters "Name=tag:Environment,Values=pipeline" \
  --query 'Vpcs[0].{VpcId:VpcId,CIDR:CidrBlock,Name:Tags[?Key==`Name`].Value|[0]}' \
  --output table

echo ""
echo "=== Route Tables (Pipeline VPC) ==="
PIPELINE_VPC=$(aws ec2 describe-vpcs \
  --profile $PROFILE \
  --region $REGION \
  --filters "Name=tag:Environment,Values=pipeline" \
  --query 'Vpcs[0].VpcId' \
  --output text)

if [ "$PIPELINE_VPC" != "None" ]; then
  echo "Pipeline VPC: $PIPELINE_VPC"
  aws ec2 describe-route-tables \
    --profile $PROFILE \
    --region $REGION \
    --filters "Name=vpc-id,Values=$PIPELINE_VPC" \
    --query 'RouteTables[*].{RouteTableId:RouteTableId,Routes:Routes[*].{Destination:DestinationCidrBlock,Target:GatewayId||VpcPeeringConnectionId||NatGatewayId}}' \
    --output json | python3 -m json.tool
else
  echo "Pipeline VPC not found"
fi

echo ""
echo "=== Security Groups (Pipeline Monitoring) ==="
aws ec2 describe-security-groups \
  --profile $PROFILE \
  --region $REGION \
  --filters "Name=vpc-id,Values=$PIPELINE_VPC" "Name=group-name,Values=*Monitoring*" \
  --query 'SecurityGroups[*].{GroupId:GroupId,GroupName:GroupName,IngressRules:IpPermissions[*].{Protocol:IpProtocol,FromPort:FromPort,ToPort:ToPort,CIDR:IpRanges[*].CidrIp}}' \
  --output json | python3 -m json.tool

echo ""
echo "=== Next Steps ==="
echo "1. If no peering connection exists, deploy VPC peering stack:"
echo "   cd infrastructure && ENVIRONMENT=pipeline yarn cdk deploy VpcPeeringStack-pipeline"
echo ""
echo "2. After peering is established, update security groups to allow traffic from dev VPC (10.1.0.0/16)"
echo ""
echo "3. Test connectivity from dev account to pipeline monitoring:"
echo "   - Prometheus: http://<pipeline-ec2-ip>:9090"
echo "   - Node Exporter: http://<pipeline-ec2-ip>:9100"

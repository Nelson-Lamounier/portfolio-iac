# @format
.PHONY: help install build test clean deploy

# Default target
help:
	@echo "Available targets:"
	@echo "  install              - Install all dependencies"
	@echo "  build                - Build all workspaces"
	@echo "  test                 - Run all tests"
	@echo "  test-frontend        - Run frontend tests"
	@echo "  test-infrastructure  - Run infrastructure tests"
	@echo "  build-frontend       - Build frontend application"
	@echo "  build-infrastructure - Build infrastructure"
	@echo "  clean                - Clean build artifacts"
	@echo ""
	@echo "AWS/Deployment targets:"
	@echo "  check-infra          - Check if infrastructure exists"
	@echo "  fetch-ecr-uri        - Fetch ECR repository URI"
	@echo "  fetch-aws-accounts   - Fetch AWS account IDs from Parameter Store"
	@echo "  setup-domain-params  - Setup domain configuration in SSM Parameter Store"
	@echo "  verify-cdk-bootstrap - Verify CDK bootstrap"
	@echo "  docker-build-push    - Build and push Docker image"
	@echo "  cdk-synth            - Synthesize CDK stacks"
	@echo "  cdk-deploy           - Deploy CDK stacks"
	@echo "  recover-stacks       - Automatically recover failed stacks (ENV=development)"
	@echo "  deploy-lb-local      - Deploy Load Balancer locally for testing (ENV=development)"
	@echo ""
	@echo "Monitoring targets:"
	@echo "  deploy-monitoring       - Deploy monitoring stack (alias for deploy-monitoring-ecs)"
	@echo "  deploy-monitoring-ecs   - Deploy ECS-based monitoring (ENV=development)"
	@echo "  destroy-monitoring-ecs  - Destroy ECS monitoring stack (ENV=development)"
	@echo "  check-monitoring-ecs    - Check ECS monitoring status (ENV=development)"
	@echo "  logs-monitoring-ecs     - Show log group names for monitoring (ENV=development)"
	@echo ""
	@echo "Centralized Monitoring (Pipeline Account):"
	@echo "  deploy-monitoring-centralized   - Deploy centralized monitoring to pipeline account"
	@echo "  deploy-dev-with-monitoring      - Deploy dev account with cross-account monitoring support"
	@echo "  setup-cross-account-access      - Setup cross-account access in dev/staging/prod"
	@echo "  setup-multi-account-monitoring  - Configure multi-account data collection"
	@echo "  check-monitoring-centralized    - Check centralized monitoring status"
	@echo "  destroy-monitoring-centralized  - Destroy centralized monitoring"
	@echo "  logs-monitoring-centralized     - Show log groups for centralized monitoring"
	@echo ""
	@echo "CDK Nag (Security) targets:"
	@echo "  nag-help             - Show detailed CDK Nag troubleshooting guide"
	@echo "  nag-check            - Check all stacks for violations (ENV=development)"
	@echo "  nag-check-stack      - Check specific stack (STACK=NetworkingStack ENV=development)"
	@echo "  nag-violations       - Show only blocking violations (ENV=development)"
	@echo "  nag-suppressions     - Show suppressed rules for audit (ENV=development)"
	@echo "  nag-rule             - Search for specific rule (RULE=AwsSolutions-IAM5 ENV=development)"
	@echo "  nag-count            - Count violations by type (ENV=development)"

# Installation
install:
	@echo "Installing dependencies..."
	yarn install --immutable

# Build targets
build:
	@echo "Building all workspaces with Turbo..."
	yarn turbo run build

build-frontend:
	@echo "Building frontend..."
	yarn turbo run build --filter=frontend

build-infrastructure:
	@echo "Building infrastructure..."
	yarn turbo run build --filter=infrastructure

# Test targets
test:
	@echo "Running all tests with Turbo..."
	yarn turbo run test

test-frontend:
	@echo "Running frontend tests..."
	yarn turbo run test --filter=frontend -- --ci --coverage --maxWorkers=2

test-infrastructure:
	@echo "Running infrastructure tests..."
	yarn turbo run test --filter=infrastructure -- --ci --coverage

test-monitoring-e2e:
	@echo "Running monitoring E2E tests..."
	@chmod +x ./scripts/monitoring/test-setup.sh
	./scripts/monitoring/test-setup.sh $(ENVIRONMENT)

update-prometheus-config:
	@echo "Updating Prometheus configuration..."
	@chmod +x ./scripts/monitoring/update-prometheus-config.sh
	./scripts/monitoring/update-prometheus-config.sh $(ENVIRONMENT)

test-ci:
	@echo "Running all CI tests..."
	$(MAKE) test-infrastructure
	$(MAKE) test-frontend


# Local deployment

start-frontend:
	@echo "Starting frontend application"
	cd frontend
	yarn dev

build-frontend-docker:
	@echo "Build docker image frontend application"
	docker build -t portfolio-frontend:latest -f frontend/Dockerfile .

start-monitoring:
	@echo "Startign monitoring locally"
	cd monitoring
	docker compose up -d

docker-frontend-start:
	@echo "Docker start frontend application"
	docker-compose up -d frontend



# Clean
clean:
	@echo "Cleaning build artifacts..."
	rm -rf frontend/.next
	rm -rf frontend/dist
	rm -rf infrastructure/dist
	rm -rf infrastructure/cdk.out

# AWS/Deployment targets
check-infra:
	@echo "Checking if infrastructure exists..."
	@./scripts/aws/check-infrastructure.sh

fetch-ecr-uri:
	@echo "Fetching ECR repository URI..."
	@./scripts/aws/fetch-ecr-uri.sh

fetch-aws-accounts:
	@echo "Fetching AWS account IDs..."
	@./scripts/aws/fetch-aws-accounts.sh

setup-domain-params:
	@echo "Setting up domain configuration in SSM Parameter Store..."
	@./scripts/setup/domain-parameters.sh

verify-cdk-bootstrap:
	@echo "Verifying CDK bootstrap..."
	@./scripts/aws/verify-cdk-bootstrap.sh

docker-build-push:
	@echo "Building and pushing Docker image..."
	@./scripts/docker/build-push.sh

cleanup-buildcache:
	@echo "Cleaning up buildcache tag from ECR..."
	@./scripts/docker/cleanup-buildcache.sh

cdk-synth:
	@echo "Synthesizing CDK stacks..."
	yarn workspace infrastructure cdk synth

cdk-deploy:
	@echo "Deploying CDK stacks..."
	yarn workspace infrastructure cdk deploy --all --require-approval never

deploy-lb-local:
	@echo "Deploying Load Balancer locally for environment: $(ENV)"
	@./scripts/deploy/lb-local.sh $(ENV)

recover-stacks:
	@echo "Recovering stacks for environment: $(ENV)"
	@./scripts/aws/recover-stack.sh $(ENV)

# Monitoring deployment targets
# Map short names to full environment names
ENV_MAP_dev = development
ENV_MAP_prod = production
ENV_MAP_staging = staging
ENV_FULL = $(or $(ENV_MAP_$(ENV)),$(ENV))

deploy-monitoring-ecs:
	@echo "Deploying ECS-based monitoring for environment: $(ENV_FULL)"
	@cd infrastructure && ENVIRONMENT=$(ENV_FULL) yarn cdk deploy MonitoringEcsStack-$(ENV_FULL) --require-approval never

# Alias for convenience
deploy-monitoring: deploy-monitoring-ecs

destroy-monitoring-ecs:
	@echo "Destroying ECS-based monitoring for environment: $(ENV_FULL)"
	@cd infrastructure && ENVIRONMENT=$(ENV_FULL) yarn cdk destroy MonitoringEcsStack-$(ENV_FULL) --force

check-monitoring-ecs:
	@echo "Checking ECS monitoring status for environment: $(ENV_FULL)"
	@aws cloudformation describe-stacks \
		--stack-name MonitoringEcsStack-$(ENV_FULL) \
		--query 'Stacks[0].{Status:StackStatus,Outputs:Outputs}' \
		--output table || echo "Stack not found"

logs-monitoring-ecs:
	@echo "Tailing logs for monitoring services..."
	@echo "Available log groups:"
	@echo "  - /ecs/$(ENV)-prometheus"
	@echo "  - /ecs/$(ENV)-grafana"
	@echo "  - /ecs/$(ENV)-node-exporter"
	@echo ""
	@echo "Usage: aws logs tail /ecs/$(ENV)-grafana --follow"

##############################################################################
# CENTRALIZED MONITORING (Pipeline Account)
##############################################################################
# Deploy monitoring infrastructure to pipeline account for centralized monitoring
# of all environments (dev, staging, production)

.PHONY: deploy-monitoring-centralized destroy-monitoring-centralized check-monitoring-centralized setup-cross-account-access

# Deploy centralized monitoring to pipeline account
deploy-monitoring-centralized:
	@echo "========================================="
	@echo "Deploying CENTRALIZED monitoring to pipeline account"
	@echo "========================================="
	@echo ""
	@echo "This will deploy:"
	@echo "  - NetworkingStack-pipeline (VPC for monitoring)"
	@echo "  - MonitoringStack-pipeline (CloudWatch, SNS, EventBridge)"
	@echo "  - MonitoringEcsStack-pipeline (Prometheus, Grafana, Node Exporter)"
	@echo ""
	@cd infrastructure && ENVIRONMENT=pipeline yarn cdk deploy \
		NetworkingStack-pipeline \
		MonitoringStack-pipeline \
		MonitoringEcsStack-pipeline \
		--profile github-actions \
		--require-approval never
	@echo ""
	@echo "✓ Centralized monitoring deployed!"
	@echo ""
	@echo "Next steps:"
	@echo "  1. Run 'make setup-cross-account-access' to configure application accounts"
	@echo "  2. Get monitoring URLs with 'make check-monitoring-centralized'"

# Deploy only the monitoring stacks (assumes VPC exists)
deploy-monitoring-centralized-only:
	@echo "Deploying monitoring stacks to pipeline account..."
	@cd infrastructure && ENVIRONMENT=pipeline yarn cdk deploy \
		MonitoringStack-pipeline \
		MonitoringEcsStack-pipeline \
		--require-approval never

# Deploy development account with cross-account monitoring support
deploy-dev-with-monitoring:
	@echo "========================================="
	@echo "Deploying Development with Cross-Account Monitoring"
	@echo "========================================="
	@echo ""
	@chmod +x ./scripts/deploy/dev-with-monitoring.sh
	./scripts/deploy/dev-with-monitoring.sh
	@echo ""
	@echo "✓ Development environment deployed with monitoring support!"
	@echo ""
	@echo "Next steps:"
	@echo "  1. Deploy VPC peering: make deploy-vpc-peering"
	@echo "  2. Test connectivity: See docs/monitoring/QUICK_TEST_GUIDE.md"

# Setup cross-account access in application accounts
setup-cross-account-access:
	@echo "========================================="
	@echo "Setting up cross-account monitoring access"
	@echo "========================================="
	@echo ""
	@echo "This will create IAM roles and EventBridge rules in application accounts"
	@echo "Only environments with enableEventBridge=true will be deployed"
	@echo ""
	@echo "Deploying to development..."
	@cd infrastructure && ENVIRONMENT=development yarn cdk deploy CrossAccountMonitoring-development --require-approval never
	@echo ""
	@echo "✓ Cross-account access configured for development!"
	@echo ""
	@echo "Note: To enable for staging/production, set enableEventBridge=true in config/environments.ts"

# Deploy cross-account access to a specific environment
setup-cross-account-access-staging:
	@echo "Deploying cross-account access to staging..."
	@cd infrastructure && ENVIRONMENT=staging yarn cdk deploy CrossAccountMonitoring-staging --require-approval never

setup-cross-account-access-production:
	@echo "Deploying cross-account access to production..."
	@cd infrastructure && ENVIRONMENT=production yarn cdk deploy CrossAccountMonitoring-production --require-approval never

# Deploy VPC peering between pipeline and application accounts
.PHONY: deploy-vpc-peering check-vpc-peering

deploy-vpc-peering:
	@echo "========================================="
	@echo "Deploying VPC Peering"
	@echo "========================================="
	@echo ""
	@echo "Prerequisites:"
	@echo "  - Pipeline VPC: 10.0.0.0/16"
	@echo "  - Development VPC: 10.1.0.0/16 (must NOT overlap)"
	@echo ""
	@echo "Checking VPC CIDRs..."
	@PIPELINE_CIDR=$$(aws ec2 describe-vpcs --filters "Name=tag:Environment,Values=pipeline" --query 'Vpcs[0].CidrBlock' --output text 2>/dev/null || echo "NOT_FOUND"); \
	DEV_CIDR=$$(aws ec2 describe-vpcs --filters "Name=tag:Environment,Values=development" --query 'Vpcs[0].CidrBlock' --output text 2>/dev/null || echo "NOT_FOUND"); \
	echo "  Pipeline CIDR: $$PIPELINE_CIDR"; \
	echo "  Development CIDR: $$DEV_CIDR"; \
	if [ "$$PIPELINE_CIDR" = "$$DEV_CIDR" ]; then \
		echo ""; \
		echo "ERROR: VPC CIDRs overlap! VPC peering requires non-overlapping CIDRs."; \
		echo "Update development VPC to use 10.1.0.0/16 and redeploy NetworkingStack-development"; \
		exit 1; \
	fi
	@echo ""
	@echo "Deploying VPC peering stack..."
	@cd infrastructure && ENVIRONMENT=pipeline yarn cdk deploy VpcPeeringStack-pipeline --require-approval never
	@echo ""
	@echo "✓ VPC peering deployed!"
	@echo ""
	@echo "Verify with: make check-vpc-peering"

check-vpc-peering:
	@echo "========================================="
	@echo "VPC Peering Status"
	@echo "========================================="
	@aws ec2 describe-vpc-peering-connections \
		--filters "Name=status-code,Values=active,pending-acceptance,provisioning" \
		--query 'VpcPeeringConnections[*].{ID:VpcPeeringConnectionId,Status:Status.Code,Requester:RequesterVpcInfo.CidrBlock,Accepter:AccepterVpcInfo.CidrBlock}' \
		--output table || echo "No peering connections found"

# Check centralized monitoring status
check-monitoring-centralized:
	@echo "========================================="
	@echo "Centralized Monitoring Status"
	@echo "========================================="
	@echo ""
	@echo "Checking pipeline account stacks..."
	@aws cloudformation describe-stacks \
		--stack-name MonitoringEcsStack-pipeline \
		--query 'Stacks[0].{Status:StackStatus,Outputs:Outputs}' \
		--output table || echo "Stack not found"
	@echo ""
	@echo "Getting monitoring URLs..."
	@aws cloudformation describe-stacks \
		--stack-name MonitoringEcsStack-pipeline \
		--query 'Stacks[0].Outputs[?OutputKey==`GrafanaUrl` || OutputKey==`PrometheusUrl`].{Service:OutputKey,URL:OutputValue}' \
		--output table || echo "No outputs found"

# Destroy centralized monitoring
destroy-monitoring-centralized:
	@echo "========================================="
	@echo "WARNING: Destroying centralized monitoring"
	@echo "========================================="
	@echo ""
	@echo "This will destroy all monitoring infrastructure in pipeline account"
	@read -p "Are you sure? [y/N] " -n 1 -r; \
	echo; \
	if [[ $$REPLY =~ ^[Yy]$$ ]]; then \
		cd infrastructure && ENVIRONMENT=pipeline yarn cdk destroy \
			MonitoringEcsStack-pipeline \
			MonitoringStack-pipeline \
			NetworkingStack-pipeline \
			--force; \
	fi

# Get centralized monitoring logs
logs-monitoring-centralized:
	@echo "Centralized monitoring log groups:"
	@echo "  - /ecs/pipeline-prometheus"
	@echo "  - /ecs/pipeline-grafana"
	@echo "  - /ecs/pipeline-node-exporter"
	@echo ""
	@echo "Usage examples:"
	@echo "  aws logs tail /ecs/pipeline-grafana --follow"
	@echo "  aws logs tail /ecs/pipeline-prometheus --since 1h"

# Setup multi-account data collection
setup-multi-account-monitoring:
	@echo "========================================="
	@echo "Setting up multi-account monitoring"
	@echo "========================================="
	@./scripts/monitoring/setup-multi-account.sh

# Generate Prometheus config for multi-account
generate-prometheus-config:
	@echo "Generating Prometheus configuration..."
	@./scripts/monitoring/generate-prometheus-config.sh \
		pipeline \
		$${AWS_REGION:-eu-west-1} \
		$${AWS_ACCOUNT_ID_DEV} \
		$${AWS_ACCOUNT_ID_STAGING} \
		$${AWS_ACCOUNT_ID_PROD}

# Generate Grafana datasources for multi-account
generate-grafana-datasources:
	@echo "Generating Grafana datasources..."
	@./scripts/monitoring/generate-grafana-datasources.sh \
		"http://localhost:9090/prometheus" \
		$${AWS_REGION:-eu-west-1} \
		$${AWS_ACCOUNT_ID_DEV} \
		$${AWS_ACCOUNT_ID_STAGING} \
		$${AWS_ACCOUNT_ID_PROD}


##############################################################################
# CDK NAG - Security & Compliance Troubleshooting
##############################################################################
# CDK Nag validates infrastructure against AWS best practices and security standards.
# These commands help identify, troubleshoot, and resolve CDK Nag violations.

.PHONY: nag-help nag-check nag-check-all nag-check-stack nag-violations nag-suppressions

# Show CDK Nag troubleshooting help
nag-help:
	@echo ""
	@echo "=== CDK Nag Troubleshooting Commands ==="
	@echo ""
	@echo "Quick Reference:"
	@echo "  make nag-check ENV=development           - Check all stacks for violations"
	@echo "  make nag-check-stack STACK=Networking    - Check specific stack"
	@echo "  make nag-violations ENV=development      - Show only violations (errors)"
	@echo "  make nag-suppressions ENV=development    - Show suppressed rules"
	@echo ""
	@echo "What each command does:"
	@echo ""
	@echo "1. nag-check (Check all stacks)"
	@echo "   - Synthesizes all CDK stacks with CDK Nag enabled"
	@echo "   - Shows first 20 AwsSolutions violations"
	@echo "   - Use: Quick overview of security issues"
	@echo "   - Command: ENVIRONMENT=ENV yarn cdk synth --all 2>&1 | grep 'AwsSolutions' | head -20"
	@echo ""
	@echo "2. nag-check-stack (Check specific stack)"
	@echo "   - Synthesizes single stack to focus on specific violations"
	@echo "   - Faster than checking all stacks"
	@echo "   - Use: When fixing issues in one stack"
	@echo "   - Command: ENVIRONMENT=ENV yarn cdk synth STACK-ENV 2>&1 | grep 'AwsSolutions'"
	@echo ""
	@echo "3. nag-violations (Show only errors)"
	@echo "   - Filters for '[Error at' to show blocking violations"
	@echo "   - Ignores suppressed rules (Info messages)"
	@echo "   - Use: Find what's blocking deployment"
	@echo "   - Command: ENVIRONMENT=ENV yarn cdk synth --all 2>&1 | grep 'Error at'"
	@echo ""
	@echo "4. nag-suppressions (Show suppressed rules)"
	@echo "   - Shows '[Info at' messages for suppressed violations"
	@echo "   - Useful for audit and documentation"
	@echo "   - Use: Review what's been suppressed and why"
	@echo "   - Command: ENVIRONMENT=ENV yarn cdk synth --all 2>&1 | grep 'Info at'"
	@echo ""
	@echo "Common CDK Nag Rules:"
	@echo "  AwsSolutions-IAM4  - AWS managed policies (use custom policies)"
	@echo "  AwsSolutions-IAM5  - Wildcard permissions (scope down)"
	@echo "  AwsSolutions-EC23  - Security group allows 0.0.0.0/0 (restrict IPs)"
	@echo "  AwsSolutions-SNS3  - SNS topic doesn't enforce SSL (add policy)"
	@echo "  AwsSolutions-S1    - S3 bucket without access logging"
	@echo "  AwsSolutions-ECS2  - ECS task definition has secrets in env vars"
	@echo ""
	@echo "Suppression Guide: infrastructure/docs/cdk-nag/CDK_NAG_SUPPRESSION_GUIDE.md"
	@echo ""

# Check all stacks for CDK Nag violations
nag-check:
	@echo "Checking all stacks for CDK Nag violations (ENV=$(ENV_FULL))..."
	@echo ""
	@cd infrastructure && ENVIRONMENT=$(ENV_FULL) yarn cdk synth --all 2>&1 | grep "AwsSolutions" | head -20 || echo "✓ No CDK Nag violations found"

# Check all stacks and show full output
nag-check-all:
	@echo "Checking all stacks for CDK Nag violations - FULL OUTPUT (ENV=$(ENV_FULL))..."
	@echo ""
	@cd infrastructure && ENVIRONMENT=$(ENV_FULL) yarn cdk synth --all 2>&1 | grep "AwsSolutions" || echo "✓ No CDK Nag violations found"

# Check specific stack for violations
# Usage: make nag-check-stack STACK=NetworkingStack ENV=development
nag-check-stack:
	@if [ -z "$(STACK)" ]; then \
		echo "Error: STACK parameter required"; \
		echo "Usage: make nag-check-stack STACK=NetworkingStack ENV=development"; \
		exit 1; \
	fi
	@echo "Checking $(STACK)-$(ENV_FULL) for CDK Nag violations..."
	@echo ""
	@cd infrastructure && ENVIRONMENT=$(ENV_FULL) yarn cdk synth $(STACK)-$(ENV_FULL) 2>&1 | grep "AwsSolutions" || echo "✓ No CDK Nag violations found in $(STACK)-$(ENV_FULL)"

# Show only violations (errors that block deployment)
nag-violations:
	@echo "Showing CDK Nag VIOLATIONS (errors) for ENV=$(ENV_FULL)..."
	@echo ""
	@cd infrastructure && ENVIRONMENT=$(ENV_FULL) yarn cdk synth --all 2>&1 | grep "Error at" || echo "✓ No blocking violations found"

# Show suppressed rules (for audit/review)
nag-suppressions:
	@echo "Showing suppressed CDK Nag rules for ENV=$(ENV_FULL)..."
	@echo ""
	@cd infrastructure && ENVIRONMENT=$(ENV_FULL) yarn cdk synth --all 2>&1 | grep "Info at" | head -30 || echo "No suppressions found"

# Show specific rule violations across all stacks
# Usage: make nag-rule RULE=AwsSolutions-IAM5 ENV=development
nag-rule:
	@if [ -z "$(RULE)" ]; then \
		echo "Error: RULE parameter required"; \
		echo "Usage: make nag-rule RULE=AwsSolutions-IAM5 ENV=development"; \
		exit 1; \
	fi
	@echo "Searching for $(RULE) violations in ENV=$(ENV_FULL)..."
	@echo ""
	@cd infrastructure && ENVIRONMENT=$(ENV_FULL) yarn cdk synth --all 2>&1 | grep "$(RULE)" || echo "✓ No $(RULE) violations found"

# Count violations by type
nag-count:
	@echo "Counting CDK Nag violations by type for ENV=$(ENV_FULL)..."
	@echo ""
	@cd infrastructure && ENVIRONMENT=$(ENV_FULL) yarn cdk synth --all 2>&1 | grep "AwsSolutions" | grep -o "AwsSolutions-[A-Z0-9]*" | sort | uniq -c | sort -rn || echo "No violations found"


##############################################################################
# MONITORING - Local Docker Stack
##############################################################################

.PHONY: monitoring-help monitoring-up monitoring-down monitoring-restart monitoring-status
.PHONY: monitoring-logs monitoring-test-connectivity monitoring-check-metrics
.PHONY: monitoring-fix-grafana-permissions monitoring-reset-grafana

monitoring-help:
	@echo ""
	@echo "=== Local Monitoring Stack Commands ==="
	@echo ""
	@echo "Basic Operations:"
	@echo "  monitoring-up                    - Start monitoring stack (Prometheus, Grafana, Node Exporter, cAdvisor)"
	@echo "  monitoring-down                  - Stop monitoring stack"
	@echo "  monitoring-restart               - Restart monitoring stack"
	@echo "  monitoring-status                - Check status of all monitoring containers"
	@echo "  monitoring-logs                  - Show logs from all monitoring services"
	@echo ""
	@echo "Network & Connectivity:"
	@echo "  monitoring-test-connectivity     - Test connectivity between containers"
	@echo "  monitoring-check-network         - Verify Docker network configuration"
	@echo "  monitoring-test-prometheus       - Test Prometheus scraping"
	@echo ""
	@echo "Metrics & Data:"
	@echo "  monitoring-check-metrics         - Check available frontend metrics"
	@echo "  monitoring-generate-traffic      - Generate traffic to test metrics collection"
	@echo "  monitoring-query-prometheus      - Query Prometheus for specific metrics"
	@echo ""
	@echo "Grafana:"
	@echo "  monitoring-grafana-logs          - Show Grafana logs"
	@echo "  monitoring-grafana-restart       - Restart Grafana container"
	@echo "  monitoring-fix-grafana-permissions - Fix dashboard file permissions"
	@echo "  monitoring-reset-grafana         - Reset Grafana admin password"
	@echo "  monitoring-list-dashboards       - List all Grafana dashboards"
	@echo ""
	@echo "Troubleshooting:"
	@echo "  monitoring-diagnose              - Run full diagnostic check"
	@echo "  monitoring-check-ports           - Check which ports are in use"
	@echo "  monitoring-fix-prometheus-config - Validate and fix Prometheus config"
	@echo "  monitoring-fix-grafana-datasource - Fix Grafana datasource issues"
	@echo "  monitoring-restart-grafana       - Restart Grafana and check health"
	@echo ""
	@echo "Access URLs (when running):"
	@echo "  - Frontend:       http://localhost:3000"
	@echo "  - Prometheus:     http://localhost:9090"
	@echo "  - Grafana:        http://localhost:3001 (admin/admin)"
	@echo "  - Node Exporter:  http://localhost:9100"
	@echo "  - cAdvisor:       http://localhost:8080"
	@echo ""

# Basic Operations
monitoring-up:
	@echo "Starting monitoring stack..."
	@cd monitoring && docker-compose up -d
	@echo "Waiting for services to be ready..."
	@sleep 5
	@$(MAKE) monitoring-status

monitoring-down:
	@echo "Stopping monitoring stack..."
	@cd monitoring && docker-compose down

monitoring-restart:
	@echo "Restarting monitoring stack..."
	@cd monitoring && docker-compose restart
	@sleep 5
	@$(MAKE) monitoring-status

monitoring-status:
	@echo "=== Monitoring Stack Status ==="
	@docker ps --filter "network=monitoring_monitoring" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

monitoring-logs:
	@echo "=== Recent logs from all monitoring services ==="
	@echo "\n--- Prometheus ---"
	@docker logs prometheus --tail 20 2>&1 | grep -v "^time="
	@echo "\n--- Grafana ---"
	@docker logs grafana --tail 20 2>&1 | grep -v "^logger="
	@echo "\n--- Node Exporter ---"
	@docker logs node-exporter --tail 20
	@echo "\n--- cAdvisor ---"
	@docker logs cadvisor --tail 20

# Network & Connectivity Tests
monitoring-test-connectivity:
	@echo "=== Testing Container Network Connectivity ==="
	@echo "Testing Grafana -> Prometheus..."
	@docker exec grafana wget -qO- http://prometheus:9090/api/v1/query?query=up 2>/dev/null | head -c 100 && echo "...OK" || echo "...FAILED"
	@echo ""
	@echo "Testing Prometheus -> Frontend metrics..."
	@docker exec prometheus wget -qO- http://frontend:3000/api/metrics 2>/dev/null | head -c 100 && echo "...OK" || echo "...FAILED"
	@echo ""
	@echo "Testing Prometheus -> Node Exporter..."
	@docker exec prometheus wget -qO- http://node-exporter:9100/metrics 2>/dev/null | head -c 100 && echo "...OK" || echo "...FAILED"

monitoring-check-network:
	@echo "=== Docker Network Configuration ==="
	@echo "Containers on monitoring network:"
	@docker ps --filter "network=monitoring_monitoring" --format "{{.Names}}"
	@echo ""
	@echo "Network details:"
	@docker network inspect monitoring_monitoring | grep -A 10 "Containers"

monitoring-test-prometheus:
	@echo "=== Testing Prometheus Scraping ==="
	@echo "Active targets:"
	@curl -s http://localhost:9090/api/v1/targets | python3 -m json.tool | grep -E "(instance|health|lastError)" | head -20

# Metrics & Data
monitoring-check-metrics:
	@echo "=== Available Frontend Metrics ==="
	@echo "Total metric types:"
	@curl -s http://localhost:3000/api/metrics 2>/dev/null | grep "^# HELP" | wc -l || echo "ERROR: Cannot reach frontend"
	@echo ""
	@echo "Sample metrics:"
	@curl -s http://localhost:3000/api/metrics 2>/dev/null | grep -E "^(# HELP|nextjs_)" | head -30 || echo "ERROR: Cannot reach frontend"

monitoring-generate-traffic:
	@echo "=== Generating Test Traffic ==="
	@curl -s http://localhost:3000/ > /dev/null && echo "✓ Homepage"
	@curl -s http://localhost:3000/about > /dev/null && echo "✓ About page"
	@curl -s http://localhost:3000/articles > /dev/null && echo "✓ Articles page"
	@sleep 2
	@echo ""
	@echo "Page view metrics after traffic:"
	@curl -s http://localhost:3000/api/metrics 2>/dev/null | grep "nextjs_page_views_total" || echo "No page view metrics found"

monitoring-query-prometheus:
	@echo "=== Querying Prometheus ==="
	@echo "Query: up (all targets status)"
	@curl -s 'http://localhost:9090/api/v1/query?query=up' | python3 -m json.tool

# Grafana Management
monitoring-grafana-logs:
	@echo "=== Grafana Logs (last 30 lines) ==="
	@docker logs grafana --tail 30 2>&1 | grep -E "(provision|dashboard|error|failed|starting)"

monitoring-grafana-restart:
	@echo "Restarting Grafana..."
	@cd monitoring && docker-compose restart grafana
	@sleep 5
	@docker logs grafana --tail 10

monitoring-fix-grafana-permissions:
	@echo "Fixing Grafana dashboard permissions..."
	@chmod 644 monitoring/grafana/dashboards/*.json
	@echo "Dashboard files in container:"
	@docker exec grafana ls -la /var/lib/grafana/dashboards/
	@echo ""
	@echo "Restarting Grafana to reload dashboards..."
	@cd monitoring && docker-compose restart grafana

monitoring-reset-grafana:
	@echo "Resetting Grafana admin password to 'admin'..."
	@docker exec grafana grafana cli admin reset-admin-password admin 2>&1 | grep -v "logger="
	@echo ""
	@echo "Login at: http://localhost:3001"
	@echo "Username: admin"
	@echo "Password: admin"

monitoring-list-dashboards:
	@echo "=== Grafana Dashboards ==="
	@echo "Files in container:"
	@docker exec grafana ls -la /var/lib/grafana/dashboards/
	@echo ""
	@echo "Available via API:"
	@curl -s -u admin:admin 'http://localhost:3001/api/search?type=dash-db' 2>/dev/null | python3 -m json.tool || echo "Cannot connect to Grafana API"

# Troubleshooting
monitoring-diagnose:
	@echo "=== Running Full Diagnostic ==="
	@echo ""
	@echo "1. Container Status:"
	@$(MAKE) monitoring-status
	@echo ""
	@echo "2. Port Usage:"
	@$(MAKE) monitoring-check-ports
	@echo ""
	@echo "3. Network Connectivity:"
	@$(MAKE) monitoring-test-connectivity
	@echo ""
	@echo "4. Prometheus Config:"
	@docker exec prometheus promtool check config /etc/prometheus/prometheus.yml && echo "✓ Prometheus config valid" || echo "✗ Prometheus config invalid"
	@echo ""
	@echo "5. Grafana Datasources:"
	@curl -s -u admin:admin http://localhost:3001/api/datasources 2>/dev/null | python3 -m json.tool && echo "✓ Grafana datasources provisioned" || echo "✗ Grafana datasources not available"
	@echo ""
	@echo "6. Frontend Metrics:"
	@curl -s http://localhost:3000/api/health 2>/dev/null | python3 -m json.tool && echo "✓ Frontend healthy" || echo "✗ Frontend not responding"

monitoring-check-ports:
	@echo "=== Port Usage Check ==="
	@echo "Checking common monitoring ports..."
	@echo -n "Port 3000 (Frontend):     " && (lsof -nP -iTCP:3000 | grep LISTEN || echo "Available")
	@echo -n "Port 3001 (Grafana):      " && (lsof -nP -iTCP:3001 | grep LISTEN || echo "Available")
	@echo -n "Port 9090 (Prometheus):   " && (lsof -nP -iTCP:9090 | grep LISTEN || echo "Available")
	@echo -n "Port 9100 (Node Exporter):" && (lsof -nP -iTCP:9100 | grep LISTEN || echo "Available")
	@echo -n "Port 8080 (cAdvisor):     " && (lsof -nP -iTCP:8080 | grep LISTEN || echo "Available")

monitoring-fix-prometheus-config:
	@echo "=== Validating Prometheus Configuration ==="
	@docker exec prometheus promtool check config /etc/prometheus/prometheus.yml
	@echo ""
	@echo "To reload config without restart:"
	@echo "  curl -X POST http://localhost:9090/-/reload"

monitoring-fix-grafana-datasource:
	@echo "=== Fixing Grafana Datasource Issues ==="
	@echo ""
	@echo "1. Checking current Grafana status..."
	@docker ps | grep grafana || echo "✗ Grafana container not running"
	@echo ""
	@echo "2. Checking Grafana logs for errors..."
	@docker logs grafana --tail 20 2>&1 | grep -i error || echo "✓ No errors in recent logs"
	@echo ""
	@echo "3. Validating datasource YAML..."
	@python3 -c "import yaml; yaml.safe_load(open('monitoring/grafana/provisioning/datasources/prometheus.yml'))" && echo "✓ YAML is valid" || echo "✗ YAML syntax error"
	@echo ""
	@echo "4. Checking provisioned datasources..."
	@curl -s -u admin:admin http://localhost:3001/api/datasources 2>/dev/null | python3 -m json.tool || echo "✗ Cannot connect to Grafana API"
	@echo ""
	@echo "If datasource is missing, try:"
	@echo "  make monitoring-restart-grafana"
	@echo ""
	@echo "If errors persist, try fresh start:"
	@echo "  cd monitoring && docker-compose down grafana && docker-compose up -d grafana"

monitoring-restart-grafana:
	@echo "=== Restarting Grafana Container ==="
	cd monitoring && docker-compose restart grafana
	@echo "Waiting for Grafana to be ready..."
	@sleep 5
	@curl -s http://localhost:3001/api/health && echo "✓ Grafana is healthy" || echo "✗ Grafana not responding"

monitoring-grafana-check-datasource:
	@echo "=== Checking Grafana Datasource Status ==="
	@echo ""
	@echo "Checking for datasource provisioning errors in logs..."
	@docker logs grafana 2>&1 | grep -i "datasource" | tail -10 || echo "No datasource-related logs found"
	@echo ""
	@echo "Current datasources (requires Grafana admin credentials):"
	@echo "  curl -u admin:admin http://localhost:3001/api/datasources"

##############################################################################
# DOCKER - Frontend Container Management
##############################################################################

.PHONY: docker-help docker-build-frontend docker-run-frontend docker-stop-frontend
.PHONY: docker-frontend-logs docker-frontend-shell docker-check-frontend

docker-help:
	@echo ""
	@echo "=== Docker Frontend Commands ==="
	@echo ""
	@echo "  docker-build-frontend       - Build frontend Docker image"
	@echo "  docker-run-frontend         - Run frontend container (port 3000)"
	@echo "  docker-stop-frontend        - Stop frontend container"
	@echo "  docker-frontend-logs        - Show frontend container logs"
	@echo "  docker-frontend-shell       - Open shell in frontend container"
	@echo "  docker-check-frontend       - Check frontend container status and health"
	@echo ""

docker-build-frontend:
	@echo "Building frontend Docker image..."
	@docker build -t portfolio-frontend:latest -f frontend/Dockerfile .

docker-run-frontend:
	@echo "Starting frontend container..."
	@docker-compose up -d frontend
	@sleep 3
	@$(MAKE) docker-check-frontend

docker-stop-frontend:
	@echo "Stopping frontend container..."
	@docker-compose stop frontend

docker-frontend-logs:
	@echo "=== Frontend Container Logs ==="
	@docker logs frontend --tail 50

docker-frontend-shell:
	@echo "Opening shell in frontend container..."
	@docker exec -it frontend sh

docker-check-frontend:
	@echo "=== Frontend Container Status ==="
	@docker ps --filter "name=frontend" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
	@echo ""
	@echo "Health check:"
	@curl -s http://localhost:3000/api/health | python3 -m json.tool || echo "Frontend not responding"
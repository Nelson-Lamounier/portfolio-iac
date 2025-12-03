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
	@echo "  deploy-lb-http       - Deploy Load Balancer with HTTP only (ENV=development)"
	@echo ""
	@echo "Monitoring targets:"
	@echo "  deploy-monitoring       - Deploy monitoring stack (alias for deploy-monitoring-ecs)"
	@echo "  deploy-monitoring-ecs   - Deploy ECS-based monitoring (ENV=development)"
	@echo "  destroy-monitoring-ecs  - Destroy ECS monitoring stack (ENV=development)"
	@echo "  check-monitoring-ecs    - Check ECS monitoring status (ENV=development)"
	@echo "  logs-monitoring-ecs     - Show log group names for monitoring (ENV=development)"

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
	@chmod +x ./scripts/test-monitoring-setup.sh
	./scripts/test-monitoring-setup.sh $(ENVIRONMENT)

update-prometheus-config:
	@echo "Updating Prometheus configuration..."
	@chmod +x ./scripts/update-prometheus-config.sh
	./scripts/update-prometheus-config.sh $(ENVIRONMENT)

test-ci:
	@echo "Running all CI tests..."
	$(MAKE) test-infrastructure
	$(MAKE) test-frontend

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
	@./scripts/check-infrastructure.sh

fetch-ecr-uri:
	@echo "Fetching ECR repository URI..."
	@./scripts/fetch-ecr-uri.sh

fetch-aws-accounts:
	@echo "Fetching AWS account IDs..."
	@./scripts/fetch-aws-accounts.sh

setup-domain-params:
	@echo "Setting up domain configuration in SSM Parameter Store..."
	@./scripts/setup-domain-parameters.sh

verify-cdk-bootstrap:
	@echo "Verifying CDK bootstrap..."
	@./scripts/verify-cdk-bootstrap.sh

docker-build-push:
	@echo "Building and pushing Docker image..."
	@./scripts/docker-build-push.sh

cleanup-buildcache:
	@echo "Cleaning up buildcache tag from ECR..."
	@./scripts/cleanup-buildcache.sh

cdk-synth:
	@echo "Synthesizing CDK stacks..."
	yarn workspace infrastructure cdk synth

cdk-deploy:
	@echo "Deploying CDK stacks..."
	yarn workspace infrastructure cdk deploy --all --require-approval never

deploy-lb-local:
	@echo "Deploying Load Balancer locally for environment: $(ENV)"
	@./scripts/deploy-lb-local.sh $(ENV)

deploy-lb-http:
	@echo "Deploying Load Balancer (HTTP only) for environment: $(ENV)"
	@./scripts/deploy-lb-http-only.sh $(ENV)

recover-stacks:
	@echo "Recovering stacks for environment: $(ENV)"
	@./scripts/recover-stack.sh $(ENV)

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

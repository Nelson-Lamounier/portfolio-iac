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
	@echo "  verify-cdk-bootstrap - Verify CDK bootstrap"
	@echo "  docker-build-push    - Build and push Docker image"
	@echo "  cdk-synth            - Synthesize CDK stacks"
	@echo "  cdk-deploy           - Deploy CDK stacks"

# Installation
install:
	@echo "Installing dependencies..."
	yarn install --immutable

# Build targets
build: build-frontend build-infrastructure

build-frontend:
	@echo "Building frontend..."
	yarn workspace frontend build

build-infrastructure:
	@echo "Building infrastructure..."
	yarn workspace infrastructure build

# Test targets
test: test-frontend test-infrastructure

test-frontend:
	@echo "Running frontend tests..."
	yarn workspace frontend test --ci --coverage --maxWorkers=2

test-infrastructure:
	@echo "Running infrastructure tests..."
	yarn workspace infrastructure test --ci --coverage

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

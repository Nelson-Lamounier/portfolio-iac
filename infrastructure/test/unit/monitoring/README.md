<!-- @format -->

# Monitoring Infrastructure Test Suite

This directory contains comprehensive test coverage for the monitoring infrastructure, including EFS storage, infrastructure components, and monitoring services. The test suite ensures reliability, security, and proper integration across all monitoring stack components.

## 📊 Test Coverage Overview

**Total Tests: 133 across 8 test files**

| Test File                          | Tests | Coverage                              |
| ---------------------------------- | ----- | ------------------------------------- |
| `monitoring-service-stack.test.ts` | 31    | ECS services, load balancing, routing |
| `comprehensive-monitoring.test.ts` | 30    | End-to-end integration testing        |
| `monitoring-infra-stack.test.ts`   | 20    | Infrastructure components             |
| `integration.test.ts`              | 15    | Cross-stack integration               |
| `security.test.ts`                 | 14    | Security compliance                   |
| `monitoring-efs-stack.test.ts`     | 12    | EFS storage layer                     |
| `vpc-peering-stack.test.ts`        | 6     | Cross-account networking              |
| `cdk-nag.test.ts`                  | 5     | CDK Nag compliance                    |

## 🏗️ Architecture Under Test

The test suite validates a three-layer monitoring architecture:

```
┌─────────────────────────────────────────────────────────────┐
│                    MONITORING ARCHITECTURE                   │
├─────────────────────────────────────────────────────────────┤
│  SERVICE LAYER (MonitoringServiceStack)                     │
│  ├── Prometheus ECS Service                                 │
│  ├── Grafana ECS Service                                    │
│  ├── Node Exporter ECS Service                              │
│  ├── ALB Target Groups                                      │
│  └── Listener Rules & Routing                               │
├─────────────────────────────────────────────────────────────┤
│  INFRASTRUCTURE LAYER (MonitoringInfraStack)                │
│  ├── ECS Cluster with Container Insights                    │
│  ├── Application Load Balancer                              │
│  ├── Auto Scaling Group                                     │
│  ├── Security Groups                                        │
│  └── IAM Roles & Policies                                   │
├─────────────────────────────────────────────────────────────┤
│  STORAGE LAYER (MonitoringEfsStack)                         │
│  ├── Encrypted EFS File System                              │
│  ├── EFS Access Points                                      │
│  ├── Mount Targets                                          │
│  └── SSM Configuration Parameters                           │
└─────────────────────────────────────────────────────────────┘
```

## 🧪 Test Categories

### 1. Unit Tests

Individual stack component validation:

- **Resource Creation**: Verify all required AWS resources are created
- **Configuration**: Validate resource properties and settings
- **Security**: Ensure encryption, access controls, and network isolation
- **Tagging**: Confirm proper resource tagging for governance

### 2. Integration Tests

Cross-stack dependency validation:

- **Stack Dependencies**: Verify proper resource references between stacks
- **Service Integration**: Ensure services can communicate properly
- **Load Balancer Routing**: Validate traffic routing to services
- **Cross-Account Access**: Test monitoring across AWS accounts

### 3. Security Tests

Comprehensive security validation:

- **Encryption**: EFS and EBS encryption verification
- **Network Security**: Security group rules and access controls
- **IAM Policies**: Least privilege access validation
- **Public Access**: Prevent unauthorized internet access

### 4. Compliance Tests

Governance and best practices:

- **CDK Nag**: AWS security best practices compliance
- **Resource Limits**: Memory and CPU allocation validation
- **Cost Optimization**: EFS lifecycle policies and throughput modes
- **Backup Policies**: Data protection and retention

## 🚀 Running Tests

### Prerequisites

```bash
# Install dependencies
yarn install

# Ensure Docker is running (for Lambda bundling)
docker --version
```

### Run All Monitoring Tests

```bash
# Run complete monitoring test suite
yarn test test/unit/monitoring/

# Run with coverage
yarn test test/unit/monitoring/ --coverage
```

### Run Individual Test Files

```bash
# Service layer tests
yarn test test/unit/monitoring/monitoring-service-stack.test.ts

# Infrastructure layer tests
yarn test test/unit/monitoring/monitoring-infra-stack.test.ts

# Storage layer tests
yarn test test/unit/monitoring/monitoring-efs-stack.test.ts

# Comprehensive integration tests
yarn test test/unit/monitoring/comprehensive-monitoring.test.ts

# Security validation
yarn test test/unit/monitoring/security.test.ts

# Cross-stack integration
yarn test test/unit/monitoring/integration.test.ts

# VPC peering tests
yarn test test/unit/monitoring/vpc-peering-stack.test.ts

# CDK Nag compliance
yarn test test/unit/monitoring/cdk-nag.test.ts
```

### Run Specific Test Categories

```bash
# Security-focused tests
yarn test test/unit/monitoring/security.test.ts test/unit/monitoring/cdk-nag.test.ts

# Integration tests
yarn test test/unit/monitoring/integration.test.ts test/unit/monitoring/comprehensive-monitoring.test.ts

# Core stack tests
yarn test test/unit/monitoring/monitoring-*-stack.test.ts
```

## 🔧 Test Configuration

### Jest Configuration

Tests use the shared Jest configuration in `infrastructure/jest.config.js`:

- TypeScript support with `ts-jest`
- Test-specific TypeScript configuration (`tsconfig.test.json`)
- CDK Nag disabled for testing
- Proper module resolution for CDK libraries

### Test Helpers

The `test/helpers/test-helpers.ts` file provides:

- **Stack Creation Functions**: Standardized test stack creation
- **Validation Helpers**: Security, tagging, and compliance checks
- **Test Constants**: Consistent test data and configurations
- **Cross-Stack Utilities**: Functions to avoid cross-app reference issues

### Environment Variables

```bash
# Disable CDK Nag during testing
ENABLE_CDK_NAG=false

# Test environment configuration
NODE_ENV=test
```

## 📋 Test Structure

### Test File Organization

```
test/unit/monitoring/
├── README.md                           # This file
├── monitoring-service-stack.test.ts    # Service layer tests
├── monitoring-infra-stack.test.ts      # Infrastructure tests
├── monitoring-efs-stack.test.ts        # Storage layer tests
├── comprehensive-monitoring.test.ts    # End-to-end integration
├── integration.test.ts                 # Cross-stack integration
├── security.test.ts                   # Security validation
├── vpc-peering-stack.test.ts          # Cross-account networking
├── cdk-nag.test.ts                    # CDK Nag compliance
└── monitoring-test-config.ts          # Test configuration
```

### Test Helper Functions

```typescript
// Stack creation helpers
createTestMonitoringEfsStack(); // EFS storage stack
createTestMonitoringInfraStack(); // Infrastructure stack
createTestMonitoringServiceStack(); // Service stack

// Validation helpers
assertNoPublicIngress(); // Security validation
assertAllResourcesTagged(); // Tagging compliance
assertMonitoringSecurityCompliance(); // Security best practices
assertMonitoringNetworking(); // Network configuration
assertCrossAccountAccess(); // Cross-account setup
assertCostOptimization(); // Cost optimization
```

## 🔍 Key Test Scenarios

### MonitoringServiceStack Tests (31 tests)

- **ECS Services**: Prometheus, Grafana, Node Exporter creation
- **Load Balancing**: Target groups and health checks
- **Routing**: ALB listener rules and path-based routing
- **Security**: Security group rules and network access
- **Configuration**: Container volumes and environment variables
- **Integration**: Cross-stack resource dependencies

### MonitoringInfraStack Tests (20 tests)

- **ECS Cluster**: Container Insights and capacity configuration
- **Load Balancer**: Internet-facing ALB with proper listeners
- **Auto Scaling**: EC2 instances with proper scaling policies
- **Security**: Launch templates with encryption and hardening
- **IAM**: Roles and policies for EC2 and ECS
- **Networking**: Security groups and VPC configuration

### MonitoringEfsStack Tests (12 tests)

- **File System**: Encrypted EFS with backup policies
- **Access Points**: Proper POSIX permissions and paths
- **Mount Targets**: Security group configuration
- **Lifecycle**: Cost optimization with IA transitions
- **Parameters**: SSM configuration storage
- **Lambda**: EFS initialization custom resource

### Security Tests (14 tests)

- **Encryption**: EFS and EBS encryption validation
- **Network**: Security group ingress/egress rules
- **IAM**: Least privilege access policies
- **Public Access**: Prevention of unauthorized access
- **Compliance**: Security best practices adherence

### Integration Tests (15 tests)

- **Resource Counts**: Proper number of resources created
- **Dependencies**: Cross-stack resource references
- **Communication**: Service-to-service connectivity
- **Load Balancing**: Traffic routing validation
- **Monitoring**: CloudWatch integration

## 🛠️ Troubleshooting

### Common Issues

#### Cross-Stack Reference Errors

```bash
Error: Cannot reference across apps
```

**Solution**: Use test helpers that create all stacks in the same CDK app.

#### Docker Not Available

```bash
Error: Docker is required for Lambda bundling
```

**Solution**: Start Docker Desktop or install Docker.

#### CDK Nag Failures

```bash
Error: CDK Nag rule violations
```

**Solution**: Ensure `ENABLE_CDK_NAG=false` for testing or fix violations.

#### Memory/Resource Limits

```bash
Error: Container memory not defined
```

**Solution**: Verify task definitions have proper resource allocation.

### Debug Commands

```bash
# Verbose test output
yarn test test/unit/monitoring/ --verbose

# Run single test with debug
yarn test test/unit/monitoring/monitoring-service-stack.test.ts --testNamePattern="should create stack successfully"

# Check CDK synthesis
cd infrastructure && npx cdk synth TestMonitoringServiceStack

# Validate CloudFormation templates
aws cloudformation validate-template --template-body file://cdk.out/TestMonitoringServiceStack.template.json
```

## 📈 Test Metrics

### Performance Benchmarks

- **Individual Stack Tests**: ~2-3 seconds each
- **Integration Tests**: ~5-7 seconds
- **Complete Suite**: ~7-10 seconds
- **Memory Usage**: <500MB during test execution

### Coverage Goals

- **Resource Creation**: 100% of AWS resources tested
- **Security Rules**: 100% of security configurations validated
- **Integration Points**: 100% of cross-stack dependencies tested
- **Error Scenarios**: Key failure modes covered

## 🔄 Continuous Integration

### GitHub Actions Integration

Tests run automatically on:

- Pull requests to main branch
- Pushes to feature branches
- Scheduled nightly runs

### Test Pipeline

```yaml
- name: Run Monitoring Tests
  run: |
    cd infrastructure
    yarn install
    yarn test test/unit/monitoring/ --coverage
    yarn test test/simple.test.ts
```

## 📚 Related Documentation

- [Monitoring Architecture Guide](../../../docs/monitoring/PRODUCTION_MONITORING_ARCHITECTURE.md)
- [Testing Strategy](../../../docs/monitoring/TESTING_STRATEGY.md)
- [Security Guide](../../../docs/security/PIPELINE_SECURITY_GUIDE.md)
- [Deployment Guide](../../../docs/deployment/PRODUCTION_PIPELINE_GUIDE.md)

## 🤝 Contributing

### Adding New Tests

1. Follow existing test patterns and naming conventions
2. Use test helpers for stack creation to avoid cross-app references
3. Include security and compliance validation
4. Add integration tests for new cross-stack dependencies
5. Update this README with new test descriptions

### Test Standards

- **Descriptive Names**: Test names should clearly describe what is being tested
- **Isolation**: Each test should be independent and not rely on others
- **Assertions**: Use specific assertions rather than generic checks
- **Documentation**: Comment complex test logic and edge cases
- **Performance**: Keep tests fast and efficient

---

**Last Updated**: December 2024  
**Test Suite Version**: 1.0  
**Total Tests**: 133  
**Success Rate**: 100%

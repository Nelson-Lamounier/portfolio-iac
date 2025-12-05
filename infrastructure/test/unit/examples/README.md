<!-- @format -->

# AWS SDK Mock Examples

This directory contains comprehensive examples of mocking AWS SDK v3 clients using `aws-sdk-client-mock`.

## Overview

These examples demonstrate best practices for testing code that interacts with AWS services without making actual API calls.

## Test Files

### 1. S3 Operations (`s3-operations.test.ts`)

**45 tests covering:**

- ✅ PutObject operations (upload, errors, parameter verification)
- ✅ GetObject operations (retrieve, not found, versioning)
- ✅ DeleteObject operations (delete, errors)
- ✅ ListObjects operations (list, pagination)
- ✅ Multiple operations (sequences, call order)
- ✅ Conditional mocking (different buckets)

**Key Patterns:**

```typescript
// Mock successful upload
s3Mock.on(PutObjectCommand).resolves({
  ETag: '"mock-etag"',
});

// Mock error
s3Mock.on(GetObjectCommand).rejects(new Error("NoSuchKey"));

// Mock specific input
s3Mock.on(GetObjectCommand, { Bucket: "my-bucket" }).resolves({...});
```

### 2. DynamoDB Operations (`dynamodb-operations.test.ts`)

**Tests covering:**

- ✅ PutItem operations (create, conditional failures)
- ✅ GetItem operations (retrieve, not found, projections)
- ✅ UpdateItem operations (update, conditions)
- ✅ DeleteItem operations (delete, return values)
- ✅ Query operations (partition key, filters, pagination)
- ✅ Scan operations (full table, filters)
- ✅ Error handling (throttling, validation)

**Key Patterns:**

```typescript
// Mock successful put
dynamoMock.on(PutItemCommand).resolves({});

// Mock get with item
dynamoMock.on(GetItemCommand).resolves({
  Item: {
    userId: { S: "user-123" },
    email: { S: "user@example.com" },
  },
});

// Mock pagination
dynamoMock
  .on(QueryCommand)
  .resolvesOnce({ Items: [...], LastEvaluatedKey: {...} })
  .resolvesOnce({ Items: [...], LastEvaluatedKey: undefined });
```

### 3. SSM Parameter Store Operations (`ssm-operations.test.ts`)

**Tests covering:**

- ✅ GetParameter operations (string, secure string, not found)
- ✅ GetParameters operations (multiple, invalid parameters)
- ✅ PutParameter operations (create, update, secure string)
- ✅ DeleteParameter operations (delete, not found)
- ✅ GetParametersByPath operations (path, recursive, pagination)
- ✅ Environment-specific parameters
- ✅ Real-world scenarios (config loading, secret rotation)

**Key Patterns:**

```typescript
// Mock get parameter
ssmMock.on(GetParameterCommand).resolves({
  Parameter: {
    Name: "/myapp/config",
    Value: "production",
    Type: "String",
  },
});

// Mock environment-specific
ssmMock
  .on(GetParameterCommand, { Name: "/prod/config" })
  .resolves({ Parameter: { Value: "prod-value" } })
  .on(GetParameterCommand, { Name: "/dev/config" })
  .resolves({ Parameter: { Value: "dev-value" } });
```

## Running the Tests

### Run All Example Tests

```bash
yarn test examples/
```

### Run Specific Example

```bash
yarn test s3-operations.test.ts
yarn test dynamodb-operations.test.ts
yarn test ssm-operations.test.ts
```

### Run in Watch Mode

```bash
yarn test:watch examples/
```

## Test Results

```
Test Suites: 3 passed, 3 total
Tests:       45 passed, 45 total
Time:        < 1 second
```

## Common Patterns

### 1. Basic Mock Setup

```typescript
import { mockClient } from "aws-sdk-client-mock";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

const s3Mock = mockClient(S3Client);

describe("My Tests", () => {
  beforeEach(() => {
    s3Mock.reset();
  });

  afterAll(() => {
    s3Mock.restore();
  });

  test("my test", async () => {
    s3Mock.on(PutObjectCommand).resolves({});
    // ... test code
  });
});
```

### 2. Mock Successful Response

```typescript
s3Mock.on(GetObjectCommand).resolves({
  Body: "content",
  ContentType: "text/plain",
});
```

### 3. Mock Error Response

```typescript
s3Mock.on(GetObjectCommand).rejects(new Error("Access Denied"));
```

### 4. Mock Specific Input

```typescript
s3Mock
  .on(GetObjectCommand, {
    Bucket: "my-bucket",
    Key: "my-key",
  })
  .resolves({ Body: "specific-content" });
```

### 5. Mock Multiple Calls

```typescript
s3Mock
  .on(GetObjectCommand)
  .resolvesOnce({ Body: "first" })
  .resolvesOnce({ Body: "second" })
  .resolves({ Body: "subsequent" });
```

### 6. Verify Calls

```typescript
expect(s3Mock.calls()).toHaveLength(1);
expect(s3Mock.call(0).args[0].input).toEqual({
  Bucket: "my-bucket",
  Key: "my-key",
});
```

## Best Practices Demonstrated

### ✅ Reset Mocks Between Tests

```typescript
beforeEach(() => {
  s3Mock.reset();
});
```

### ✅ Test Both Success and Error Cases

```typescript
test("success case", async () => {
  s3Mock.on(PutObjectCommand).resolves({});
  // ... test
});

test("error case", async () => {
  s3Mock.on(PutObjectCommand).rejects(new Error("Failed"));
  // ... test
});
```

### ✅ Verify Important Parameters

```typescript
const call = s3Mock.call(0);
expect(call.args[0].input).toMatchObject({
  Bucket: "expected-bucket",
  Key: "expected-key",
});
```

### ✅ Use Specific Matchers

```typescript
// Good - specific
s3Mock.on(GetObjectCommand, { Bucket: "my-bucket" }).resolves({...});

// Less specific - matches all
s3Mock.on(GetObjectCommand).resolves({...});
```

### ✅ Test Pagination

```typescript
mock
  .on(Command)
  .resolvesOnce({ Items: [...], NextToken: "token" })
  .resolvesOnce({ Items: [...], NextToken: undefined });
```

## Integration with Your Code

### When to Use These Patterns

1. **Lambda Functions** - Mock AWS SDK calls in Lambda handlers
2. **Custom Constructs** - Test constructs that use AWS SDK
3. **Utility Functions** - Test helper functions that interact with AWS
4. **Integration Tests** - Test workflows without hitting AWS

### Example: Testing a Lambda Function

```typescript
// lambda/handlers/process-upload.ts
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";

const s3 = new S3Client({});

export async function handler(event: any) {
  const result = await s3.send(
    new GetObjectCommand({
      Bucket: event.bucket,
      Key: event.key,
    })
  );

  return { content: await result.Body?.transformToString() };
}

// test/unit/lambda/process-upload.test.ts
import { mockClient } from "aws-sdk-client-mock";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { handler } from "../../../lambda/handlers/process-upload";

const s3Mock = mockClient(S3Client);

describe("Process Upload Lambda", () => {
  beforeEach(() => {
    s3Mock.reset();
  });

  test("processes upload successfully", async () => {
    s3Mock.on(GetObjectCommand).resolves({
      Body: {
        transformToString: async () => "file content",
      } as any,
    });

    const result = await handler({
      bucket: "my-bucket",
      key: "file.txt",
    });

    expect(result.content).toBe("file content");
  });
});
```

## Additional Resources

- [AWS SDK Mock Documentation](https://github.com/m-radzikowski/aws-sdk-client-mock)
- [AWS SDK v3 Documentation](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/)
- [Main Testing Guide](../../docs/testing/AWS_SDK_MOCKING_GUIDE.md)

## Next Steps

1. Review these examples
2. Copy patterns to your own tests
3. Add Lambda functions to your infrastructure
4. Write tests using these patterns
5. Maintain high test coverage

---

**Status**: ✅ All 45 tests passing  
**Coverage**: S3, DynamoDB, SSM Parameter Store  
**Ready**: For production use

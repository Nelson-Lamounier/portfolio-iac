/** @format */

// /** @format */

// import { mockClient } from "aws-sdk-client-mock";
// import {
//   SSMClient,
//   GetParameterCommand,
//   GetParametersCommand,
//   PutParameterCommand,
//   DeleteParameterCommand,
//   GetParametersByPathCommand,
// } from "@aws-sdk/client-ssm";

// const ssmMock = mockClient(SSMClient);

// describe("SSM Parameter Store Operations Examples", () => {
//   beforeEach(() => {
//     ssmMock.reset();
//   });

//   afterAll(() => {
//     ssmMock.restore();
//   });

//   describe("GetParameter Operations", () => {
//     test("gets parameter successfully", async () => {
//       ssmMock.on(GetParameterCommand).resolves({
//         Parameter: {
//           Name: "/myapp/database/host",
//           Value: "db.example.com",
//           Type: "String",
//           Version: 1,
//           LastModifiedDate: new Date("2025-12-01"),
//         },
//       });

//       const client = new SSMClient({});
//       const result = await client.send(
//         new GetParameterCommand({
//           Name: "/myapp/database/host",
//         })
//       );

//       expect(result.Parameter?.Value).toBe("db.example.com");
//       expect(result.Parameter?.Type).toBe("String");
//     });

//     test("gets secure string parameter with decryption", async () => {
//       ssmMock
//         .on(GetParameterCommand, {
//           Name: "/myapp/database/password",
//           WithDecryption: true,
//         })
//         .resolves({
//           Parameter: {
//             Name: "/myapp/database/password",
//             Value: "decrypted-password",
//             Type: "SecureString",
//             Version: 1,
//           },
//         });

//       const client = new SSMClient({});
//       const result = await client.send(
//         new GetParameterCommand({
//           Name: "/myapp/database/password",
//           WithDecryption: true,
//         })
//       );

//       expect(result.Parameter?.Value).toBe("decrypted-password");
//       expect(result.Parameter?.Type).toBe("SecureString");
//     });

//     test("handles parameter not found", async () => {
//       ssmMock.on(GetParameterCommand).rejects({
//         name: "ParameterNotFound",
//         message: "Parameter /myapp/missing not found",
//       });

//       const client = new SSMClient({});

//       await expect(
//         client.send(
//           new GetParameterCommand({
//             Name: "/myapp/missing",
//           })
//         )
//       ).rejects.toMatchObject({
//         name: "ParameterNotFound",
//       });
//     });
//   });

//   describe("GetParameters Operations", () => {
//     test("gets multiple parameters", async () => {
//       ssmMock.on(GetParametersCommand).resolves({
//         Parameters: [
//           {
//             Name: "/myapp/database/host",
//             Value: "db.example.com",
//             Type: "String",
//           },
//           {
//             Name: "/myapp/database/port",
//             Value: "5432",
//             Type: "String",
//           },
//           {
//             Name: "/myapp/database/name",
//             Value: "mydb",
//             Type: "String",
//           },
//         ],
//         InvalidParameters: [],
//       });

//       const client = new SSMClient({});
//       const result = await client.send(
//         new GetParametersCommand({
//           Names: [
//             "/myapp/database/host",
//             "/myapp/database/port",
//             "/myapp/database/name",
//           ],
//         })
//       );

//       expect(result.Parameters).toHaveLength(3);
//       expect(result.InvalidParameters).toHaveLength(0);
//     });

//     test("handles some invalid parameters", async () => {
//       ssmMock.on(GetParametersCommand).resolves({
//         Parameters: [
//           {
//             Name: "/myapp/valid",
//             Value: "value",
//             Type: "String",
//           },
//         ],
//         InvalidParameters: ["/myapp/invalid1", "/myapp/invalid2"],
//       });

//       const client = new SSMClient({});
//       const result = await client.send(
//         new GetParametersCommand({
//           Names: ["/myapp/valid", "/myapp/invalid1", "/myapp/invalid2"],
//         })
//       );

//       expect(result.Parameters).toHaveLength(1);
//       expect(result.InvalidParameters).toHaveLength(2);
//     });
//   });

//   describe("PutParameter Operations", () => {
//     test("creates new parameter", async () => {
//       ssmMock.on(PutParameterCommand).resolves({
//         Version: 1,
//         Tier: "Standard",
//       });

//       const client = new SSMClient({});
//       const result = await client.send(
//         new PutParameterCommand({
//           Name: "/myapp/config/feature-flag",
//           Value: "enabled",
//           Type: "String",
//           Description: "Feature flag for new feature",
//         })
//       );

//       expect(result.Version).toBe(1);
//     });

//     test("updates existing parameter", async () => {
//       ssmMock.on(PutParameterCommand).resolves({
//         Version: 2,
//         Tier: "Standard",
//       });

//       const client = new SSMClient({});
//       const result = await client.send(
//         new PutParameterCommand({
//           Name: "/myapp/config/feature-flag",
//           Value: "disabled",
//           Type: "String",
//           Overwrite: true,
//         })
//       );

//       expect(result.Version).toBe(2);
//     });

//     test("creates secure string parameter", async () => {
//       ssmMock.on(PutParameterCommand).resolves({
//         Version: 1,
//         Tier: "Standard",
//       });

//       const client = new SSMClient({});
//       await client.send(
//         new PutParameterCommand({
//           Name: "/myapp/secrets/api-key",
//           Value: "secret-api-key-value",
//           Type: "SecureString",
//           Description: "API key for external service",
//           Tags: [
//             { Key: "Environment", Value: "production" },
//             { Key: "Service", Value: "myapp" },
//           ],
//         })
//       );

//       const call = ssmMock.call(0);
//       expect(call.args[0].input.Type).toBe("SecureString");
//       expect(call.args[0].input.Tags).toHaveLength(2);
//     });

//     test("handles parameter already exists error", async () => {
//       ssmMock.on(PutParameterCommand).rejects({
//         name: "ParameterAlreadyExists",
//         message: "Parameter already exists",
//       });

//       const client = new SSMClient({});

//       await expect(
//         client.send(
//           new PutParameterCommand({
//             Name: "/myapp/existing",
//             Value: "value",
//             Type: "String",
//             Overwrite: false,
//           })
//         )
//       ).rejects.toMatchObject({
//         name: "ParameterAlreadyExists",
//       });
//     });
//   });

//   describe("DeleteParameter Operations", () => {
//     test("deletes parameter successfully", async () => {
//       ssmMock.on(DeleteParameterCommand).resolves({});

//       const client = new SSMClient({});
//       await client.send(
//         new DeleteParameterCommand({
//           Name: "/myapp/config/old-setting",
//         })
//       );

//       expect(ssmMock.calls()).toHaveLength(1);
//     });

//     test("handles delete of non-existent parameter", async () => {
//       ssmMock.on(DeleteParameterCommand).rejects({
//         name: "ParameterNotFound",
//         message: "Parameter not found",
//       });

//       const client = new SSMClient({});

//       await expect(
//         client.send(
//           new DeleteParameterCommand({
//             Name: "/myapp/missing",
//           })
//         )
//       ).rejects.toMatchObject({
//         name: "ParameterNotFound",
//       });
//     });
//   });

//   describe("GetParametersByPath Operations", () => {
//     test("gets parameters by path", async () => {
//       ssmMock.on(GetParametersByPathCommand).resolves({
//         Parameters: [
//           {
//             Name: "/myapp/database/host",
//             Value: "db.example.com",
//             Type: "String",
//           },
//           {
//             Name: "/myapp/database/port",
//             Value: "5432",
//             Type: "String",
//           },
//           {
//             Name: "/myapp/database/name",
//             Value: "mydb",
//             Type: "String",
//           },
//         ],
//       });

//       const client = new SSMClient({});
//       const result = await client.send(
//         new GetParametersByPathCommand({
//           Path: "/myapp/database",
//         })
//       );

//       expect(result.Parameters).toHaveLength(3);
//       result.Parameters?.forEach((param) => {
//         expect(param.Name).toMatch(/^\/myapp\/database\//);
//       });
//     });

//     test("gets parameters recursively", async () => {
//       ssmMock.on(GetParametersByPathCommand).resolves({
//         Parameters: [
//           { Name: "/myapp/prod/db/host", Value: "prod-db.com", Type: "String" },
//           { Name: "/myapp/prod/api/key", Value: "api-key", Type: "String" },
//           {
//             Name: "/myapp/prod/cache/host",
//             Value: "cache.com",
//             Type: "String",
//           },
//         ],
//       });

//       const client = new SSMClient({});
//       const result = await client.send(
//         new GetParametersByPathCommand({
//           Path: "/myapp/prod",
//           Recursive: true,
//         })
//       );

//       expect(result.Parameters).toHaveLength(3);
//     });

//     test("handles pagination", async () => {
//       ssmMock
//         .on(GetParametersByPathCommand)
//         .resolvesOnce({
//           Parameters: [
//             { Name: "/myapp/param1", Value: "value1", Type: "String" },
//           ],
//           NextToken: "token-1",
//         })
//         .resolvesOnce({
//           Parameters: [
//             { Name: "/myapp/param2", Value: "value2", Type: "String" },
//           ],
//           NextToken: undefined,
//         });

//       const client = new SSMClient({});

//       // First page
//       const page1 = await client.send(
//         new GetParametersByPathCommand({
//           Path: "/myapp",
//           MaxResults: 1,
//         })
//       );

//       expect(page1.Parameters).toHaveLength(1);
//       expect(page1.NextToken).toBe("token-1");

//       // Second page
//       const page2 = await client.send(
//         new GetParametersByPathCommand({
//           Path: "/myapp",
//           MaxResults: 1,
//           NextToken: page1.NextToken,
//         })
//       );

//       expect(page2.Parameters).toHaveLength(1);
//       expect(page2.NextToken).toBeUndefined();
//     });
//   });

//   describe("Environment-Specific Parameters", () => {
//     test("mocks different values for different environments", async () => {
//       ssmMock
//         .on(GetParameterCommand, {
//           Name: "/myapp/prod/database/host",
//         })
//         .resolves({
//           Parameter: {
//             Name: "/myapp/prod/database/host",
//             Value: "prod-db.example.com",
//             Type: "String",
//           },
//         })
//         .on(GetParameterCommand, {
//           Name: "/myapp/dev/database/host",
//         })
//         .resolves({
//           Parameter: {
//             Name: "/myapp/dev/database/host",
//             Value: "dev-db.example.com",
//             Type: "String",
//           },
//         });

//       const client = new SSMClient({});

//       // Production
//       const prodResult = await client.send(
//         new GetParameterCommand({
//           Name: "/myapp/prod/database/host",
//         })
//       );
//       expect(prodResult.Parameter?.Value).toBe("prod-db.example.com");

//       // Development
//       const devResult = await client.send(
//         new GetParameterCommand({
//           Name: "/myapp/dev/database/host",
//         })
//       );
//       expect(devResult.Parameter?.Value).toBe("dev-db.example.com");
//     });
//   });

//   describe("Real-World Scenarios", () => {
//     test("loads application configuration", async () => {
//       // Mock getting multiple config parameters
//       ssmMock.on(GetParametersByPathCommand).resolves({
//         Parameters: [
//           { Name: "/myapp/config/log-level", Value: "info", Type: "String" },
//           {
//             Name: "/myapp/config/max-connections",
//             Value: "100",
//             Type: "String",
//           },
//           { Name: "/myapp/config/timeout", Value: "30", Type: "String" },
//         ],
//       });

//       const client = new SSMClient({});
//       const result = await client.send(
//         new GetParametersByPathCommand({
//           Path: "/myapp/config",
//           Recursive: true,
//         })
//       );

//       // Build config object
//       const config = result.Parameters?.reduce(
//         (acc, param) => {
//           const key = param.Name?.split("/").pop() || "";
//           acc[key] = param.Value;
//           return acc;
//         },
//         {} as Record<string, string>
//       );

//       expect(config).toEqual({
//         "log-level": "info",
//         "max-connections": "100",
//         timeout: "30",
//       });
//     });

//     test("rotates secret", async () => {
//       // Mock getting current secret
//       ssmMock.on(GetParameterCommand).resolvesOnce({
//         Parameter: {
//           Name: "/myapp/secrets/api-key",
//           Value: "old-key",
//           Version: 1,
//         },
//       });

//       // Mock updating secret
//       ssmMock.on(PutParameterCommand).resolves({
//         Version: 2,
//       });

//       const client = new SSMClient({});

//       // Get current secret
//       const current = await client.send(
//         new GetParameterCommand({
//           Name: "/myapp/secrets/api-key",
//         })
//       );

//       expect(current.Parameter?.Value).toBe("old-key");

//       // Rotate secret
//       await client.send(
//         new PutParameterCommand({
//           Name: "/myapp/secrets/api-key",
//           Value: "new-key",
//           Type: "SecureString",
//           Overwrite: true,
//         })
//       );

//       expect(ssmMock.calls()).toHaveLength(2);
//     });
//   });
// });

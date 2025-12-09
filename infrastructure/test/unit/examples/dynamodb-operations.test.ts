/** @format */

// /** @format */

// import { mockClient } from "aws-sdk-client-mock";
// import {
//   DynamoDBClient,
//   PutItemCommand,
//   GetItemCommand,
//   UpdateItemCommand,
//   DeleteItemCommand,
//   QueryCommand,
//   ScanCommand,
// } from "@aws-sdk/client-dynamodb";

// const dynamoMock = mockClient(DynamoDBClient);

// describe("DynamoDB Operations Examples", () => {
//   beforeEach(() => {
//     dynamoMock.reset();
//   });

//   afterAll(() => {
//     dynamoMock.restore();
//   });

//   describe("PutItem Operations", () => {
//     test("puts item successfully", async () => {
//       dynamoMock.on(PutItemCommand).resolves({});

//       const client = new DynamoDBClient({});
//       await client.send(
//         new PutItemCommand({
//           TableName: "Users",
//           Item: {
//             userId: { S: "user-123" },
//             email: { S: "user@example.com" },
//             name: { S: "John Doe" },
//             createdAt: { N: "1701792000" },
//           },
//         })
//       );

//       expect(dynamoMock.calls()).toHaveLength(1);
//       const call = dynamoMock.call(0);
//       expect(call.args[0].input.TableName).toBe("Users");
//     });

//     test("handles conditional put failure", async () => {
//       dynamoMock.on(PutItemCommand).rejects({
//         name: "ConditionalCheckFailedException",
//         message: "The conditional request failed",
//       });

//       const client = new DynamoDBClient({});

//       await expect(
//         client.send(
//           new PutItemCommand({
//             TableName: "Users",
//             Item: {
//               userId: { S: "user-123" },
//             },
//             ConditionExpression: "attribute_not_exists(userId)",
//           })
//         )
//       ).rejects.toMatchObject({
//         name: "ConditionalCheckFailedException",
//       });
//     });
//   });

//   describe("GetItem Operations", () => {
//     test("gets item successfully", async () => {
//       dynamoMock.on(GetItemCommand).resolves({
//         Item: {
//           userId: { S: "user-123" },
//           email: { S: "user@example.com" },
//           name: { S: "John Doe" },
//           age: { N: "30" },
//         },
//       });

//       const client = new DynamoDBClient({});
//       const result = await client.send(
//         new GetItemCommand({
//           TableName: "Users",
//           Key: {
//             userId: { S: "user-123" },
//           },
//         })
//       );

//       expect(result.Item).toBeDefined();
//       expect(result.Item?.userId.S).toBe("user-123");
//       expect(result.Item?.email.S).toBe("user@example.com");
//     });

//     test("handles item not found", async () => {
//       dynamoMock.on(GetItemCommand).resolves({
//         Item: undefined,
//       });

//       const client = new DynamoDBClient({});
//       const result = await client.send(
//         new GetItemCommand({
//           TableName: "Users",
//           Key: {
//             userId: { S: "non-existent" },
//           },
//         })
//       );

//       expect(result.Item).toBeUndefined();
//     });

//     test("gets item with projection", async () => {
//       dynamoMock
//         .on(GetItemCommand, {
//           TableName: "Users",
//           Key: { userId: { S: "user-123" } },
//           ProjectionExpression: "email, #n",
//         })
//         .resolves({
//           Item: {
//             email: { S: "user@example.com" },
//             name: { S: "John Doe" },
//           },
//         });

//       const client = new DynamoDBClient({});
//       const result = await client.send(
//         new GetItemCommand({
//           TableName: "Users",
//           Key: {
//             userId: { S: "user-123" },
//           },
//           ProjectionExpression: "email, #n",
//           ExpressionAttributeNames: {
//             "#n": "name",
//           },
//         })
//       );

//       expect(result.Item?.email).toBeDefined();
//       expect(result.Item?.name).toBeDefined();
//       expect(result.Item?.userId).toBeUndefined();
//     });
//   });

//   describe("UpdateItem Operations", () => {
//     test("updates item successfully", async () => {
//       dynamoMock.on(UpdateItemCommand).resolves({
//         Attributes: {
//           userId: { S: "user-123" },
//           email: { S: "newemail@example.com" },
//           updatedAt: { N: "1701792100" },
//         },
//       });

//       const client = new DynamoDBClient({});
//       const result = await client.send(
//         new UpdateItemCommand({
//           TableName: "Users",
//           Key: {
//             userId: { S: "user-123" },
//           },
//           UpdateExpression: "SET email = :email, updatedAt = :timestamp",
//           ExpressionAttributeValues: {
//             ":email": { S: "newemail@example.com" },
//             ":timestamp": { N: "1701792100" },
//           },
//           ReturnValues: "ALL_NEW",
//         })
//       );

//       expect(result.Attributes?.email.S).toBe("newemail@example.com");
//     });

//     test("handles update with condition", async () => {
//       dynamoMock.on(UpdateItemCommand).resolves({});

//       const client = new DynamoDBClient({});
//       await client.send(
//         new UpdateItemCommand({
//           TableName: "Users",
//           Key: {
//             userId: { S: "user-123" },
//           },
//           UpdateExpression: "SET #status = :status",
//           ConditionExpression: "#status = :oldStatus",
//           ExpressionAttributeNames: {
//             "#status": "status",
//           },
//           ExpressionAttributeValues: {
//             ":status": { S: "active" },
//             ":oldStatus": { S: "pending" },
//           },
//         })
//       );

//       expect(dynamoMock.calls()).toHaveLength(1);
//     });
//   });

//   describe("DeleteItem Operations", () => {
//     test("deletes item successfully", async () => {
//       dynamoMock.on(DeleteItemCommand).resolves({});

//       const client = new DynamoDBClient({});
//       await client.send(
//         new DeleteItemCommand({
//           TableName: "Users",
//           Key: {
//             userId: { S: "user-123" },
//           },
//         })
//       );

//       expect(dynamoMock.calls()).toHaveLength(1);
//     });

//     test("deletes with return values", async () => {
//       dynamoMock.on(DeleteItemCommand).resolves({
//         Attributes: {
//           userId: { S: "user-123" },
//           email: { S: "deleted@example.com" },
//         },
//       });

//       const client = new DynamoDBClient({});
//       const result = await client.send(
//         new DeleteItemCommand({
//           TableName: "Users",
//           Key: {
//             userId: { S: "user-123" },
//           },
//           ReturnValues: "ALL_OLD",
//         })
//       );

//       expect(result.Attributes?.email.S).toBe("deleted@example.com");
//     });
//   });

//   describe("Query Operations", () => {
//     test("queries items by partition key", async () => {
//       dynamoMock.on(QueryCommand).resolves({
//         Items: [
//           {
//             userId: { S: "user-123" },
//             orderId: { S: "order-1" },
//             amount: { N: "100" },
//           },
//           {
//             userId: { S: "user-123" },
//             orderId: { S: "order-2" },
//             amount: { N: "200" },
//           },
//         ],
//         Count: 2,
//         ScannedCount: 2,
//       });

//       const client = new DynamoDBClient({});
//       const result = await client.send(
//         new QueryCommand({
//           TableName: "Orders",
//           KeyConditionExpression: "userId = :userId",
//           ExpressionAttributeValues: {
//             ":userId": { S: "user-123" },
//           },
//         })
//       );

//       expect(result.Items).toHaveLength(2);
//       expect(result.Count).toBe(2);
//     });

//     test("queries with filter expression", async () => {
//       dynamoMock.on(QueryCommand).resolves({
//         Items: [
//           {
//             userId: { S: "user-123" },
//             orderId: { S: "order-1" },
//             amount: { N: "150" },
//             status: { S: "completed" },
//           },
//         ],
//         Count: 1,
//         ScannedCount: 5,
//       });

//       const client = new DynamoDBClient({});
//       const result = await client.send(
//         new QueryCommand({
//           TableName: "Orders",
//           KeyConditionExpression: "userId = :userId",
//           FilterExpression: "amount > :minAmount AND #status = :status",
//           ExpressionAttributeNames: {
//             "#status": "status",
//           },
//           ExpressionAttributeValues: {
//             ":userId": { S: "user-123" },
//             ":minAmount": { N: "100" },
//             ":status": { S: "completed" },
//           },
//         })
//       );

//       expect(result.Items).toHaveLength(1);
//       expect(result.Count).toBe(1);
//       expect(result.ScannedCount).toBe(5);
//     });

//     test("handles pagination", async () => {
//       dynamoMock
//         .on(QueryCommand)
//         .resolvesOnce({
//           Items: [{ userId: { S: "user-1" } }],
//           LastEvaluatedKey: { userId: { S: "user-1" } },
//         })
//         .resolvesOnce({
//           Items: [{ userId: { S: "user-2" } }],
//           LastEvaluatedKey: undefined,
//         });

//       const client = new DynamoDBClient({});

//       // First page
//       const page1 = await client.send(
//         new QueryCommand({
//           TableName: "Users",
//           KeyConditionExpression: "userId = :userId",
//           ExpressionAttributeValues: {
//             ":userId": { S: "user-123" },
//           },
//           Limit: 1,
//         })
//       );

//       expect(page1.Items).toHaveLength(1);
//       expect(page1.LastEvaluatedKey).toBeDefined();

//       // Second page
//       const page2 = await client.send(
//         new QueryCommand({
//           TableName: "Users",
//           KeyConditionExpression: "userId = :userId",
//           ExpressionAttributeValues: {
//             ":userId": { S: "user-123" },
//           },
//           Limit: 1,
//           ExclusiveStartKey: page1.LastEvaluatedKey,
//         })
//       );

//       expect(page2.Items).toHaveLength(1);
//       expect(page2.LastEvaluatedKey).toBeUndefined();
//     });
//   });

//   describe("Scan Operations", () => {
//     test("scans entire table", async () => {
//       dynamoMock.on(ScanCommand).resolves({
//         Items: [
//           { userId: { S: "user-1" } },
//           { userId: { S: "user-2" } },
//           { userId: { S: "user-3" } },
//         ],
//         Count: 3,
//         ScannedCount: 3,
//       });

//       const client = new DynamoDBClient({});
//       const result = await client.send(
//         new ScanCommand({
//           TableName: "Users",
//         })
//       );

//       expect(result.Items).toHaveLength(3);
//       expect(result.Count).toBe(3);
//     });

//     test("scans with filter", async () => {
//       dynamoMock.on(ScanCommand).resolves({
//         Items: [
//           {
//             userId: { S: "user-1" },
//             status: { S: "active" },
//           },
//         ],
//         Count: 1,
//         ScannedCount: 10,
//       });

//       const client = new DynamoDBClient({});
//       const result = await client.send(
//         new ScanCommand({
//           TableName: "Users",
//           FilterExpression: "#status = :status",
//           ExpressionAttributeNames: {
//             "#status": "status",
//           },
//           ExpressionAttributeValues: {
//             ":status": { S: "active" },
//           },
//         })
//       );

//       expect(result.Items).toHaveLength(1);
//       expect(result.Count).toBe(1);
//       expect(result.ScannedCount).toBe(10);
//     });
//   });

//   describe("Error Handling", () => {
//     test("handles throttling errors", async () => {
//       dynamoMock.on(PutItemCommand).rejects({
//         name: "ProvisionedThroughputExceededException",
//         message: "Rate exceeded",
//       });

//       const client = new DynamoDBClient({});

//       await expect(
//         client.send(
//           new PutItemCommand({
//             TableName: "Users",
//             Item: { userId: { S: "user-123" } },
//           })
//         )
//       ).rejects.toMatchObject({
//         name: "ProvisionedThroughputExceededException",
//       });
//     });

//     test("handles validation errors", async () => {
//       dynamoMock.on(PutItemCommand).rejects({
//         name: "ValidationException",
//         message: "Invalid attribute value type",
//       });

//       const client = new DynamoDBClient({});

//       await expect(
//         client.send(
//           new PutItemCommand({
//             TableName: "Users",
//             Item: { userId: { S: "user-123" } },
//           })
//         )
//       ).rejects.toMatchObject({
//         name: "ValidationException",
//       });
//     });
//   });
// });

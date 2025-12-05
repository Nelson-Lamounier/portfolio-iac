/** @format */

import { mockClient } from "aws-sdk-client-mock";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
} from "@aws-sdk/client-s3";

// Create mock client
const s3Mock = mockClient(S3Client);

describe("S3 Operations Examples", () => {
  beforeEach(() => {
    s3Mock.reset();
  });

  afterAll(() => {
    s3Mock.restore();
  });

  describe("PutObject Operations", () => {
    test("uploads file successfully", async () => {
      // Mock successful upload
      s3Mock.on(PutObjectCommand).resolves({
        ETag: '"mock-etag-12345"',
        VersionId: "mock-version-1",
      });

      const client = new S3Client({});
      const result = await client.send(
        new PutObjectCommand({
          Bucket: "my-bucket",
          Key: "test-file.txt",
          Body: "Hello World",
          ContentType: "text/plain",
        })
      );

      expect(result.ETag).toBe('"mock-etag-12345"');
      expect(result.VersionId).toBe("mock-version-1");
      expect(s3Mock.calls()).toHaveLength(1);
    });

    test("handles upload errors", async () => {
      // Mock upload error
      s3Mock.on(PutObjectCommand).rejects(new Error("Access Denied"));

      const client = new S3Client({});

      await expect(
        client.send(
          new PutObjectCommand({
            Bucket: "restricted-bucket",
            Key: "file.txt",
            Body: "content",
          })
        )
      ).rejects.toThrow("Access Denied");
    });

    test("verifies upload parameters", async () => {
      s3Mock.on(PutObjectCommand).resolves({});

      const client = new S3Client({});
      await client.send(
        new PutObjectCommand({
          Bucket: "my-bucket",
          Key: "uploads/document.pdf",
          Body: Buffer.from("PDF content"),
          ContentType: "application/pdf",
          Metadata: {
            uploadedBy: "user123",
            timestamp: "2025-12-05",
          },
        })
      );

      const call = s3Mock.call(0);
      expect(call.args[0].input).toMatchObject({
        Bucket: "my-bucket",
        Key: "uploads/document.pdf",
        ContentType: "application/pdf",
        Metadata: {
          uploadedBy: "user123",
          timestamp: "2025-12-05",
        },
      });
    });
  });

  describe("GetObject Operations", () => {
    test("retrieves file successfully", async () => {
      // Mock successful retrieval
      s3Mock.on(GetObjectCommand).resolves({
        Body: {
          transformToString: async () => "File content",
        } as any,
        ContentType: "text/plain",
        ContentLength: 12,
      });

      const client = new S3Client({});
      const result = await client.send(
        new GetObjectCommand({
          Bucket: "my-bucket",
          Key: "test-file.txt",
        })
      );

      expect(result.ContentType).toBe("text/plain");
      expect(result.ContentLength).toBe(12);

      const content = await result.Body?.transformToString();
      expect(content).toBe("File content");
    });

    test("handles file not found", async () => {
      s3Mock.on(GetObjectCommand).rejects({
        name: "NoSuchKey",
        message: "The specified key does not exist",
      });

      const client = new S3Client({});

      await expect(
        client.send(
          new GetObjectCommand({
            Bucket: "my-bucket",
            Key: "missing-file.txt",
          })
        )
      ).rejects.toMatchObject({
        name: "NoSuchKey",
      });
    });

    test("retrieves specific version", async () => {
      s3Mock
        .on(GetObjectCommand, {
          Bucket: "my-bucket",
          Key: "file.txt",
          VersionId: "version-1",
        })
        .resolves({
          Body: {
            transformToString: async () => "Version 1 content",
          } as any,
          VersionId: "version-1",
        });

      const client = new S3Client({});
      const result = await client.send(
        new GetObjectCommand({
          Bucket: "my-bucket",
          Key: "file.txt",
          VersionId: "version-1",
        })
      );

      expect(result.VersionId).toBe("version-1");
    });
  });

  describe("DeleteObject Operations", () => {
    test("deletes file successfully", async () => {
      s3Mock.on(DeleteObjectCommand).resolves({
        DeleteMarker: true,
        VersionId: "delete-marker-1",
      });

      const client = new S3Client({});
      const result = await client.send(
        new DeleteObjectCommand({
          Bucket: "my-bucket",
          Key: "file-to-delete.txt",
        })
      );

      expect(result.DeleteMarker).toBe(true);
      expect(s3Mock.calls()).toHaveLength(1);
    });

    test("handles delete errors", async () => {
      s3Mock.on(DeleteObjectCommand).rejects(new Error("Permission denied"));

      const client = new S3Client({});

      await expect(
        client.send(
          new DeleteObjectCommand({
            Bucket: "protected-bucket",
            Key: "protected-file.txt",
          })
        )
      ).rejects.toThrow("Permission denied");
    });
  });

  describe("ListObjects Operations", () => {
    test("lists objects in bucket", async () => {
      s3Mock.on(ListObjectsV2Command).resolves({
        Contents: [
          {
            Key: "file1.txt",
            Size: 100,
            LastModified: new Date("2025-12-01"),
          },
          {
            Key: "file2.txt",
            Size: 200,
            LastModified: new Date("2025-12-02"),
          },
        ],
        KeyCount: 2,
        IsTruncated: false,
      });

      const client = new S3Client({});
      const result = await client.send(
        new ListObjectsV2Command({
          Bucket: "my-bucket",
          Prefix: "uploads/",
        })
      );

      expect(result.Contents).toHaveLength(2);
      expect(result.KeyCount).toBe(2);
      expect(result.IsTruncated).toBe(false);
    });

    test("handles pagination", async () => {
      // First page
      s3Mock
        .on(ListObjectsV2Command)
        .resolvesOnce({
          Contents: [{ Key: "file1.txt" }],
          NextContinuationToken: "token-1",
          IsTruncated: true,
        })
        // Second page
        .resolvesOnce({
          Contents: [{ Key: "file2.txt" }],
          IsTruncated: false,
        });

      const client = new S3Client({});

      // First call
      const page1 = await client.send(
        new ListObjectsV2Command({
          Bucket: "my-bucket",
        })
      );

      expect(page1.Contents).toHaveLength(1);
      expect(page1.IsTruncated).toBe(true);

      // Second call with continuation token
      const page2 = await client.send(
        new ListObjectsV2Command({
          Bucket: "my-bucket",
          ContinuationToken: page1.NextContinuationToken,
        })
      );

      expect(page2.Contents).toHaveLength(1);
      expect(page2.IsTruncated).toBe(false);
      expect(s3Mock.calls()).toHaveLength(2);
    });
  });

  describe("Multiple Operations", () => {
    test("performs upload and retrieval sequence", async () => {
      // Mock upload
      s3Mock.on(PutObjectCommand).resolves({
        ETag: '"etag-123"',
      });

      // Mock retrieval
      s3Mock.on(GetObjectCommand).resolves({
        Body: {
          transformToString: async () => "Uploaded content",
        } as any,
      });

      const client = new S3Client({});

      // Upload
      await client.send(
        new PutObjectCommand({
          Bucket: "my-bucket",
          Key: "test.txt",
          Body: "Uploaded content",
        })
      );

      // Retrieve
      const result = await client.send(
        new GetObjectCommand({
          Bucket: "my-bucket",
          Key: "test.txt",
        })
      );

      const content = await result.Body?.transformToString();
      expect(content).toBe("Uploaded content");

      // Verify call order
      expect(s3Mock.calls()).toHaveLength(2);
      expect(s3Mock.call(0).args[0]).toBeInstanceOf(PutObjectCommand);
      expect(s3Mock.call(1).args[0]).toBeInstanceOf(GetObjectCommand);
    });
  });

  describe("Conditional Mocking", () => {
    test("mocks different responses for different buckets", async () => {
      s3Mock
        .on(GetObjectCommand, {
          Bucket: "public-bucket",
        })
        .resolves({
          Body: {
            transformToString: async () => "Public content",
          } as any,
        })
        .on(GetObjectCommand, {
          Bucket: "private-bucket",
        })
        .rejects(new Error("Access Denied"));

      const client = new S3Client({});

      // Public bucket - success
      const publicResult = await client.send(
        new GetObjectCommand({
          Bucket: "public-bucket",
          Key: "file.txt",
        })
      );
      const publicContent = await publicResult.Body?.transformToString();
      expect(publicContent).toBe("Public content");

      // Private bucket - error
      await expect(
        client.send(
          new GetObjectCommand({
            Bucket: "private-bucket",
            Key: "file.txt",
          })
        )
      ).rejects.toThrow("Access Denied");
    });
  });
});

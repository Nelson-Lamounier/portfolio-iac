/** @format */

import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

interface ResumeDownloadEvent {
  resumeKey?: string; // e.g., "resumes/john-doe-resume.pdf"
}

interface ResumeDownloadResponse {
  statusCode: number;
  headers: {
    "Content-Type": string;
    "Access-Control-Allow-Origin": string;
  };
  body: string;
}

/**
 * Lambda handler for resume download
 *
 * Generates a pre-signed URL for downloading a resume from S3
 *
 * Environment variables:
 * - BUCKET_NAME: S3 bucket containing resumes
 */
export const handler = async (
  event: ResumeDownloadEvent
): Promise<ResumeDownloadResponse> => {
  console.log("Event:", JSON.stringify(event, null, 2));

  const bucketName = process.env.BUCKET_NAME;
  if (!bucketName) {
    return {
      statusCode: 500,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
      body: JSON.stringify({ error: "BUCKET_NAME not configured" }),
    };
  }

  const resumeKey = event.resumeKey || "resumes/resume.pdf";

  try {
    const s3Client = new S3Client({});

    // Generate pre-signed URL valid for 5 minutes
    const command = new GetObjectCommand({
      Bucket: bucketName,
      Key: resumeKey,
    });

    const signedUrl = await getSignedUrl(s3Client, command, {
      expiresIn: 300, // 5 minutes
    });

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
      body: JSON.stringify({
        downloadUrl: signedUrl,
        expiresIn: 300,
      }),
    };
  } catch (error) {
    console.error("Error generating download URL:", error);

    return {
      statusCode: 500,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
      body: JSON.stringify({
        error: "Failed to generate download URL",
      }),
    };
  }
};

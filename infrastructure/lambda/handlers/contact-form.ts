/** @format */

import { SNSClient, PublishCommand } from "@aws-sdk/client-sns";

interface ContactFormEvent {
  name: string;
  email: string;
  subject?: string;
  message: string;
}

interface ContactFormResponse {
  statusCode: number;
  headers: {
    "Content-Type": string;
    "Access-Control-Allow-Origin": string;
  };
  body: string;
}

/**
 * Lambda handler for contact form submissions
 *
 * Validates input and sends notification via SNS
 *
 * Environment variables:
 * - SNS_TOPIC_ARN: SNS topic for contact form notifications
 */
export const handler = async (
  event: ContactFormEvent
): Promise<ContactFormResponse> => {
  console.log("Event:", JSON.stringify(event, null, 2));

  const topicArn = process.env.SNS_TOPIC_ARN;
  if (!topicArn) {
    return {
      statusCode: 500,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
      body: JSON.stringify({ error: "SNS_TOPIC_ARN not configured" }),
    };
  }

  // Validate required fields
  if (!event.name || !event.email || !event.message) {
    return {
      statusCode: 400,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
      body: JSON.stringify({
        error: "Missing required fields: name, email, message",
      }),
    };
  }

  // Basic email validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(event.email)) {
    return {
      statusCode: 400,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
      body: JSON.stringify({ error: "Invalid email address" }),
    };
  }

  try {
    const snsClient = new SNSClient({});

    // Prepare message
    const message = `
New Contact Form Submission

Name: ${event.name}
Email: ${event.email}
Subject: ${event.subject || "No subject"}

Message:
${event.message}
    `.trim();

    // Publish to SNS
    await snsClient.send(
      new PublishCommand({
        TopicArn: topicArn,
        Subject: `Contact Form: ${event.subject || "New Message"}`,
        Message: message,
      })
    );

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
      body: JSON.stringify({
        success: true,
        message: "Your message has been sent successfully",
      }),
    };
  } catch (error) {
    console.error("Error sending notification:", error);

    return {
      statusCode: 500,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
      body: JSON.stringify({
        error: "Failed to send message. Please try again later.",
      }),
    };
  }
};

import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";

// Initialize SES client
const sesClient = new SESClient({
  region: process.env.AWS_REGION || "us-east-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

export interface SendEmailParams {
  to: string;
  subject: string;
  htmlBody: string;
  textBody?: string;
}

/**
 * Send an email using AWS SES
 */
export async function sendEmail({
  to,
  subject,
  htmlBody,
  textBody,
}: SendEmailParams): Promise<void> {
  const fromEmail = process.env.SES_FROM_EMAIL;
  if (!fromEmail) {
    throw new Error("SES_FROM_EMAIL environment variable is not set");
  }

  const command = new SendEmailCommand({
    Source: fromEmail,
    Destination: {
      ToAddresses: [to],
    },
    Message: {
      Subject: {
        Data: subject,
        Charset: "UTF-8",
      },
      Body: {
        Html: {
          Data: htmlBody,
          Charset: "UTF-8",
        },
        ...(textBody && {
          Text: {
            Data: textBody,
            Charset: "UTF-8",
          },
        }),
      },
    },
  });

  try {
    const response = await sesClient.send(command);
    console.log("Email sent successfully:", response.MessageId);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Error sending email:", message);
    throw new Error(`Failed to send email: ${message}`);
  }
}


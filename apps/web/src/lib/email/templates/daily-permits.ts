import type { Permit } from "@prisma/client";

export interface DailyPermitsEmailData {
  date: string; // Date string in format like "October 27, 2025"
  permitCount: number;
  permits: Permit[];
  baseUrl: string;
}

/**
 * Generate HTML email template for daily permits
 */
export function generateDailyPermitsEmail(data: DailyPermitsEmailData): string {
  const { date, permitCount, permits, baseUrl } = data;

  const permitRows = permits
    .map((permit) => {
      const address = permit.address || "N/A";
      const city = permit.city || "N/A";
      const permitType = permit.permitType || "N/A";
      const value = permit.value
        ? `$${permit.value.toLocaleString()}`
        : "N/A";
      const appliedDate = permit.appliedDateString || "N/A";
      const permitUrl = `${baseUrl}/?permitNumber=${encodeURIComponent(
        permit.permitNumber
      )}`;

      return `
        <tr style="border-bottom: 1px solid #e5e7eb;">
          <td style="padding: 12px 0;">
            <a href="${permitUrl}" style="color: #2563eb; text-decoration: none; font-weight: 600;">
              ${permit.permitNumber}
            </a>
          </td>
          <td style="padding: 12px 0; color: #374151;">${address}</td>
          <td style="padding: 12px 0; color: #374151;">${city}</td>
          <td style="padding: 12px 0; color: #374151;">${permitType}</td>
          <td style="padding: 12px 0; color: #374151;">${value}</td>
          <td style="padding: 12px 0; color: #374151;">${appliedDate}</td>
        </tr>
      `;
    })
    .join("");

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>New Permits - ${date}</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f9fafb;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td style="padding: 40px 20px;">
        <table role="presentation" style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);">
          <!-- Header -->
          <tr>
            <td style="padding: 32px 32px 24px; background-color: #2563eb; border-radius: 8px 8px 0 0;">
              <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: 600;">
                New Permits - ${date}
              </h1>
            </td>
          </tr>
          
          <!-- Content -->
          <tr>
            <td style="padding: 32px;">
              <p style="margin: 0 0 24px; color: #374151; font-size: 16px; line-height: 1.5;">
                We found <strong>${permitCount}</strong> new permit${permitCount !== 1 ? "s" : ""} applied on ${date}.
              </p>
              
              ${permitCount > 0 ? `
              <table role="presentation" style="width: 100%; border-collapse: collapse; margin-top: 24px;">
                <thead>
                  <tr style="background-color: #f9fafb; border-bottom: 2px solid #e5e7eb;">
                    <th style="padding: 12px 0; text-align: left; color: #6b7280; font-size: 12px; font-weight: 600; text-transform: uppercase;">Permit #</th>
                    <th style="padding: 12px 0; text-align: left; color: #6b7280; font-size: 12px; font-weight: 600; text-transform: uppercase;">Address</th>
                    <th style="padding: 12px 0; text-align: left; color: #6b7280; font-size: 12px; font-weight: 600; text-transform: uppercase;">City</th>
                    <th style="padding: 12px 0; text-align: left; color: #6b7280; font-size: 12px; font-weight: 600; text-transform: uppercase;">Type</th>
                    <th style="padding: 12px 0; text-align: left; color: #6b7280; font-size: 12px; font-weight: 600; text-transform: uppercase;">Value</th>
                    <th style="padding: 12px 0; text-align: left; color: #6b7280; font-size: 12px; font-weight: 600; text-transform: uppercase;">Applied Date</th>
                  </tr>
                </thead>
                <tbody>
                  ${permitRows}
                </tbody>
              </table>
              ` : ""}
              
              <div style="margin-top: 32px; padding-top: 24px; border-top: 1px solid #e5e7eb;">
                <a href="${baseUrl}" style="display: inline-block; padding: 12px 24px; background-color: #2563eb; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: 600;">
                  View All Permits
                </a>
              </div>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="padding: 24px 32px; background-color: #f9fafb; border-radius: 0 0 8px 8px; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0; color: #6b7280; font-size: 12px; line-height: 1.5;">
                You're receiving this email because you're a premium subscriber to Project Permit.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}

/**
 * Generate plain text version of daily permits email
 */
export function generateDailyPermitsEmailText(
  data: DailyPermitsEmailData
): string {
  const { date, permitCount, permits, baseUrl } = data;

  if (permitCount === 0) {
    return `New Permits - ${date}

We found 0 new permits applied on ${date}.

View all permits: ${baseUrl}
`;
  }

  const permitList = permits
    .map((permit) => {
      const address = permit.address || "N/A";
      const city = permit.city || "N/A";
      const permitType = permit.permitType || "N/A";
      const value = permit.value
        ? `$${permit.value.toLocaleString()}`
        : "N/A";
      const appliedDate = permit.appliedDateString || "N/A";

      return `- ${permit.permitNumber}: ${address}, ${city} (${permitType}) - ${value} - Applied: ${appliedDate}`;
    })
    .join("\n");

  return `New Permits - ${date}

We found ${permitCount} new permit${permitCount !== 1 ? "s" : ""} applied on ${date}.

${permitList}

View all permits: ${baseUrl}

---
You're receiving this email because you're a premium subscriber to Project Permit.
`;
}


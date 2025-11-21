export interface DailyPermitsEmailData {
  date: string; // Date string in format like "October 27, 2025"
  minDateString: string; // YYYY-MM-DD format for filtering
  maxDateString: string; // YYYY-MM-DD format for filtering and display
  permitCount: number;
  baseUrl: string;
}

/**
 * Generate HTML email template for daily permits
 */
export function generateDailyPermitsEmail(data: DailyPermitsEmailData): string {
  const { date, minDateString, maxDateString, permitCount, baseUrl } = data;

  // Format dates for display (MM/DD format)
  const formatDateForDisplay = (dateStr: string): string => {
    const [year, month, day] = dateStr.split('-');
    return `${month}/${day}`;
  };
  const minDateDisplay = formatDateForDisplay(minDateString);
  const maxDateDisplay = formatDateForDisplay(maxDateString);

  // Create a link that filters for exactly these permits
  const filterUrl = `${baseUrl}/?minAppliedDate=${encodeURIComponent(minDateString)}&maxAppliedDate=${encodeURIComponent(maxDateString)}`;

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
                We found <strong>${permitCount}</strong> new permit${permitCount !== 1 ? "s" : ""} applied from ${minDateDisplay} to ${maxDateDisplay}.
              </p>
              
              <div style="margin-top: 32px; padding-top: 24px; border-top: 1px solid #e5e7eb;">
                <a href="${filterUrl}" style="display: inline-block; padding: 12px 24px; background-color: #2563eb; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: 600;">
                  View These Permits
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
  const { date, minDateString, maxDateString, permitCount, baseUrl } = data;

  // Format dates for display (MM/DD format)
  const formatDateForDisplay = (dateStr: string): string => {
    const [year, month, day] = dateStr.split('-');
    return `${month}/${day}`;
  };
  const minDateDisplay = formatDateForDisplay(minDateString);
  const maxDateDisplay = formatDateForDisplay(maxDateString);

  const filterUrl = `${baseUrl}/?minAppliedDate=${encodeURIComponent(minDateString)}&maxAppliedDate=${encodeURIComponent(maxDateString)}`;

  if (permitCount === 0) {
    return `New Permits - ${date}

We found 0 new permits applied from ${minDateDisplay} to ${maxDateDisplay}.

View all permits: ${baseUrl}
`;
  }

  return `New Permits - ${date}

We found ${permitCount} new permit${permitCount !== 1 ? "s" : ""} applied from ${minDateDisplay} to ${maxDateDisplay}.

View these permits: ${filterUrl}

---
You're receiving this email because you're a premium subscriber to Project Permit.
`;
}


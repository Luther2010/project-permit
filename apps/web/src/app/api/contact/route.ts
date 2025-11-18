import { NextResponse } from "next/server";
import { sendEmail } from "@/lib/email/ses-client";

// Simple in-memory rate limiting store
// Key: IP address, Value: { count: number, resetAt: Date }
const rateLimitStore = new Map<
    string,
    { count: number; resetAt: Date }
>();

const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const RATE_LIMIT_MAX_REQUESTS = 5;

function getClientIP(request: Request): string {
    // Check for forwarded IP (from proxy/load balancer)
    const forwardedFor = request.headers.get("x-forwarded-for");
    if (forwardedFor) {
        return forwardedFor.split(",")[0].trim();
    }

    // Check for real IP
    const realIP = request.headers.get("x-real-ip");
    if (realIP) {
        return realIP;
    }

    // Fallback to a default IP (shouldn't happen in production)
    return "unknown";
}

function checkRateLimit(ip: string): { allowed: boolean; resetAt?: Date } {
    const now = new Date();
    const record = rateLimitStore.get(ip);

    // If no record or window expired, create new record
    if (!record || now > record.resetAt) {
        rateLimitStore.set(ip, {
            count: 1,
            resetAt: new Date(now.getTime() + RATE_LIMIT_WINDOW_MS),
        });
        return { allowed: true };
    }

    // Check if limit exceeded
    if (record.count >= RATE_LIMIT_MAX_REQUESTS) {
        return { allowed: false, resetAt: record.resetAt };
    }

    // Increment count
    record.count++;
    return { allowed: true };
}

function sanitizeInput(input: string, maxLength: number): string {
    return String(input || "")
        .trim()
        .slice(0, maxLength)
        .replace(/[<>]/g, ""); // Basic HTML tag removal
}

export async function POST(request: Request) {
    try {
        // Get client IP for rate limiting
        const ip = getClientIP(request);

        // Check rate limit
        const rateLimitResult = checkRateLimit(ip);
        if (!rateLimitResult.allowed) {
            const resetAt = rateLimitResult.resetAt;
            const retryAfter = resetAt
                ? Math.ceil((resetAt.getTime() - Date.now()) / 1000)
                : 3600;

            return NextResponse.json(
                {
                    error: "Too many requests. Please try again later.",
                },
                {
                    status: 429,
                    headers: {
                        "Retry-After": String(retryAfter),
                        "X-RateLimit-Limit": String(RATE_LIMIT_MAX_REQUESTS),
                        "X-RateLimit-Remaining": "0",
                    },
                }
            );
        }

        // Parse request body
        const body = await request.json();
        const { name, email, message } = body;

        // Validate and sanitize input
        const sanitizedName = sanitizeInput(name, 100);
        const sanitizedEmail = sanitizeInput(email, 254);
        const sanitizedMessage = sanitizeInput(message, 5000);

        // Validation
        if (!sanitizedName) {
            return NextResponse.json(
                { error: "Name is required." },
                { status: 400 }
            );
        }

        if (!sanitizedEmail) {
            return NextResponse.json(
                { error: "Email is required." },
                { status: 400 }
            );
        }

        // Email format validation
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(sanitizedEmail)) {
            return NextResponse.json(
                { error: "Invalid email format." },
                { status: 400 }
            );
        }

        if (!sanitizedMessage) {
            return NextResponse.json(
                { error: "Message is required." },
                { status: 400 }
            );
        }

        if (sanitizedMessage.length < 10) {
            return NextResponse.json(
                { error: "Message is too short (min 10 characters)." },
                { status: 400 }
            );
        }

        // Get admin email from environment
        const adminEmail = process.env.CONTACT_ADMIN_EMAIL;
        if (!adminEmail) {
            console.error(
                "CONTACT_ADMIN_EMAIL or SES_FROM_EMAIL environment variable is not set"
            );
            return NextResponse.json(
                { error: "Contact form is not configured" },
                { status: 500 }
            );
        }

        // Prepare email content
        const subject = `New Contact Form Submission from ${sanitizedName}`;
        const timestamp = new Date().toLocaleString("en-US", {
            timeZone: "America/Los_Angeles",
            dateStyle: "long",
            timeStyle: "short",
        });

        const htmlBody = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
    <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #2563eb; border-bottom: 2px solid #2563eb; padding-bottom: 10px;">
            New Contact Form Submission
        </h2>
        
        <div style="background-color: #f9fafb; padding: 15px; border-radius: 5px; margin: 20px 0;">
            <p style="margin: 5px 0;"><strong>Name:</strong> ${sanitizedName}</p>
            <p style="margin: 5px 0;"><strong>Email:</strong> <a href="mailto:${sanitizedEmail}">${sanitizedEmail}</a></p>
            <p style="margin: 5px 0;"><strong>Submitted:</strong> ${timestamp}</p>
        </div>
        
        <div style="margin: 20px 0;">
            <h3 style="color: #374151; margin-bottom: 10px;">Message:</h3>
            <div style="background-color: #ffffff; padding: 15px; border-left: 4px solid #2563eb; white-space: pre-wrap;">
${sanitizedMessage.replace(/\n/g, "<br>")}
            </div>
        </div>
        
        <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb; font-size: 12px; color: #6b7280;">
            <p>This email was sent from the PermitPulse contact form.</p>
            <p>You can reply directly to this email to respond to ${sanitizedName}.</p>
        </div>
    </div>
</body>
</html>
        `.trim();

        const textBody = `
New Contact Form Submission

Name: ${sanitizedName}
Email: ${sanitizedEmail}
Submitted: ${timestamp}

Message:
${sanitizedMessage}

---
This email was sent from the PermitPulse contact form.
You can reply directly to this email to respond to ${sanitizedName}.
        `.trim();

        // Send email
        await sendEmail({
            to: adminEmail,
            subject,
            htmlBody,
            textBody,
        });

        // Return success response
        return NextResponse.json({
            message: "Thank you for contacting us! We'll get back to you soon.",
        });
    } catch (error: unknown) {
        console.error("Error processing contact form:", error);
        return NextResponse.json(
            { error: "Failed to send message. Please try again later." },
            { status: 500 }
        );
    }
}


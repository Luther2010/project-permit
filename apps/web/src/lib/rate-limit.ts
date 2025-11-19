// Simple in-memory rate limiting store
// Key: IP address, Value: { count: number, resetAt: Date }
const rateLimitStore = new Map<
    string,
    { count: number; resetAt: Date }
>();

const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const RATE_LIMIT_MAX_REQUESTS = 5;

export function getClientIP(request: Request): string {
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

export function checkRateLimit(ip: string): { allowed: boolean; resetAt?: Date } {
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

export function sanitizeInput(input: string, maxLength: number): string {
    return String(input || "")
        .trim()
        .slice(0, maxLength)
        .replace(/[<>]/g, ""); // Basic HTML tag removal
}


import { PermitStatus } from "@prisma/client";

/**
 * Normalize eTRAKiT status text to our simplified PermitStatus enum.
 * Handles statuses from eTRAKiT-based systems like Saratoga.
 */
export function normalizeEtrakitStatus(raw?: string): PermitStatus {
    if (!raw) return PermitStatus.UNKNOWN;
    const s = raw.trim().toUpperCase();

    // Exact matches for known eTRAKiT statuses
    if (s === "ISSUED" || s === "APPROVED") {
        return PermitStatus.ISSUED;
    }
    
    if (
        s === "UNDER REVIEW" ||
        s === "UNDER REVII" || // Truncated version sometimes
        s === "APPLIED" ||
        s === "AWAITING PAYMENT" ||
        s === "AWAITING PA" || // Truncated version
        s === "PAID ONLINE" ||
        s === "PLAN CHECK" ||
        s === "RECEIVED"
    ) {
        return PermitStatus.IN_REVIEW;
    }

    // Pattern matching for variations
    if (/ISSUED|APPROVED|FINALED|FINAL/i.test(raw)) {
        return PermitStatus.ISSUED;
    }

    if (
        /UNDER\s*REVIEW|APPLIED|AWAITING|PAID\s*ONLINE|PENDING|SUBMITTED|PLAN\s*CHECK|RECEIVED/i.test(raw)
    ) {
        return PermitStatus.IN_REVIEW;
    }

    if (/EXPIRED|VOID|REVOKED|CANCELLED|CANCELED|WITHDRAWN|CLOSED/i.test(raw)) {
        return PermitStatus.INACTIVE;
    }

    return PermitStatus.UNKNOWN;
}


import { PermitStatus } from "@prisma/client";

/**
 * Normalize Accela status text to our simplified PermitStatus enum.
 * Handles common variants across jurisdictions (Los Gatos, Santa Clara, etc.).
 */
export function normalizeAccelaStatus(raw?: string): PermitStatus {
    if (!raw) return PermitStatus.UNKNOWN;
    const s = raw.trim().toLowerCase();

    // First check exact matches (case-insensitive) for common statuses
    // This ensures "Void", "void", "VOID", etc. all match
    if (
        s === "void" ||
        s === "expired" ||
        s === "revoked" ||
        s === "cancelled" ||
        s === "canceled" ||
        s === "withdrawn" ||
        s === "closed"
    ) {
        return PermitStatus.INACTIVE;
    }
    if (s === "issued" || s === "active" || s === "finaled" || s === "final") {
        return PermitStatus.ISSUED;
    }
    if (
        s === "pending" ||
        s === "processing" ||
        s === "plan check" ||
        s === "ready to issue" ||
        s === "plan review"
    ) {
        return PermitStatus.IN_REVIEW;
    }

    // Then check with regex patterns for variations
    // Explicit issued keywords
    if (
        /(^|\b)(issued|active|finaled|final|certificate of occupancy|co issued)(\b|$)/i.test(
            raw
        )
    ) {
        return PermitStatus.ISSUED;
    }

    // Inactive/cancelled/voided
    if (
        /(^|\b)(void|expired|revoked|cancelled|canceled|withdrawn|closed)(\b|$)/i.test(
            raw
        )
    ) {
        return PermitStatus.INACTIVE;
    }

    // Ready states still in review queue
    if (/(ready to issue|ready-to-issue|ready for issuance)/i.test(raw)) {
        return PermitStatus.IN_REVIEW;
    }

    // Typical in-review statuses
    if (
        /(pending|plan\s*check|processing|pre-application accepted|pre\s*application accepted|review|intake|application received|under review)/i.test(
            raw
        )
    ) {
        return PermitStatus.IN_REVIEW;
    }

    return PermitStatus.UNKNOWN;
}

/**
 * Permit Badge System
 * 
 * This module provides a flexible badge system for permits.
 * To add a new badge:
 * 1. Create a badge definition with id, label, condition, and styling
 * 2. Add it to the BADGE_DEFINITIONS array
 * 3. The system will automatically evaluate and display it
 */

import type { Permit } from "@/types/permit";
import type { ReactNode } from "react";

export interface BadgeDefinition {
    id: string;
    label: string;
    condition: (permit: Permit) => boolean;
    variant: "default" | "success" | "warning" | "info" | "primary";
    icon?: ReactNode;
}

/**
 * Check if permit was applied in the last 7 days (Pacific Time)
 */
function isAppliedInLastWeek(permit: Permit): boolean {
    if (!permit.appliedDateString) return false;

    try {
        // Get today's date in Pacific Time
        const now = new Date();
        const pacificDateFormatter = new Intl.DateTimeFormat("en-US", {
            timeZone: "America/Los_Angeles",
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
        });
        const parts = pacificDateFormatter.formatToParts(now);
        const pacificYear = parseInt(parts.find((p) => p.type === "year")!.value);
        const pacificMonth = parseInt(parts.find((p) => p.type === "month")!.value);
        const pacificDay = parseInt(parts.find((p) => p.type === "day")!.value);

        const todayPacific = new Date(
            Date.UTC(pacificYear, pacificMonth - 1, pacificDay)
        );

        // Parse appliedDateString (YYYY-MM-DD format)
        const [year, month, day] = permit.appliedDateString.split("-").map(Number);
        const appliedDate = new Date(Date.UTC(year, month - 1, day));

        // Calculate difference in days
        const diffTime = todayPacific.getTime() - appliedDate.getTime();
        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

        return diffDays >= 0 && diffDays <= 7;
    } catch {
        return false;
    }
}

/**
 * Check if permit has contractors with phone numbers
 * Note: This requires contractors to be loaded in the permit object
 */
function hasContractorPhone(permit: Permit): boolean {
    if (!permit.contractors || permit.contractors.length === 0) {
        return false;
    }

    // Check if any contractor has a phone number
    return permit.contractors.some((link) => {
        return link.contractor && !!link.contractor.phone;
    });
}

/**
 * Badge definitions
 * Add new badges here
 */
export const BADGE_DEFINITIONS: BadgeDefinition[] = [
    {
        id: "applied-last-week",
        label: "Applied Last Week",
        condition: isAppliedInLastWeek,
        variant: "success",
    },
    {
        id: "has-contractor-phone",
        label: "Has Contractor Contact",
        condition: hasContractorPhone,
        variant: "info",
    },
];

/**
 * Get all badges that apply to a permit
 */
export function getPermitBadges(permit: Permit): BadgeDefinition[] {
    return BADGE_DEFINITIONS.filter((badge) => badge.condition(permit));
}


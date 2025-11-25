"use client";

import type { BadgeDefinition } from "@/lib/badges/permit-badges";

interface PermitBadgeProps {
    badge: BadgeDefinition;
}

const badgeVariants = {
    default: "bg-gray-100 text-gray-800 border-gray-200",
    success: "bg-green-100 text-green-800 border-green-200",
    warning: "bg-yellow-100 text-yellow-800 border-yellow-200",
    info: "bg-blue-100 text-blue-800 border-blue-200",
    primary: "bg-purple-100 text-purple-800 border-purple-200",
};

export function PermitBadge({ badge }: PermitBadgeProps) {
    return (
        <span
            className={`inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-md border ${badgeVariants[badge.variant]}`}
            title={badge.label}
        >
            {badge.icon}
            {badge.label}
        </span>
    );
}

interface PermitBadgesProps {
    badges: BadgeDefinition[];
}

export function PermitBadges({ badges }: PermitBadgesProps) {
    if (badges.length === 0) return null;

    return (
        <div className="flex flex-wrap gap-1.5">
            {badges.map((badge) => (
                <PermitBadge key={badge.id} badge={badge} />
            ))}
        </div>
    );
}


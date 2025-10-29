/**
 * Formats an enum value to a display label.
 * Converts "RESIDENTIAL" -> "Residential", "POOL_AND_HOT_TUB" -> "Pool and Hot Tub"
 */
export function formatEnumLabel(value: string): string {
    return value
        .split("_")
        .map((word) => word.charAt(0) + word.slice(1).toLowerCase())
        .join(" ");
}


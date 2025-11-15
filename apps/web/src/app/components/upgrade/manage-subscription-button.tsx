"use client";

import { useState } from "react";

export function ManageSubscriptionButton() {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleManageSubscription = async () => {
        setLoading(true);
        setError(null);

        try {
            const response = await fetch("/api/customer-portal", {
                method: "POST",
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error || "Failed to open customer portal");
            }

            const { url } = await response.json();
            window.location.href = url;
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : "Unknown error";
            setError(message);
            console.error("Error opening customer portal:", err);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div>
            <button
                onClick={handleManageSubscription}
                disabled={loading}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
                {loading ? "Loading..." : "Manage Subscription"}
            </button>
            {error && (
                <p className="mt-2 text-sm text-red-600 text-center">{error}</p>
            )}
        </div>
    );
}


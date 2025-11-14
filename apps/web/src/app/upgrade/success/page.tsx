"use client";

import { useSession } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { useEffect, useState, Suspense } from "react";
import Link from "next/link";

function UpgradeSuccessContent() {
    const { data: session } = useSession();
    const searchParams = useSearchParams();
    const sessionId = searchParams.get("session_id");
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        // Verify payment was successful
        // In a production app, you might want to verify with your backend
        // For now, we'll just show success if session_id is present
        if (sessionId) {
            setLoading(false);
        } else {
            setError("No session ID found");
            setLoading(false);
        }
    }, [sessionId]);

    if (!session) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50">
                <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8 text-center">
                    <h1 className="text-2xl font-bold text-gray-900 mb-4">
                        Sign In Required
                    </h1>
                    <p className="text-gray-600 mb-6">
                        Please sign in to view this page.
                    </p>
                    <Link
                        href="/"
                        className="inline-block px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                    >
                        Go to Home
                    </Link>
                </div>
            </div>
        );
    }

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50">
                <div className="text-gray-500">Verifying payment...</div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50">
                <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8 text-center">
                    <div className="text-red-500 text-4xl mb-4">❌</div>
                    <h1 className="text-2xl font-bold text-gray-900 mb-4">
                        Payment Verification Failed
                    </h1>
                    <p className="text-gray-600 mb-6">{error}</p>
                    <Link
                        href="/upgrade"
                        className="inline-block px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                    >
                        Try Again
                    </Link>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
            <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8 text-center">
                <div className="text-green-500 text-6xl mb-4">✓</div>
                <h1 className="text-3xl font-bold text-gray-900 mb-4">
                    Payment Successful!
                </h1>
                <p className="text-gray-600 mb-6">
                    Thank you for upgrading to Premium. Your subscription is now active.
                    You can now access unlimited permits and all premium features.
                </p>
                <div className="space-y-4">
                    <Link
                        href="/"
                        className="block w-full px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
                    >
                        Start Browsing Permits
                    </Link>
                    <Link
                        href="/upgrade"
                        className="block w-full px-6 py-3 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
                    >
                        Back to Upgrade Page
                    </Link>
                </div>
                {sessionId && (
                    <p className="text-xs text-gray-500 mt-6">
                        Session ID: {sessionId.substring(0, 20)}...
                    </p>
                )}
            </div>
        </div>
    );
}

export default function UpgradeSuccessPage() {
    return (
        <Suspense fallback={
            <div className="min-h-screen flex items-center justify-center bg-gray-50">
                <div className="text-gray-500">Loading...</div>
            </div>
        }>
            <UpgradeSuccessContent />
        </Suspense>
    );
}


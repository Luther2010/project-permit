"use client";

import { useSession } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import Link from "next/link";

function PricingSuccessContent() {
    const { data: session } = useSession();
    const searchParams = useSearchParams();
    const sessionId = searchParams.get("session_id");
    
    // Determine error state directly from sessionId (no effect needed)
    const error = sessionId ? null : "No session ID found";

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
                        href="/pricing"
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
                <Link
                    href="/"
                    className="inline-block px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
                >
                    Start Browsing Permits
                </Link>
                {sessionId && (
                    <p className="text-xs text-gray-500 mt-6">
                        Session ID: {sessionId.substring(0, 20)}...
                    </p>
                )}
            </div>
        </div>
    );
}

export default function PricingSuccessPage() {
    return (
        <Suspense fallback={
            <div className="min-h-screen flex items-center justify-center bg-gray-50">
                <div className="text-gray-500">Loading...</div>
            </div>
        }>
            <PricingSuccessContent />
        </Suspense>
    );
}


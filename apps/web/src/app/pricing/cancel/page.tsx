"use client";

import Link from "next/link";

export default function PricingCancelPage() {
    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
            <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8 text-center">
                <div className="text-yellow-500 text-4xl mb-4">⚠️</div>
                <h1 className="text-2xl font-bold text-gray-900 mb-4">
                    Payment Cancelled
                </h1>
                <p className="text-gray-600 mb-6">
                    Your payment was cancelled. No charges were made.
                    You can try again anytime.
                </p>
                <div className="space-y-4">
                    <Link
                        href="/pricing"
                        className="block w-full px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
                    >
                        Try Again
                    </Link>
                    <Link
                        href="/"
                        className="block w-full px-6 py-3 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
                    >
                        Back to Home
                    </Link>
                </div>
            </div>
        </div>
    );
}


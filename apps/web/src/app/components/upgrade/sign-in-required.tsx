"use client";

import Link from "next/link";

export function SignInRequired() {
    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
            <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8 text-center">
                <h1 className="text-2xl font-bold text-gray-900 mb-4">
                    Sign In Required
                </h1>
                <p className="text-gray-600 mb-6">
                    Please sign in to upgrade your account.
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


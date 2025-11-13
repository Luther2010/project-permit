"use client";

import { signIn, signOut } from "next-auth/react";
import Link from "next/link";

interface AuthButtonsProps {
    isAuthenticated: boolean;
    userName?: string | null;
    userEmail?: string | null;
    isPremium?: boolean;
}

export function AuthButtons({
    isAuthenticated,
    userName,
    userEmail,
    isPremium,
}: AuthButtonsProps) {
    if (isAuthenticated) {
        return (
            <div className="flex items-center gap-4">
                <div className="text-sm text-gray-700">
                    <span className="font-medium">{userName}</span>
                    <br />
                    <span className="text-gray-500">{userEmail}</span>
                </div>
                {!isPremium && (
                    <Link
                        href="/upgrade"
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
                    >
                        Upgrade
                    </Link>
                )}
                <button
                    onClick={() => signOut({ callbackUrl: "/" })}
                    className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                >
                    Sign Out
                </button>
            </div>
        );
    }

    return (
        <button
            onClick={() => signIn("google", { callbackUrl: "/" })}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
            Sign in with Google
        </button>
    );
}

"use client";

import { signIn, signOut } from "next-auth/react";
import Link from "next/link";
import { ManageSubscriptionButton } from "./upgrade/manage-subscription-button";

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
                <button
                    onClick={() => signOut({ callbackUrl: "/" })}
                    className="text-sm text-gray-600 hover:text-gray-900 transition-colors"
                >
                    Sign Out
                </button>
                {isPremium ? (
                    <ManageSubscriptionButton />
                ) : (
                    <Link
                        href="/upgrade"
                        className="text-sm text-gray-600 hover:text-gray-900 transition-colors"
                    >
                        Upgrade
                    </Link>
                )}
            </div>
        );
    }

    return (
        <button
            onClick={() => signIn("google", { callbackUrl: "/" })}
            className="text-sm text-gray-600 hover:text-gray-900 transition-colors"
        >
            Sign in
        </button>
    );
}

"use client";

import { signIn, signOut } from "next-auth/react";
import { ManageSubscriptionButton } from "./upgrade/manage-subscription-button";
import { headerNavStyles } from "./header-styles";

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
            <>
                <div className="text-sm text-gray-700">
                    <span className="font-medium">{userName}</span>
                    <br />
                    <span className="text-gray-500">{userEmail}</span>
                </div>
                <button
                    onClick={() => signOut({ callbackUrl: "/" })}
                    className={headerNavStyles}
                >
                    Sign Out
                </button>
                {isPremium ? (
                    <ManageSubscriptionButton />
                ) : null}
            </>
        );
    }

    return (
        <button
            onClick={() => signIn("google", { callbackUrl: "/" })}
            className={headerNavStyles}
        >
            Sign in
        </button>
    );
}

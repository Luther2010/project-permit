"use client";

import { useState } from "react";
import { signOut } from "next-auth/react";
import { ManageSubscriptionButton } from "./upgrade/manage-subscription-button";
import { headerNavStyles } from "./header-styles";
import { AuthModal } from "./auth-modal";

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
    const [showAuthModal, setShowAuthModal] = useState(false);
    const [authMode, setAuthMode] = useState<"signin" | "signup">("signin");

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
        <>
            <button
                onClick={() => {
                    setAuthMode("signin");
                    setShowAuthModal(true);
                }}
                className={headerNavStyles}
            >
                Sign in
            </button>
            <AuthModal
                isOpen={showAuthModal}
                onClose={() => setShowAuthModal(false)}
                initialMode={authMode}
            />
        </>
    );
}

"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { AuthButtons } from "./auth-buttons";
import { getMe, type User } from "@/lib/user";
import { useEffect, useState } from "react";
import { headerNavStyles } from "./header-styles";
import { ContactModal } from "./contact-modal";

export function Header() {
    const { data: session } = useSession();
    const [user, setUser] = useState<User | null>(null);
    const [isContactModalOpen, setIsContactModalOpen] = useState(false);

    useEffect(() => {
        async function fetchUser() {
            if (session?.user?.id) {
                try {
                    const userData = await getMe();
                    setUser(userData);
                } catch (error) {
                    console.error("Failed to fetch user:", error);
                }
            }
        }
        fetchUser();
    }, [session]);

    const isPremium = user?.isPremium ?? false;

    return (
        <header className="bg-white border-b border-gray-200 shadow-sm">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex items-center justify-between h-16">
                    {/* Logo + Title */}
                    <div className="flex items-center gap-3">
                        <Link href="/" className="flex items-center gap-3">
                            <img
                                src="/logo.png"
                                alt="Permit Pulse"
                                className="w-8 h-8"
                            />
                            <span className="text-xl font-bold text-gray-900">
                                Permit Pulse
                            </span>
                        </Link>
                    </div>

                    {/* Right side: Sign in/out, Manage Subscriptions, Contact Us */}
                    <div className="flex items-center gap-4">
                        <AuthButtons
                            isAuthenticated={!!session}
                            userName={session?.user?.name}
                            userEmail={session?.user?.email}
                            isPremium={isPremium}
                        />
                        <button
                            onClick={() => setIsContactModalOpen(true)}
                            className={headerNavStyles}
                        >
                            Contact Us
                        </button>
                    </div>
                </div>
            </div>
            <ContactModal
                isOpen={isContactModalOpen}
                onClose={() => setIsContactModalOpen(false)}
            />
        </header>
    );
}


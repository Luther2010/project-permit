"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { AuthButtons } from "./auth-buttons";
import { getMe, type User } from "@/lib/user";
import { useEffect, useState } from "react";

export function Header() {
    const { data: session } = useSession();
    const [user, setUser] = useState<User | null>(null);

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
                        <div className="w-8 h-8 bg-blue-600 rounded flex items-center justify-center">
                            <svg
                                className="w-5 h-5 text-white"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                            >
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                                />
                            </svg>
                        </div>
                        <Link href="/" className="text-xl font-bold text-gray-900">
                            Permit Pulse
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
                        <Link
                            href="/contact"
                            className="text-sm text-gray-600 hover:text-gray-900 transition-colors"
                        >
                            Contact Us
                        </Link>
                    </div>
                </div>
            </div>
        </header>
    );
}


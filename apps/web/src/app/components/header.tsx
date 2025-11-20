"use client";

import Link from "next/link";
import Image from "next/image";
import { useSession } from "next-auth/react";
import { usePathname } from "next/navigation";
import { AuthButtons } from "./auth-buttons";
import { getMe, type User } from "@/lib/user";
import { useEffect, useState } from "react";
import { headerNavStyles } from "./header-styles";
import { ContactModal } from "./contact-modal";
import { FeaturesVotingModal } from "./features-voting-modal";

export function Header() {
    const { data: session } = useSession();
    const pathname = usePathname();
    const [user, setUser] = useState<User | null>(null);
    const [isContactModalOpen, setIsContactModalOpen] = useState(false);
    const [isFeaturesModalOpen, setIsFeaturesModalOpen] = useState(false);

    useEffect(() => {
        async function fetchUser() {
            if (session?.user?.id) {
                try {
                    const userData = await getMe();
                    setUser(userData);
                } catch (error) {
                    console.error("Failed to fetch user:", error);
                }
            } else {
                setUser(null);
            }
        }
        fetchUser();
    }, [session, pathname]);

    const isPremium = user?.isPremium ?? false;
    const isAuthenticated = !!session;

    return (
        <header className="bg-white border-b border-gray-200 shadow-sm">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex items-center justify-between h-16">
                    {/* Logo + Title */}
                    <div className="flex items-center gap-3">
                        <Link href="/" className="flex items-center gap-3">
                            <Image
                                src="/logo.png"
                                alt="Permit Pulse"
                                width={32}
                                height={32}
                                className="w-8 h-8"
                            />
                            <span className="text-xl font-bold text-gray-900">
                                Permit Pulse
                            </span>
                        </Link>
                    </div>

                    {/* Right side: Free Trial Banner, Sign in/out, Manage Subscriptions, Pricing, Features, Contact Us */}
                    <div className="flex items-center gap-4">
                        {/* Free Trial Banner - only show for authenticated non-premium users */}
                        {isAuthenticated && !isPremium && (
                            <Link
                                href="/pricing"
                                className="text-sm text-gray-600 hover:text-gray-900 transition-colors mr-2"
                            >
                                You&apos;re on our free trial.{" "}
                                <span className="font-medium underline">
                                    Click here to upgrade.
                                </span>
                            </Link>
                        )}
                        <AuthButtons
                            isAuthenticated={isAuthenticated}
                            userName={session?.user?.name}
                            userEmail={session?.user?.email}
                            isPremium={isPremium}
                        />
                        <Link href="/pricing" className={headerNavStyles}>
                            Pricing
                        </Link>
                        <button
                            onClick={() => setIsFeaturesModalOpen(true)}
                            className={headerNavStyles}
                        >
                            Features
                        </button>
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
            <FeaturesVotingModal
                isOpen={isFeaturesModalOpen}
                onClose={() => setIsFeaturesModalOpen(false)}
            />
        </header>
    );
}


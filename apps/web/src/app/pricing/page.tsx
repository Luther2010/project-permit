"use client";

import { useSession } from "next-auth/react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Header } from "../components/header";
import { PricingCard } from "../components/upgrade/pricing-card";
import { EnhancedPlanComparisonTable } from "../components/upgrade/enhanced-plan-comparison-table";
import { FAQSection } from "../components/upgrade/faq-section";
import { SignInRequired } from "../components/upgrade/sign-in-required";
import {
    PREMIUM_FEATURES,
    COMPARISON_FEATURES,
    FAQ_ITEMS,
    PRICING,
} from "../components/upgrade/upgrade-data";
import { handleUpgrade } from "../components/upgrade/upgrade-utils";
import { getMe, type User } from "@/lib/user";
import { ManageSubscriptionButton } from "../components/upgrade/manage-subscription-button";

export default function PricingPage() {
    const { data: session, status } = useSession();
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);

    // Fetch user info on mount
    useEffect(() => {
        const fetchUser = async () => {
            if (session) {
                const userData = await getMe();
                setUser(userData);
            }
            setLoading(false);
        };
        fetchUser();
    }, [session]);

    if (status === "loading" || loading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="text-gray-500">Loading...</div>
            </div>
        );
    }

    const isPremium = user?.isPremium ?? false;
    const currentPlan = isPremium ? "PREMIUM" : "FREEMIUM";

    if (!session) {
        return (
            <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white">
                <Header />
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
                    <div className="text-center mb-8">
                        <h1 className="text-4xl font-bold text-gray-900 mb-4">
                            Pricing & Plans
                        </h1>
                        <p className="text-xl text-gray-600">
                            Choose the plan that works best for you
                        </p>
                    </div>
                    <SignInRequired />
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white">
            <Header />
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
                {/* Header */}
                <div className="text-center mb-12">
                    <h1 className="text-4xl font-bold text-gray-900 mb-4">
                        Pricing & Plans
                    </h1>
                    <p className="text-xl text-gray-600">
                        {isPremium
                            ? "You're on Premium! Here's what you have access to."
                            : "Unlock unlimited access to all permit data and features"}
                    </p>
                    {isPremium && (
                        <div className="mt-4 inline-flex items-center px-4 py-2 bg-green-50 border border-green-200 rounded-lg">
                            <span className="text-green-700 font-medium">
                                ✓ Premium Member
                            </span>
                        </div>
                    )}
                </div>

                {/* Current Plan Highlight */}
                {isPremium ? (
                    <div className="max-w-4xl mx-auto mb-12">
                        <div className="bg-gradient-to-r from-green-50 to-emerald-50 border-2 border-green-200 rounded-2xl shadow-lg p-8 text-center">
                            <div className="text-green-500 text-6xl mb-4">✓</div>
                            <h2 className="text-3xl font-bold text-gray-900 mb-4">
                                You&apos;re Already Premium!
                            </h2>
                            <p className="text-gray-600 mb-6 text-lg">
                                You have unlimited permit access and all premium
                                features.
                            </p>
                            <div className="space-y-3">
                                <ManageSubscriptionButton />
                                <Link
                                    href="/"
                                    className="inline-block w-full px-6 py-3 bg-white text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium border border-gray-200"
                                >
                                    Start Browsing Permits
                                </Link>
                            </div>
                        </div>
                    </div>
                ) : (
                    <PricingCard
                        features={PREMIUM_FEATURES}
                        price={PRICING.price}
                        priceUnit={PRICING.unit}
                        onUpgrade={handleUpgrade}
                    />
                )}

                {/* Comparison Table */}
                <EnhancedPlanComparisonTable
                    features={COMPARISON_FEATURES}
                    currentPlan={currentPlan}
                />

                {/* FAQ Section */}
                <FAQSection items={FAQ_ITEMS} />

                {/* Back Link */}
                <div className="text-center mt-12">
                    <Link
                        href="/"
                        className="text-blue-600 hover:text-blue-700 font-medium"
                    >
                        ← Back to Permits
                    </Link>
                </div>
            </div>
        </div>
    );
}


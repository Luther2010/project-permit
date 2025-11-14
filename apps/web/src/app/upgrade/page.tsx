"use client";

import { useSession } from "next-auth/react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { PricingCard } from "../components/upgrade/pricing-card";
import { PlanComparisonTable } from "../components/upgrade/plan-comparison-table";
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

export default function UpgradePage() {
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

    if (!session) {
        return <SignInRequired />;
    }

    // Show premium message if user is already premium
    if (user?.isPremium) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50">
                <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8 text-center">
                    <div className="text-green-500 text-6xl mb-4">✓</div>
                    <h1 className="text-3xl font-bold text-gray-900 mb-4">
                        You're Already Premium!
                    </h1>
                    <p className="text-gray-600 mb-6">
                        You already have premium access with unlimited permit access
                        and all premium features.
                    </p>
                    <Link
                        href="/"
                        className="inline-block px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
                    >
                        Start Browsing Permits
                    </Link>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
                {/* Header */}
                <div className="text-center mb-12">
                    <h1 className="text-4xl font-bold text-gray-900 mb-4">
                        Upgrade to Premium
                    </h1>
                    <p className="text-xl text-gray-600">
                        Unlock unlimited access to all permit data and features
                    </p>
                </div>

                {/* Pricing Card */}
                <PricingCard
                    features={PREMIUM_FEATURES}
                    price={PRICING.price}
                    priceUnit={PRICING.unit}
                    onUpgrade={handleUpgrade}
                />

                {/* Comparison Table */}
                <PlanComparisonTable features={COMPARISON_FEATURES} />

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


"use client";

import { useSession } from "next-auth/react";
import Link from "next/link";
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

export default function UpgradePage() {
    const { data: session, status } = useSession();

    if (status === "loading") {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="text-gray-500">Loading...</div>
            </div>
        );
    }

    if (!session) {
        return <SignInRequired />;
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


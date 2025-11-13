"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function UpgradePage() {
    const { data: session, status } = useSession();
    const router = useRouter();

    const handleUpgrade = async () => {
        // TODO: Hook up to Stripe checkout in next PR
        // For now, this is a placeholder
        console.log("Upgrade clicked - will integrate Stripe checkout");
        
        // Placeholder: In the next PR, this will redirect to Stripe checkout
        // window.location.href = '/api/checkout';
    };

    const premiumFeatures = [
        {
            title: "Unlimited Permit Access",
            description: "View all permits without the 3-permit limit",
            icon: "🔓",
        },
        {
            title: "Daily Email Updates",
            description: "Get daily emails with the latest permit information",
            icon: "📧",
        },
        {
            title: "Priority Support",
            description: "Get help when you need it most",
            icon: "💬",
        },
    ];

    if (status === "loading") {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="text-gray-500">Loading...</div>
            </div>
        );
    }

    if (!session) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50">
                <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8 text-center">
                    <h1 className="text-2xl font-bold text-gray-900 mb-4">
                        Sign In Required
                    </h1>
                    <p className="text-gray-600 mb-6">
                        Please sign in to upgrade your account.
                    </p>
                    <Link
                        href="/"
                        className="inline-block px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                    >
                        Go to Home
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
                <div className="max-w-4xl mx-auto mb-12">
                    <div className="bg-white rounded-2xl shadow-xl border-2 border-blue-500 overflow-hidden">
                        <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-8 py-6">
                            <div className="flex items-center justify-between">
                                <div>
                                    <h2 className="text-2xl font-bold text-white mb-2">
                                        Premium Plan
                                    </h2>
                                    <p className="text-blue-100">
                                        Full access to all features
                                    </p>
                                </div>
                                <div className="text-right">
                                    <div className="text-4xl font-bold text-white">
                                        $29
                                    </div>
                                    <div className="text-blue-100 text-sm">
                                        per month
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="p-8">
                            <div className="grid md:grid-cols-3 gap-6 mb-8">
                                {premiumFeatures.map((feature, index) => (
                                    <div
                                        key={index}
                                        className="flex flex-col items-center text-center"
                                    >
                                        <div className="text-4xl mb-3">
                                            {feature.icon}
                                        </div>
                                        <h3 className="font-semibold text-gray-900 mb-2">
                                            {feature.title}
                                        </h3>
                                        <p className="text-gray-600 text-sm">
                                            {feature.description}
                                        </p>
                                    </div>
                                ))}
                            </div>

                            <div className="border-t border-gray-200 pt-6">
                                <button
                                    onClick={handleUpgrade}
                                    className="w-full bg-blue-600 text-white py-4 px-6 rounded-lg font-semibold text-lg hover:bg-blue-700 transition-colors shadow-lg"
                                >
                                    Upgrade to Premium
                                </button>
                                <p className="text-center text-sm text-gray-500 mt-4">
                                    Secure payment powered by Stripe
                                </p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Comparison Table */}
                <div className="max-w-4xl mx-auto mb-12">
                    <h2 className="text-2xl font-bold text-gray-900 mb-6 text-center">
                        Plan Comparison
                    </h2>
                    <div className="bg-white rounded-lg shadow-lg overflow-hidden">
                        <table className="w-full">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">
                                        Feature
                                    </th>
                                    <th className="px-6 py-4 text-center text-sm font-semibold text-gray-900">
                                        Freemium
                                    </th>
                                    <th className="px-6 py-4 text-center text-sm font-semibold text-blue-600">
                                        Premium
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200">
                                <tr>
                                    <td className="px-6 py-4 text-sm text-gray-900">
                                        Permit Access
                                    </td>
                                    <td className="px-6 py-4 text-center text-sm text-gray-600">
                                        3 permits
                                    </td>
                                    <td className="px-6 py-4 text-center text-sm text-gray-900 font-medium">
                                        Unlimited
                                    </td>
                                </tr>
                                <tr className="bg-gray-50">
                                    <td className="px-6 py-4 text-sm text-gray-900">
                                        Daily Email Updates
                                    </td>
                                    <td className="px-6 py-4 text-center text-sm text-gray-600">
                                        ❌
                                    </td>
                                    <td className="px-6 py-4 text-center text-sm text-gray-900 font-medium">
                                        ✅
                                    </td>
                                </tr>
                                <tr>
                                    <td className="px-6 py-4 text-sm text-gray-900">
                                        Priority Support
                                    </td>
                                    <td className="px-6 py-4 text-center text-sm text-gray-600">
                                        ❌
                                    </td>
                                    <td className="px-6 py-4 text-center text-sm text-gray-900 font-medium">
                                        ✅
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* FAQ Section */}
                <div className="max-w-4xl mx-auto">
                    <h2 className="text-2xl font-bold text-gray-900 mb-6 text-center">
                        Frequently Asked Questions
                    </h2>
                    <div className="space-y-4">
                        <div className="bg-white rounded-lg shadow p-6">
                            <h3 className="font-semibold text-gray-900 mb-2">
                                Can I cancel anytime?
                            </h3>
                            <p className="text-gray-600 text-sm">
                                Yes, you can cancel your subscription at any time.
                                You&apos;ll continue to have access until the end of
                                your billing period.
                            </p>
                        </div>
                        <div className="bg-white rounded-lg shadow p-6">
                            <h3 className="font-semibold text-gray-900 mb-2">
                                What payment methods do you accept?
                            </h3>
                            <p className="text-gray-600 text-sm">
                                We accept all major credit cards and debit cards
                                through our secure Stripe payment processor.
                            </p>
                        </div>
                    </div>
                </div>

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


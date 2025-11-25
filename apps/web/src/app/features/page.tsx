"use client";

import { Header } from "../components/header";
import { FeatureCard } from "../components/features/feature-card";
import { CityCoverageTable } from "../components/features/city-coverage-table";
import { FeatureVotingSection } from "../components/features/feature-voting-section";
import { useFeaturesData } from "@/lib/hooks/use-features-data";
import { FEATURES } from "@/lib/features-data";

export default function FeaturesPage() {
    const { cityDataCoverage, loading } = useFeaturesData();

    return (
        <div className="min-h-screen bg-blue-50">
            <Header />
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
                <div className="text-center mb-12">
                    <h1 className="text-4xl font-bold text-gray-900 mb-4">Features</h1>
                    <p className="text-xl text-gray-600 max-w-3xl mx-auto">
                        Discover what makes Permit Pulse the most current permit data platform in the market
                    </p>
                </div>

                {/* Features List */}
                <div className="mb-16">
                    <h2 className="text-2xl font-bold text-gray-900 mb-6">What We Offer</h2>
                    <div className="grid md:grid-cols-2 gap-6">
                        {FEATURES.map((feature, index) => (
                            <FeatureCard
                                key={index}
                                icon={feature.icon}
                                title={feature.title}
                                description={feature.description}
                            />
                        ))}
                    </div>
                </div>

                {/* Data Coverage Section */}
                <div className="mb-16">
                    <h2 className="text-2xl font-bold text-gray-900 mb-6">Data Coverage</h2>
                    <p className="text-gray-600 mb-6">
                        We cover 14+ cities across the Bay Area with different update frequencies based on 
                        data availability from each city&apos;s permit system.
                    </p>
                    <CityCoverageTable cityDataCoverage={cityDataCoverage} loading={loading} />
                </div>

                {/* Feature Voting Section */}
                <FeatureVotingSection />
            </div>
        </div>
    );
}


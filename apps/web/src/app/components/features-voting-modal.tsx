"use client";

import { useState, FormEvent } from "react";
import { useSession } from "next-auth/react";
import { Modal } from "./base-modal";
import { ContactModal } from "./contact-modal";

interface FeaturesVotingModalProps {
    isOpen: boolean;
    onClose: () => void;
}

// Mock features list - will be replaced with actual data from API later
const MOCK_FEATURES = [
    { id: "1", title: "Better Permit Classification", description: "Improved accuracy in categorizing permit types and property types" },
    { id: "2", title: "Natural Language Search", description: "Search permits using natural language queries powered by AI" },
    { id: "3", title: "More Cities", description: "Expand coverage to include more cities and regions" },
    { id: "4", title: "Export to CSV", description: "Download permit data as CSV files" },
    { id: "5", title: "Mobile App", description: "Native mobile app for iOS and Android" },
    { id: "6", title: "API Access", description: "Programmatic access to permit data" },
    { id: "7", title: "Contractor Profiles", description: "Detailed contractor information and ratings" },
    { id: "8", title: "Permit Analytics Dashboard", description: "Visual analytics and insights" },
    { id: "9", title: "Saved Searches", description: "Save and reuse your search queries" },
];

export function FeaturesVotingModal({ isOpen, onClose }: FeaturesVotingModalProps) {
    const { data: session } = useSession();
    const [selectedFeatures, setSelectedFeatures] = useState<string[]>([]);
    const [manualEmail, setManualEmail] = useState("");
    const [isContactModalOpen, setIsContactModalOpen] = useState(false);

    // Derive email: use session email if logged in, otherwise use manual input
    const sessionEmail = session?.user?.email || "";
    const isEmailDisabled = !!session?.user?.email;
    const email = isEmailDisabled ? sessionEmail : manualEmail;

    const handleFeatureToggle = (featureId: string) => {
        setSelectedFeatures((prev) =>
            prev.includes(featureId)
                ? prev.filter((id) => id !== featureId)
                : [...prev, featureId]
        );
    };

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        // TODO: Implement API call to submit votes
        console.log("Submitting votes:", {
            email,
            featureIds: selectedFeatures,
        });
        // For now, just close the modal
        handleClose();
    };

    const handleClose = () => {
        onClose();
        // Reset form when closing
        setSelectedFeatures([]);
        setManualEmail("");
    };

    return (
        <>
            <Modal isOpen={isOpen} onClose={handleClose} title="Vote on Features">
                <div className="space-y-6">
                    <p className="text-sm text-gray-600">
                        Help us prioritize features! Select the features you&apos;d like to see
                        implemented.
                    </p>

                    <form className="space-y-4" onSubmit={handleSubmit}>
                        <div>
                            <label
                                htmlFor="email"
                                className="block text-sm font-medium text-gray-700 mb-1"
                            >
                                Email
                            </label>
                            <input
                                id="email"
                                name="email"
                                type="email"
                                autoComplete="email"
                                required
                                disabled={isEmailDisabled}
                                value={email}
                                onChange={(e) => setManualEmail(e.target.value)}
                                className={`relative block w-full appearance-none rounded-md border border-gray-300 px-3 py-2 text-gray-900 placeholder-gray-500 focus:z-10 focus:border-blue-500 focus:outline-none focus:ring-blue-500 sm:text-sm ${
                                    isEmailDisabled
                                        ? "bg-gray-100 cursor-not-allowed"
                                        : "bg-white"
                                }`}
                                placeholder="your@email.com"
                            />
                            {isEmailDisabled && (
                                <p className="mt-1 text-xs text-gray-500">
                                    Using your account email
                                </p>
                            )}
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                Select Features (select multiple)
                            </label>
                            <div className="border border-gray-300 rounded-md p-3 max-h-64 overflow-y-auto bg-white">
                                {MOCK_FEATURES.map((feature) => (
                                    <label
                                        key={feature.id}
                                        className="flex items-start space-x-3 py-2 cursor-pointer hover:bg-gray-50 rounded px-2 -mx-2"
                                    >
                                        <input
                                            type="checkbox"
                                            checked={selectedFeatures.includes(feature.id)}
                                            onChange={() => handleFeatureToggle(feature.id)}
                                            className="mt-1 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                        />
                                        <div className="flex-1">
                                            <div className="text-sm font-medium text-gray-900">
                                                {feature.title}
                                            </div>
                                            <div className="text-xs text-gray-500">
                                                {feature.description}
                                            </div>
                                        </div>
                                    </label>
                                ))}
                            </div>
                            {selectedFeatures.length > 0 && (
                                <p className="mt-2 text-xs text-gray-500">
                                    {selectedFeatures.length} feature
                                    {selectedFeatures.length !== 1 ? "s" : ""} selected
                                </p>
                            )}
                        </div>

                        <button
                            type="submit"
                            disabled={selectedFeatures.length === 0 || !email}
                            className="group relative flex w-full justify-center rounded-md border border-transparent bg-blue-600 py-2 px-4 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            Submit Votes
                        </button>
                    </form>

                    <div className="pt-4 border-t border-gray-200 space-y-2">
                        <p className="text-xs text-gray-600 text-center">
                            Don&apos;t see the feature you&apos;re looking for?{" "}
                            <button
                                type="button"
                                onClick={() => {
                                    onClose();
                                    setIsContactModalOpen(true);
                                }}
                                className="text-blue-600 hover:text-blue-800 underline"
                            >
                                Contact us
                            </button>{" "}
                            to suggest a new feature.
                        </p>
                        <p className="text-xs text-gray-500 text-center">
                            We&apos;re a nimble team and can get back to you within a short timeframe.
                        </p>
                    </div>
                </div>
            </Modal>
            <ContactModal
                isOpen={isContactModalOpen}
                onClose={() => setIsContactModalOpen(false)}
            />
        </>
    );
}


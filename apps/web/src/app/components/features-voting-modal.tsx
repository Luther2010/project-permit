"use client";

import { useState, FormEvent, useEffect } from "react";
import { useSession } from "next-auth/react";
import { Modal } from "./base-modal";
import { ContactModal } from "./contact-modal";
import { graphqlFetch } from "@/lib/graphql-client";

interface FeaturesVotingModalProps {
    isOpen: boolean;
    onClose: () => void;
}

interface FeatureOption {
    id: string;
    title: string;
    description: string | null;
    status: string;
}

export function FeaturesVotingModal({ isOpen, onClose }: FeaturesVotingModalProps) {
    const { data: session } = useSession();
    const [features, setFeatures] = useState<FeatureOption[]>([]);
    const [selectedFeatures, setSelectedFeatures] = useState<string[]>([]);
    const [manualEmail, setManualEmail] = useState("");
    const [isContactModalOpen, setIsContactModalOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);

    // Derive email: use session email if logged in, otherwise use manual input
    const sessionEmail = session?.user?.email || "";
    const isEmailDisabled = !!session?.user?.email;
    const email = isEmailDisabled ? sessionEmail : manualEmail;

    // Fetch active features when modal opens
    useEffect(() => {
        if (isOpen) {
            fetchFeatures();
        }
    }, [isOpen]); // Only fetch when modal opens/closes

    const fetchFeatures = async () => {
        setLoading(true);
        setError(null);
        try {
            const data = await graphqlFetch(
                `
                query GetActiveFeatures {
                    activeFeatures {
                        id
                        title
                        description
                        status
                    }
                }
                `
            );
            setFeatures(data.activeFeatures || []);
        } catch (err) {
            console.error("Error fetching features:", err);
            setError(
                err instanceof Error
                    ? err.message
                    : "Failed to load features. Please try again."
            );
        } finally {
            setLoading(false);
        }
    };

    const handleFeatureToggle = (featureId: string) => {
        setSelectedFeatures((prev) =>
            prev.includes(featureId)
                ? prev.filter((id) => id !== featureId)
                : [...prev, featureId]
        );
    };

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        if (selectedFeatures.length === 0) {
            setError("Please select at least one feature to vote for.");
            return;
        }

        setSubmitting(true);
        setError(null);
        setSuccess(null);

        try {
            const data = await graphqlFetch(
                `
                mutation SubmitFeatureVotes($email: String!, $featureOptionIds: [String!]!) {
                    submitFeatureVotes(email: $email, featureOptionIds: $featureOptionIds) {
                        success
                        message
                    }
                }
                `,
                {
                    email,
                    featureOptionIds: selectedFeatures,
                }
            );

            setSuccess(data.submitFeatureVotes?.message || "Votes submitted successfully!");
            
            // Refresh features to update vote counts
            await fetchFeatures();
            
            // Reset selection
            setSelectedFeatures([]);

            // Close modal after 2 seconds
            setTimeout(() => {
                handleClose();
            }, 2000);
        } catch (err) {
            console.error("Error submitting votes:", err);
            setError(
                err instanceof Error
                    ? err.message
                    : "Failed to submit votes. Please try again."
            );
        } finally {
            setSubmitting(false);
        }
    };

    const handleClose = () => {
        onClose();
        // Reset form when closing
        setSelectedFeatures([]);
        setManualEmail("");
        setError(null);
        setSuccess(null);
    };

    return (
        <>
            <Modal isOpen={isOpen} onClose={handleClose} title="Vote on Features">
                <div className="space-y-6">
                    <p className="text-sm text-gray-600">
                        Help us prioritize features! Select the features you&apos;d like to see
                        implemented.
                    </p>

                    {loading ? (
                        <div className="text-center py-8">
                            <p className="text-sm text-gray-600">Loading features...</p>
                        </div>
                    ) : error && !success ? (
                        <div className="rounded-md bg-red-50 p-4">
                            <div className="flex">
                                <div className="flex-shrink-0">
                                    <svg
                                        className="h-5 w-5 text-red-400"
                                        viewBox="0 0 20 20"
                                        fill="currentColor"
                                        aria-hidden="true"
                                    >
                                        <path
                                            fillRule="evenodd"
                                            d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94l-1.72-1.72z"
                                            clipRule="evenodd"
                                        />
                                    </svg>
                                </div>
                                <div className="ml-3">
                                    <h3 className="text-sm font-medium text-red-800">Error</h3>
                                    <div className="mt-2 text-sm text-red-700">
                                        <p>{error}</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ) : success ? (
                        <div className="rounded-md bg-green-50 p-4">
                            <div className="flex">
                                <div className="flex-shrink-0">
                                    <svg
                                        className="h-5 w-5 text-green-400"
                                        viewBox="0 0 20 20"
                                        fill="currentColor"
                                        aria-hidden="true"
                                    >
                                        <path
                                            fillRule="evenodd"
                                            d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.06l2.5 2.5a.75.75 0 001.137-.089l4.003-5.5z"
                                            clipRule="evenodd"
                                        />
                                    </svg>
                                </div>
                                <div className="ml-3">
                                    <h3 className="text-sm font-medium text-green-800">Success!</h3>
                                    <div className="mt-2 text-sm text-green-700">
                                        <p>{success}</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <form className="space-y-4" onSubmit={handleSubmit}>
                            {error && (
                                <div className="rounded-md bg-red-50 p-4">
                                    <div className="flex">
                                        <div className="flex-shrink-0">
                                            <svg
                                                className="h-5 w-5 text-red-400"
                                                viewBox="0 0 20 20"
                                                fill="currentColor"
                                                aria-hidden="true"
                                            >
                                                <path
                                                    fillRule="evenodd"
                                                    d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94l-1.72-1.72z"
                                                    clipRule="evenodd"
                                                />
                                            </svg>
                                        </div>
                                        <div className="ml-3">
                                            <h3 className="text-sm font-medium text-red-800">Error</h3>
                                            <div className="mt-2 text-sm text-red-700">
                                                <p>{error}</p>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}

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
                                {features.length === 0 ? (
                                    <div className="border border-gray-300 rounded-md p-4 text-center text-sm text-gray-500">
                                        No active features available at this time.
                                    </div>
                                ) : (
                                    <>
                                        <div className="border border-gray-300 rounded-md p-3 max-h-64 overflow-y-auto bg-white">
                                            {features.map((feature) => (
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
                                                        {feature.description && (
                                                            <div className="text-xs text-gray-500 mt-1">
                                                                {feature.description}
                                                            </div>
                                                        )}
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
                                    </>
                                )}
                            </div>

                            <button
                                type="submit"
                                disabled={selectedFeatures.length === 0 || !email || submitting || loading}
                                className="group relative flex w-full justify-center rounded-md border border-transparent bg-blue-600 py-2 px-4 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {submitting ? "Submitting..." : "Submit Votes"}
                            </button>
                        </form>
                    )}

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


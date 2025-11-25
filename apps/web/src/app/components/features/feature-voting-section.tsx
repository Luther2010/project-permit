"use client";

import { useState } from "react";
import { FeaturesVotingModal } from "../features-voting-modal";

interface FeatureVotingSectionProps {
    onOpenModal?: () => void;
}

export function FeatureVotingSection({ onOpenModal }: FeatureVotingSectionProps) {
    const [isVotingModalOpen, setIsVotingModalOpen] = useState(false);

    const handleOpenModal = () => {
        setIsVotingModalOpen(true);
        onOpenModal?.();
    };

    return (
        <>
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8">
                <div className="text-center">
                    <h2 className="text-2xl font-bold text-gray-900 mb-4">Help Us Build the Future</h2>
                    <p className="text-gray-600 mb-6 max-w-2xl mx-auto">
                        Your feedback shapes our product. Vote on features you&apos;d like to see implemented, 
                        or suggest new ones. We&apos;re a nimble team and can respond quickly to your needs.
                    </p>
                    <button
                        onClick={handleOpenModal}
                        className="inline-flex items-center px-6 py-3 border border-transparent text-base font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                    >
                        Vote on Features
                    </button>
                </div>
            </div>

            <FeaturesVotingModal
                isOpen={isVotingModalOpen}
                onClose={() => setIsVotingModalOpen(false)}
            />
        </>
    );
}


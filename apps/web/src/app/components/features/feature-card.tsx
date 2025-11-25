"use client";

interface FeatureCardProps {
    icon: React.ReactNode;
    title: string;
    description: string;
}

export function FeatureCard({ icon, title, description }: FeatureCardProps) {
    return (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex items-center gap-3 mb-3">
                <div className="text-blue-600">{icon}</div>
                <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
            </div>
            <p className="text-gray-600">{description}</p>
        </div>
    );
}


"use client";

interface PremiumFeature {
    title: string;
    description: string;
    icon: string;
}

interface PricingCardProps {
    features: PremiumFeature[];
    price: number;
    priceUnit: string;
    onUpgrade: () => void;
}

export function PricingCard({
    features,
    price,
    priceUnit,
    onUpgrade,
}: PricingCardProps) {
    return (
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
                                ${price}
                            </div>
                            <div className="text-blue-100 text-sm">
                                {priceUnit}
                            </div>
                        </div>
                    </div>
                </div>

                <div className="p-8">
                    <div className="grid md:grid-cols-3 gap-6 mb-8">
                        {features.map((feature, index) => (
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
                            onClick={onUpgrade}
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
    );
}


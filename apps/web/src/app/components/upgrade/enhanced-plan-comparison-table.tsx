"use client";

interface ComparisonFeature {
    feature: string;
    freemium: string;
    premium: string;
}

interface EnhancedPlanComparisonTableProps {
    features: ComparisonFeature[];
    currentPlan: "FREEMIUM" | "PREMIUM";
}

export function EnhancedPlanComparisonTable({
    features,
    currentPlan,
}: EnhancedPlanComparisonTableProps) {
    return (
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
                            <th
                                className={`px-6 py-4 text-center text-sm font-semibold ${
                                    currentPlan === "FREEMIUM"
                                        ? "bg-blue-50 text-blue-700"
                                        : "text-gray-900"
                                }`}
                            >
                                Freemium
                                {currentPlan === "FREEMIUM" && (
                                    <span className="block text-xs font-normal text-blue-600 mt-1">
                                        (Your Plan)
                                    </span>
                                )}
                            </th>
                            <th
                                className={`px-6 py-4 text-center text-sm font-semibold ${
                                    currentPlan === "PREMIUM"
                                        ? "bg-blue-50 text-blue-700"
                                        : "text-blue-600"
                                }`}
                            >
                                Premium
                                {currentPlan === "PREMIUM" && (
                                    <span className="block text-xs font-normal text-blue-600 mt-1">
                                        (Your Plan)
                                    </span>
                                )}
                            </th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                        {features.map((item, index) => (
                            <tr
                                key={index}
                                className={index % 2 === 1 ? "bg-gray-50" : ""}
                            >
                                <td className="px-6 py-4 text-sm text-gray-900">
                                    {item.feature}
                                </td>
                                <td
                                    className={`px-6 py-4 text-center text-sm ${
                                        currentPlan === "FREEMIUM"
                                            ? "bg-blue-50 font-medium text-gray-900"
                                            : "text-gray-600"
                                    }`}
                                >
                                    {item.freemium}
                                </td>
                                <td
                                    className={`px-6 py-4 text-center text-sm ${
                                        currentPlan === "PREMIUM"
                                            ? "bg-blue-50 font-medium text-gray-900"
                                            : "text-gray-900 font-medium"
                                    }`}
                                >
                                    {item.premium}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}


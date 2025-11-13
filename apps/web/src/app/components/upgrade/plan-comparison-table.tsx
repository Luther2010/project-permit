"use client";

interface ComparisonFeature {
    feature: string;
    freemium: string;
    premium: string;
}

interface PlanComparisonTableProps {
    features: ComparisonFeature[];
}

export function PlanComparisonTable({
    features,
}: PlanComparisonTableProps) {
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
                            <th className="px-6 py-4 text-center text-sm font-semibold text-gray-900">
                                Freemium
                            </th>
                            <th className="px-6 py-4 text-center text-sm font-semibold text-blue-600">
                                Premium
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
                                <td className="px-6 py-4 text-center text-sm text-gray-600">
                                    {item.freemium}
                                </td>
                                <td className="px-6 py-4 text-center text-sm text-gray-900 font-medium">
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


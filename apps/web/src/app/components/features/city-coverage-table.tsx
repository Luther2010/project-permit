"use client";

import Link from "next/link";
import { getCityDisplayName, getCityPageUrl } from "@/lib/cities";
import { getAllCityCadences } from "@/lib/city-cadence";
import type { City } from "@prisma/client";

interface CityDataCoverage {
    city: City;
    latestPermitDate: string | null;
    permitCount: number;
}

interface CityCoverageTableProps {
    cityDataCoverage: CityDataCoverage[];
    loading?: boolean;
}

export function CityCoverageTable({ cityDataCoverage, loading = false }: CityCoverageTableProps) {
    const cityCadences = getAllCityCadences();
    
    // Merge cadence info with coverage data
    const cityDataWithCadence = cityCadences.map((cadence) => {
        const coverage = cityDataCoverage.find((c) => c.city === cadence.city);
        return {
            ...cadence,
            latestPermitDate: coverage?.latestPermitDate || null,
            permitCount: coverage?.permitCount || 0,
        };
    });

    const formatDate = (dateString: string | null) => {
        if (!dateString) return "No permits yet";
        try {
            const [year, month, day] = dateString.split("-");
            return new Date(parseInt(year), parseInt(month) - 1, parseInt(day)).toLocaleDateString("en-US", {
                year: "numeric",
                month: "short",
                day: "numeric",
            });
        } catch {
            return dateString;
        }
    };

    if (loading) {
        return (
            <div className="text-center py-12">
                <p className="text-gray-500">Loading city data...</p>
            </div>
        );
    }

    return (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                City
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Update Cadence
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Latest Permit Date
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Total Permits
                            </th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {cityDataWithCadence.map((city) => (
                            <tr key={city.city} className="hover:bg-gray-50">
                                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                                    <Link
                                        href={getCityPageUrl(city.city)}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-blue-600 hover:text-blue-800 hover:underline"
                                    >
                                        {getCityDisplayName(city.city)}
                                    </Link>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                                        {city.description}
                                    </span>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                                    {formatDate(city.latestPermitDate)}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                                    {city.permitCount.toLocaleString()}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}


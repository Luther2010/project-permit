"use client";

import { useState, useEffect, Suspense } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Header } from "../../components/header";
import { TimeSeriesChart } from "../../components/cities/time-series-chart";
import { CitySelector } from "../../components/cities/city-selector";
import { DataAvailabilityNote } from "../../components/data-availability-note";
import { graphqlFetch } from "@/lib/graphql-client";
import { getCityDisplayName, getEnabledCities } from "@/lib/cities";
import type { City } from "@prisma/client";

interface MonthlyCount {
    month: string;
    count: number;
}

interface CityStats {
    city: City;
    monthlyCounts: MonthlyCount[] | null;
    permitCount: number;
    latestPermitDate: string | null;
}

// Convert URL param to City enum (handle both "los-gatos" and "LOS_GATOS" formats)
function getCityFromParam(param: string): City | null {
    const normalized = param.toUpperCase().replace(/-/g, "_");
    const enabledCities = getEnabledCities();
    return enabledCities.includes(normalized as City) ? (normalized as City) : null;
}

// Convert City enum to URL-friendly format
function cityToUrlParam(city: City): string {
    return city.toLowerCase().replace(/_/g, "-");
}

// Parse cities from query string
function parseCitiesFromQuery(query: string | null): City[] {
    if (!query) return [];
    const enabledCities = getEnabledCities();
    return query
        .split(",")
        .map((c) => getCityFromParam(c.trim()))
        .filter((c): c is City => c !== null && enabledCities.includes(c));
}

// Build cities query string
function buildCitiesQuery(cities: City[]): string {
    return cities.map(cityToUrlParam).join(",");
}

function CityPageContent() {
    const params = useParams();
    const router = useRouter();
    const searchParams = useSearchParams();
    const cityParam = params.city as string;
    
    // Get initial cities from URL (path param or query param)
    const getInitialCities = (): City[] => {
        const pathCity = getCityFromParam(cityParam);
        const queryCities = parseCitiesFromQuery(searchParams.get("cities"));
        
        // If query params exist, use those; otherwise use path param
        if (queryCities.length > 0) {
            return queryCities;
        } else if (pathCity) {
            return [pathCity];
        }
        return [];
    };

    const [selectedCities, setSelectedCities] = useState<City[]>(getInitialCities);
    const [data, setData] = useState<CityStats[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (selectedCities.length === 0) return;

        async function fetchData() {
            setLoading(true);
            setError(null);
            try {
                const result = await graphqlFetch(
                    `
                    query GetCityStats($cities: [City!]!) {
                        cityStats(
                            cities: $cities
                            includeMonthlyBreakdown: true
                            timeRange: LAST_12_MONTHS
                        ) {
                            city
                            permitCount
                            monthlyCounts {
                                month
                                count
                            }
                        }
                    }
                    `,
                    { cities: selectedCities }
                );

                setData(result.cityStats || []);
            } catch (err) {
                console.error("Error fetching city stats:", err);
                setError("Failed to load city data. Please try again.");
            } finally {
                setLoading(false);
            }
        }

        fetchData();
    }, [selectedCities]);

    // Update URL when cities change
    useEffect(() => {
        if (selectedCities.length === 0) return;

        const citiesQuery = buildCitiesQuery(selectedCities);
        
        if (selectedCities.length === 1) {
            // Single city: use path param
            const cityName = cityToUrlParam(selectedCities[0]);
            router.replace(`/cities/${cityName}`, { scroll: false });
        } else {
            // Multiple cities: use query param, keep first city in path
            const firstCityName = cityToUrlParam(selectedCities[0]);
            router.replace(`/cities/${firstCityName}?cities=${encodeURIComponent(citiesQuery)}`, { scroll: false });
        }
    }, [selectedCities, router]);

    if (selectedCities.length === 0) {
        return (
            <div className="min-h-screen bg-blue-50">
                <Header />
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
                    <div className="text-center">
                        <h1 className="text-2xl font-bold text-gray-900 mb-4">City Not Found</h1>
                        <p className="text-gray-600">The city you&apos;re looking for doesn&apos;t exist.</p>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-blue-50">
            <Header />
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
                <div className="mb-8">
                    <h1 className="text-4xl font-bold text-gray-900 mb-2">
                        {selectedCities.length === 1
                            ? getCityDisplayName(selectedCities[0])
                            : "City Comparison"}
                    </h1>
                    <p className="text-gray-600 mb-3">
                        Permit application trends over the last 12 months
                    </p>
                    <div className="mb-8">
                        <DataAvailabilityNote />
                    </div>
                </div>

                {loading ? (
                    <div className="text-center py-12">
                        <p className="text-gray-500">Loading city data...</p>
                    </div>
                ) : error ? (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                        <p className="text-red-800">{error}</p>
                    </div>
                ) : (
                    <>
                        {/* Total Count Summary */}
                        <div className="mb-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {data.map((cityData) => (
                                <div
                                    key={cityData.city}
                                    className="bg-white rounded-lg shadow-sm border border-gray-200 p-6"
                                >
                                    <h3 className="text-sm font-medium text-gray-500 mb-2">
                                        {getCityDisplayName(cityData.city)}
                                    </h3>
                                    <p className="text-3xl font-bold text-gray-900">
                                        {cityData.permitCount.toLocaleString()}
                                    </p>
                                    <p className="text-sm text-gray-600 mt-1">
                                        Total permits (last 12 months)
                                    </p>
                                </div>
                            ))}
                        </div>

                        {/* Time Series Chart */}
                        <div className="mb-8">
                            <TimeSeriesChart data={data} />
                        </div>

                        {/* City Selector */}
                        <CitySelector
                            selectedCities={selectedCities}
                            onCitiesChange={setSelectedCities}
                        />
                    </>
                )}
            </div>
        </div>
    );
}

export default function CityPage() {
    return (
        <Suspense fallback={
            <div className="min-h-screen bg-blue-50">
                <Header />
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
                    <div className="text-center py-12">
                        <p className="text-gray-500">Loading...</p>
                    </div>
                </div>
            </div>
        }>
            <CityPageContent />
        </Suspense>
    );
}


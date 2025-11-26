import { useState, useEffect } from "react";
import { graphqlFetch } from "@/lib/graphql-client";
import type { City } from "@prisma/client";

interface CityDataCoverage {
    city: City;
    latestPermitDate: string | null;
    permitCount: number;
}

interface FeatureOption {
    id: string;
    title: string;
    description: string | null;
    status: string;
}

interface UseFeaturesDataReturn {
    cityDataCoverage: CityDataCoverage[];
    features: FeatureOption[];
    loading: boolean;
    error: Error | null;
}

/**
 * Custom hook to fetch features page data
 */
export function useFeaturesData(): UseFeaturesDataReturn {
    const [cityDataCoverage, setCityDataCoverage] = useState<CityDataCoverage[]>([]);
    const [features, setFeatures] = useState<FeatureOption[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<Error | null>(null);

    useEffect(() => {
        async function fetchData() {
            setLoading(true);
            setError(null);
            try {
                const [coverageData, featuresData] = await Promise.all([
                    graphqlFetch(`
                        query GetCityDataCoverage {
                            cityDataCoverage {
                                city
                                latestPermitDate
                                permitCount
                            }
                        }
                    `),
                    graphqlFetch(`
                        query GetActiveFeatures {
                            activeFeatures {
                                id
                                title
                                description
                                status
                            }
                        }
                    `),
                ]);

                setCityDataCoverage(coverageData.cityDataCoverage || []);
                setFeatures(featuresData.activeFeatures || []);
            } catch (err) {
                const error = err instanceof Error ? err : new Error("Failed to fetch features data");
                console.error("Error fetching features data:", error);
                setError(error);
            } finally {
                setLoading(false);
            }
        }

        fetchData();
    }, []);

    return {
        cityDataCoverage,
        features,
        loading,
        error,
    };
}


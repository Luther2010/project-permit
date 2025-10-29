"use client";

import { PermitCard } from "./components/permit-card";
import { graphqlFetch } from "@/lib/graphql-client";
import type { Permit } from "@/types/permit";
import { AuthButtons } from "./components/auth-buttons";
import { useSession } from "next-auth/react";
import { useState } from "react";
import { PermitFilters, type FilterState } from "./components/permit-filters";

async function getPermits(filters: FilterState): Promise<{ permits: Permit[] }> {
    const variables: Record<string, unknown> = {};

    if (filters.query.trim()) {
        variables.query = filters.query.trim();
    }
    if (filters.propertyTypes.length > 0) {
        variables.propertyTypes = filters.propertyTypes;
    }
    if (filters.permitTypes.length > 0) {
        variables.permitTypes = filters.permitTypes;
    }
    if (filters.city.trim()) {
        variables.city = filters.city.trim();
    }
    if (filters.minValue) {
        const minValue = parseFloat(filters.minValue);
        if (!isNaN(minValue)) {
            variables.minValue = minValue;
        }
    }
    if (filters.maxValue) {
        const maxValue = parseFloat(filters.maxValue);
        if (!isNaN(maxValue)) {
            variables.maxValue = maxValue;
        }
    }

    const query = `
        query GetPermits(
            $query: String
            $propertyTypes: [PropertyType!]
            $permitTypes: [PermitType!]
            $city: String
            $minValue: Float
            $maxValue: Float
        ) {
            permits(
                query: $query
                propertyTypes: $propertyTypes
                permitTypes: $permitTypes
                city: $city
                minValue: $minValue
                maxValue: $maxValue
            ) {
                id
                permitNumber
                title
                description
                address
                city
                state
                zipCode
                propertyType
                permitType
                status
                value
                issuedDate
                issuedDateString
            }
        }
    `;

    try {
        const data = await graphqlFetch(query, variables);
        return { permits: data.permits || [] };
    } catch (error) {
        console.error("Error fetching permits:", error);
        return { permits: [] };
    }
}

export default function Home() {
    const { data: session } = useSession();
    const [permits, setPermits] = useState<Permit[]>([]);
    const [loading, setLoading] = useState(false);
    const [hasSearched, setHasSearched] = useState(false);
    const [filters, setFilters] = useState<FilterState>({
        query: "",
        propertyTypes: [],
        permitTypes: [],
        city: "",
        minValue: "",
        maxValue: "",
    });

    const handleSearch = async () => {
        setLoading(true);
        setHasSearched(true);
        const { permits } = await getPermits(filters);
        setPermits(permits);
        setLoading(false);
    };

    return (
        <div className="min-h-screen bg-gray-50">
            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                <div className="mb-8 flex items-start justify-between">
                    <div>
                        <h1 className="text-3xl font-bold text-gray-900">
                            Permits
                        </h1>
                        <p className="mt-2 text-gray-600">
                            Browse building permits and project information
                        </p>
                    </div>
                    <AuthButtons
                        isAuthenticated={!!session}
                        userName={session?.user?.name}
                        userEmail={session?.user?.email}
                    />
                </div>

                <PermitFilters
                    filters={filters}
                    onFiltersChange={setFilters}
                    onSearch={handleSearch}
                />

                {loading ? (
                    <div className="text-center py-12">
                        <p className="text-gray-500">Loading permits...</p>
                    </div>
                ) : !hasSearched ? (
                    <div className="text-center py-12">
                        <p className="text-gray-500">
                            Use the search and filters above to find permits
                        </p>
                    </div>
                ) : permits.length === 0 ? (
                    <div className="text-center py-12">
                        <p className="text-gray-500">
                            No permits found matching your filters
                        </p>
                    </div>
                ) : (
                    <>
                        <div className="mb-4 text-sm text-gray-600">
                            Showing {permits.length} permit{permits.length !== 1 ? "s" : ""}
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {permits.map((permit) => (
                                <PermitCard key={permit.id} permit={permit} />
                            ))}
                        </div>
                    </>
                )}
            </main>
        </div>
    );
}

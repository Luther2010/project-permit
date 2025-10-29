"use client";

import { graphqlFetch } from "@/lib/graphql-client";
import type { Permit } from "@/types/permit";
import { AuthButtons } from "./components/auth-buttons";
import { useSession } from "next-auth/react";
import { useState } from "react";
import { PermitFilters, type FilterState } from "./components/permit-filters";
import { PermitTable } from "./components/permit-table";
import { Pagination } from "./components/pagination";

const PAGE_SIZE = 2;

interface PermitConnection {
    permits: Permit[];
    totalCount: number;
    page: number;
    pageSize: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
}

// Optimized query for table view - minimal data only
async function getPermits(
    filters: FilterState,
    page: number = 1,
    pageSize: number = PAGE_SIZE
): Promise<PermitConnection> {
    const variables: Record<string, unknown> = {};

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
    if (filters.minIssuedDate) {
        variables.minIssuedDate = filters.minIssuedDate;
    }
    if (filters.maxIssuedDate) {
        variables.maxIssuedDate = filters.maxIssuedDate;
    }

    variables.page = page;
    variables.pageSize = pageSize;

    // Optimized query - only fetch fields needed for table display
    const query = `
        query GetPermits(
            $propertyTypes: [PropertyType!]
            $permitTypes: [PermitType!]
            $city: String
            $minValue: Float
            $maxValue: Float
            $minIssuedDate: String
            $maxIssuedDate: String
            $page: Int
            $pageSize: Int
        ) {
            permits(
                propertyTypes: $propertyTypes
                permitTypes: $permitTypes
                city: $city
                minValue: $minValue
                maxValue: $maxValue
                minIssuedDate: $minIssuedDate
                maxIssuedDate: $maxIssuedDate
                page: $page
                pageSize: $pageSize
            ) {
                permits {
                    id
                    permitNumber
                    title
                    city
                    propertyType
                    permitType
                    status
                    value
                    issuedDate
                    issuedDateString
                }
                totalCount
                page
                pageSize
                hasNextPage
                hasPreviousPage
            }
        }
    `;

    try {
        const data = await graphqlFetch(query, variables);
        return data.permits || {
            permits: [],
            totalCount: 0,
            page: 1,
            pageSize: pageSize,
            hasNextPage: false,
            hasPreviousPage: false,
        };
    } catch (error) {
        console.error("Error fetching permits:", error);
        return {
            permits: [],
            totalCount: 0,
            page: 1,
            pageSize: pageSize,
            hasNextPage: false,
            hasPreviousPage: false,
        };
    }
}


export default function Home() {
    const { data: session } = useSession();
    const [permits, setPermits] = useState<Permit[]>([]);
    const [loading, setLoading] = useState(false);
    const [hasSearched, setHasSearched] = useState(false);
    const [pagination, setPagination] = useState<{
        totalCount: number;
        page: number;
        pageSize: number;
        hasNextPage: boolean;
        hasPreviousPage: boolean;
    } | null>(null);
    const [filters, setFilters] = useState<FilterState>({
        propertyTypes: [],
        permitTypes: [],
        city: "",
        minValue: "",
        maxValue: "",
        minIssuedDate: "",
        maxIssuedDate: "",
    });

    const fetchPermits = async (page: number = 1) => {
        setLoading(true);
        setHasSearched(true);
        const result = await getPermits(filters, page, PAGE_SIZE);
        setPermits(result.permits);
        setPagination({
            totalCount: result.totalCount,
            page: result.page,
            pageSize: result.pageSize,
            hasNextPage: result.hasNextPage,
            hasPreviousPage: result.hasPreviousPage,
        });
        setLoading(false);
    };

    const handleSearch = async () => {
        await fetchPermits(1);
    };

    const handlePageChange = async (page: number) => {
        await fetchPermits(page);
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
                            Use the filters above to find permits
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
                            {pagination && (
                                <>
                                    Showing {permits.length} permit
                                    {permits.length !== 1 ? "s" : ""} of{" "}
                                    {pagination.totalCount}
                                </>
                            )}
                        </div>
                        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
                            <PermitTable permits={permits} />
                            {pagination && (
                                <Pagination
                                    currentPage={pagination.page}
                                    pageSize={pagination.pageSize}
                                    totalCount={pagination.totalCount}
                                    hasNextPage={pagination.hasNextPage}
                                    hasPreviousPage={pagination.hasPreviousPage}
                                    onPageChange={handlePageChange}
                                />
                            )}
                        </div>
                    </>
                )}
            </main>
        </div>
    );
}

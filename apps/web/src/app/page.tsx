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
    isPremium: boolean;
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
                isPremium
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
            isPremium: false,
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
            isPremium: false,
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
        isPremium: boolean;
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
            isPremium: result.isPremium,
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
                        {pagination && !pagination.isPremium && (
                            <div className="mb-4 bg-blue-50 border border-blue-200 rounded-lg p-4">
                                <div className="flex">
                                    <div className="flex-shrink-0">
                                        <svg
                                            className="h-5 w-5 text-blue-400"
                                            viewBox="0 0 20 20"
                                            fill="currentColor"
                                            aria-hidden="true"
                                        >
                                            <path
                                                fillRule="evenodd"
                                                d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z"
                                                clipRule="evenodd"
                                            />
                                        </svg>
                                    </div>
                                    <div className="ml-3 flex-1">
                                        <h3 className="text-sm font-medium text-blue-800">
                                            Freemium Account
                                        </h3>
                                        <div className="mt-2 text-sm text-blue-700">
                                            <p>
                                                You&apos;re viewing a limited set of results (max 3 permits).
                                                Upgrade to Premium for unlimited access to all permit
                                                data.
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
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

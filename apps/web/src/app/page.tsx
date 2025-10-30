"use client";

import { graphqlFetch } from "@/lib/graphql-client";
import type { Permit } from "@/types/permit";
import { AuthButtons } from "./components/auth-buttons";
import { useSession } from "next-auth/react";
import { useState } from "react";
import * as React from "react";
import { PermitFilters, type FilterState } from "./components/permit-filters";
import { PermitTable } from "./components/permit-table";
import { Pagination } from "./components/pagination";
import type { PropertyType, PermitType } from "@prisma/client";

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

type SortField =
    | "PERMIT_TYPE"
    | "PROPERTY_TYPE"
    | "CITY"
    | "VALUE"
    | "ISSUED_DATE"
    | "STATUS";
type SortOrder = "ASC" | "DESC";

interface SortState {
    field: SortField | null;
    order: SortOrder;
}

// Optimized query for table view - minimal data only
async function getPermits(
    filters: FilterState,
    page: number = 1,
    pageSize: number = PAGE_SIZE,
    sortBy?: SortField,
    sortOrder?: SortOrder
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
    if (filters.hasContractor !== null) {
        variables.hasContractor = filters.hasContractor;
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
    if (sortBy) {
        variables.sortBy = sortBy;
    }
    if (sortOrder) {
        variables.sortOrder = sortOrder;
    }

    // Optimized query - only fetch fields needed for table display
    const query = `
        query GetPermits(
            $propertyTypes: [PropertyType!]
            $permitTypes: [PermitType!]
            $city: String
            $hasContractor: Boolean
            $minValue: Float
            $maxValue: Float
            $minIssuedDate: String
            $maxIssuedDate: String
            $page: Int
            $pageSize: Int
            $sortBy: PermitSortField
            $sortOrder: SortOrder
        ) {
            permits(
                propertyTypes: $propertyTypes
                permitTypes: $permitTypes
                city: $city
                hasContractor: $hasContractor
                minValue: $minValue
                maxValue: $maxValue
                minIssuedDate: $minIssuedDate
                maxIssuedDate: $maxIssuedDate
                page: $page
                pageSize: $pageSize
                sortBy: $sortBy
                sortOrder: $sortOrder
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
        propertyTypes: [] as PropertyType[],
        permitTypes: [] as PermitType[],
        city: "",
        hasContractor: null,
        minValue: "",
        maxValue: "",
        minIssuedDate: "",
        maxIssuedDate: "",
    });

    const [sort, setSort] = useState<SortState>({
        field: "ISSUED_DATE",
        order: "DESC",
    });

    const [freemiumAllPermits, setFreemiumAllPermits] = useState<Permit[] | null>(null);

    function sortPermitsLocal(list: Permit[], field: SortField, order: SortOrder): Permit[] {
        const dir = order === "ASC" ? 1 : -1;
        const compareString = (a?: string | null, b?: string | null) => {
            const as = a ?? "";
            const bs = b ?? "";
            return as.localeCompare(bs) * dir;
        };
        const compareNumber = (a?: number | null, b?: number | null) => {
            const an = a ?? Number.NEGATIVE_INFINITY;
            const bn = b ?? Number.NEGATIVE_INFINITY;
            return (an === bn ? 0 : an > bn ? 1 : -1) * dir;
        };
        const compareDate = (a?: string | null, b?: string | null) => {
            const ad = a ? new Date(a).getTime() : Number.NEGATIVE_INFINITY;
            const bd = b ? new Date(b).getTime() : Number.NEGATIVE_INFINITY;
            return (ad === bd ? 0 : ad > bd ? 1 : -1) * dir;
        };
        const listCopy = [...list];
        listCopy.sort((x, y) => {
            switch (field) {
                case "PERMIT_TYPE":
                    return compareString(x.permitType, y.permitType);
                case "PROPERTY_TYPE":
                    return compareString(x.propertyType, y.propertyType);
                case "CITY":
                    return compareString(x.city, y.city);
                case "VALUE":
                    return compareNumber(x.value ?? null, y.value ?? null);
                case "ISSUED_DATE":
                    return compareDate(x.issuedDate, y.issuedDate);
                case "STATUS":
                    return compareString(x.status, y.status);
                default:
                    return 0;
            }
        });
        return listCopy;
    }

    const applyFreemiumPagingAndSet = (all: Permit[], page: number) => {
        const effectiveTotal = all.length;
        const start = (page - 1) * PAGE_SIZE;
        const end = start + PAGE_SIZE;
        setPermits(all.slice(start, end));
        setPagination({
            totalCount: effectiveTotal,
            page,
            pageSize: PAGE_SIZE,
            hasNextPage: end < effectiveTotal,
            hasPreviousPage: page > 1,
            isPremium: false,
        });
    };

    const fetchPermits = async (page: number = 1) => {
        setLoading(true);
        setHasSearched(true);
        // First fetch to determine premium status and baseline data
        const firstResult = await getPermits(
            filters,
            page,
            PAGE_SIZE,
            sort.field || undefined,
            sort.order
        );

        if (!firstResult.isPremium) {
            // For freemium: lock the subset to the canonical default order (issued desc)
            // Cache all 3 permits once; then sort and page locally
            if (!freemiumAllPermits || page === 1) {
                const canonicalResult = await getPermits(
                    filters,
                    1,
                    3,
                    "ISSUED_DATE",
                    "DESC"
                );
                setFreemiumAllPermits(canonicalResult.permits);
                const sorted = sortPermitsLocal(
                    canonicalResult.permits,
                    sort.field ?? "ISSUED_DATE",
                    sort.order
                );
                applyFreemiumPagingAndSet(sorted, page);
            } else if (freemiumAllPermits) {
                const sorted = sortPermitsLocal(
                    freemiumAllPermits,
                    sort.field ?? "ISSUED_DATE",
                    sort.order
                );
                applyFreemiumPagingAndSet(sorted, page);
            }
        } else {
            // Premium: normal server-driven paging/sorting
            setFreemiumAllPermits(null);
            setPermits(firstResult.permits);
            setPagination({
                totalCount: firstResult.totalCount,
                page: firstResult.page,
                pageSize: firstResult.pageSize,
                hasNextPage: firstResult.hasNextPage,
                hasPreviousPage: firstResult.hasPreviousPage,
                isPremium: firstResult.isPremium,
            });
        }
        setLoading(false);
    };

    const handleSort = (field: SortField) => {
        setSort((prev) => {
            if (prev.field === field) {
                // Toggle sort order if clicking same field
                return {
                    field,
                    order: prev.order === "ASC" ? "DESC" : "ASC",
                };
            }
            // Set new field with default DESC order
            return {
                field,
                order: "DESC",
            };
        });
    };

    const handleSearch = async () => {
        await fetchPermits(1);
    };

    const handlePageChange = async (page: number) => {
        // If freemium and we have a cached subset, page locally
        if (pagination && !pagination.isPremium && freemiumAllPermits) {
            const sorted = sortPermitsLocal(
                freemiumAllPermits,
                sort.field ?? "ISSUED_DATE",
                sort.order
            );
            applyFreemiumPagingAndSet(sorted, page);
            return;
        }
        await fetchPermits(page);
    };

    // Refetch when sort changes
    React.useEffect(() => {
        if (!hasSearched) return;
        // For freemium: sort locally
        if (pagination && !pagination.isPremium && freemiumAllPermits) {
            const sorted = sortPermitsLocal(
                freemiumAllPermits,
                sort.field ?? "ISSUED_DATE",
                sort.order
            );
            applyFreemiumPagingAndSet(sorted, pagination.page);
            return;
        }
        // Premium: refetch with new sort
        fetchPermits(pagination?.page || 1);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [sort.field, sort.order]);

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
                            <PermitTable
                                permits={permits}
                                sortField={sort.field}
                                sortOrder={sort.order}
                                onSort={handleSort}
                            />
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

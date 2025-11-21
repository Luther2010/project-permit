"use client";

import { graphqlFetch } from "@/lib/graphql-client";
import type { Permit } from "@/types/permit";
import { useSession } from "next-auth/react";
import { useState, useEffect, Suspense } from "react";
import * as React from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Header } from "./components/header";
import { PermitFilters, type FilterState } from "./components/permit-filters";
import { PermitTable } from "./components/permit-table";
import { Pagination } from "./components/pagination";
import { getMe, type User } from "@/lib/user";
import {
    filtersToSearchParams,
    searchParamsToFilters,
    hasFiltersInUrl,
} from "@/lib/url-params";

const PAGE_SIZE = 10;

interface PermitConnection {
    permits: Permit[];
    totalCount: number;
    page: number;
    pageSize: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
}

type SortField =
    | "PERMIT_TYPE"
    | "PROPERTY_TYPE"
    | "CITY"
    | "VALUE"
    | "APPLIED_DATE"
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
    sortOrder?: SortOrder,
    timezone?: string | null
): Promise<PermitConnection> {
    const variables: Record<string, unknown> = {};

    if (filters.propertyTypes.length > 0) {
        variables.propertyTypes = filters.propertyTypes;
    }
    if (filters.permitTypes.length > 0) {
        variables.permitTypes = filters.permitTypes;
    }
    if (filters.statuses.length > 0) {
        variables.statuses = filters.statuses;
    }
    if (filters.cities.length > 0) {
        variables.cities = filters.cities;
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
    if (filters.minAppliedDate) {
        variables.minAppliedDate = filters.minAppliedDate;
    }
    if (filters.maxAppliedDate) {
        variables.maxAppliedDate = filters.maxAppliedDate;
    }
    if (filters.minLastUpdateDate) {
        variables.minLastUpdateDate = filters.minLastUpdateDate;
    }
    if (filters.maxLastUpdateDate) {
        variables.maxLastUpdateDate = filters.maxLastUpdateDate;
    }

    variables.page = page;
    variables.pageSize = pageSize;
    if (sortBy) {
        variables.sortBy = sortBy;
    }
    if (sortOrder) {
        variables.sortOrder = sortOrder;
    }
    if (timezone) {
        variables.timezone = timezone;
    }

    // Optimized query - only fetch fields needed for table display
    const query = `
        query GetPermits(
            $propertyTypes: [PropertyType!]
            $permitTypes: [PermitType!]
            $statuses: [PermitStatus!]
            $cities: [City!]
            $hasContractor: Boolean
            $minValue: Float
            $maxValue: Float
            $minAppliedDate: String
            $maxAppliedDate: String
            $minLastUpdateDate: String
            $maxLastUpdateDate: String
            $timezone: String
            $page: Int
            $pageSize: Int
            $sortBy: PermitSortField
            $sortOrder: SortOrder
        ) {
            permits(
                propertyTypes: $propertyTypes
                permitTypes: $permitTypes
                statuses: $statuses
                cities: $cities
                hasContractor: $hasContractor
                minValue: $minValue
                maxValue: $maxValue
                minAppliedDate: $minAppliedDate
                maxAppliedDate: $maxAppliedDate
                minLastUpdateDate: $minLastUpdateDate
                maxLastUpdateDate: $maxLastUpdateDate
                timezone: $timezone
                page: $page
                pageSize: $pageSize
                sortBy: $sortBy
                sortOrder: $sortOrder
            ) {
                permits {
                    id
                    permitNumber
                    city
                    propertyType
                    permitType
                    status
                    value
                    appliedDate
                    appliedDateString
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
        return (
            data.permits || {
                permits: [],
                totalCount: 0,
                page: 1,
                pageSize: pageSize,
                hasNextPage: false,
                hasPreviousPage: false,
            }
        );
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


function HomeContent() {
    const { data: session } = useSession();
    const searchParams = useSearchParams();
    const router = useRouter();
    const [permits, setPermits] = useState<Permit[]>([]);
    const [loading, setLoading] = useState(false);
    const [hasSearched, setHasSearched] = useState(false);
    const [pagination, setPagination] = useState<PermitConnection | null>(null);
    const [user, setUser] = useState<User | null>(null);
    const [userTimezone, setUserTimezone] = useState<string | null>(null);
    
    const isPremium = user?.isPremium ?? false;
    
    // Detect user's timezone on mount
    React.useEffect(() => {
        try {
            const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
            setUserTimezone(timezone);
        } catch (error) {
            console.error("Failed to detect timezone:", error);
            // Fallback to UTC if detection fails
            setUserTimezone("UTC");
        }
    }, []);

    // Initialize filters from URL params
    const [filters, setFilters] = useState<FilterState>(() => {
        const urlFilters = searchParamsToFilters(searchParams);
        
        return {
            propertyTypes: urlFilters.propertyTypes || [],
            permitTypes: urlFilters.permitTypes || [],
            statuses: urlFilters.statuses || [],
            cities: urlFilters.cities || [],
            hasContractor: urlFilters.hasContractor ?? null,
            minValue: urlFilters.minValue || "",
            maxValue: urlFilters.maxValue || "",
            minAppliedDate: urlFilters.minAppliedDate || "",
            maxAppliedDate: urlFilters.maxAppliedDate || "",
            minLastUpdateDate: urlFilters.minLastUpdateDate || "",
            maxLastUpdateDate: urlFilters.maxLastUpdateDate || "",
        };
    });

    // Initialize sort from URL params, default to APPLIED_DATE DESC
    const [sort, setSort] = useState<SortState>(() => {
        const sortByParam = searchParams.get("sortBy");
        const sortOrderParam = searchParams.get("sortOrder");
        
        // Validate sortBy is a valid SortField
        const validSortFields: SortField[] = ["PERMIT_TYPE", "PROPERTY_TYPE", "CITY", "VALUE", "APPLIED_DATE", "STATUS"];
        const sortField = sortByParam && validSortFields.includes(sortByParam as SortField) 
            ? (sortByParam as SortField) 
            : "APPLIED_DATE";
        
        // Validate sortOrder is ASC or DESC
        const sortOrder = sortOrderParam === "ASC" || sortOrderParam === "DESC" 
            ? sortOrderParam 
            : "DESC";
        
        return {
            field: sortField,
            order: sortOrder,
        };
    });

    const [isInitialMount, setIsInitialMount] = useState(true);

    // Helper function to update URL with filters and sort
    const updateUrl = React.useCallback((filtersToUse: FilterState, sortToUse: SortState) => {
        const params = filtersToSearchParams(filtersToUse);
        // Add sort if not default (APPLIED_DATE DESC)
        if (sortToUse.field && (sortToUse.field !== "APPLIED_DATE" || sortToUse.order !== "DESC")) {
            params.set("sortBy", sortToUse.field);
            params.set("sortOrder", sortToUse.order);
        }
        const newUrl = params.toString() ? `/?${params.toString()}` : "/";
        router.replace(newUrl, { scroll: false });
    }, [router]);

    // Update URL when filters change (but not on initial mount when reading from URL)
    useEffect(() => {
        if (isInitialMount) {
            setIsInitialMount(false);
            return;
        }

        const params = filtersToSearchParams(filters);
        // Add sort if not default (APPLIED_DATE DESC)
        if (sort.field && (sort.field !== "APPLIED_DATE" || sort.order !== "DESC")) {
            params.set("sortBy", sort.field);
            params.set("sortOrder", sort.order);
        }
        const newUrl = params.toString() ? `/?${params.toString()}` : "/";
        router.replace(newUrl, { scroll: false });
    }, [filters, router, isInitialMount, sort.field, sort.order]);

    // Update URL when sort changes (but not on initial mount)
    useEffect(() => {
        if (isInitialMount) return;
        updateUrl(filters, sort);
    }, [sort,sort.field, sort.order, filters, updateUrl, isInitialMount]);

    // Auto-search on mount if URL has filter params or sort params
    React.useEffect(() => {
        if (hasSearched) return; // Already searched, don't run again
        
        // Check if URL has sort parameters (non-default)
        const sortByParam = searchParams.get("sortBy");
        const sortOrderParam = searchParams.get("sortOrder");
        const hasSortInUrl = sortByParam !== null || (sortOrderParam !== null && sortOrderParam !== "DESC");
        
        // Check if URL has filters
        const hasFilters = hasFiltersInUrl(searchParams);
        
        // If no filters and no sort params, don't auto-search
        if (!hasFilters && !hasSortInUrl) return;
        
        // Wait for userTimezone and user data to load so premium status is correct
        if (!userTimezone) return;
        const userLoaded = session ? user !== null : true;
        if (!userLoaded) return;
        
        // Check if we have any filters set (from URL)
        const hasAnyFilters = 
            filters.cities.length > 0 || 
            filters.statuses.length > 0 ||
            filters.propertyTypes.length > 0 ||
            filters.permitTypes.length > 0 ||
            filters.minAppliedDate ||
            filters.maxAppliedDate ||
            filters.minLastUpdateDate ||
            filters.maxLastUpdateDate ||
            filters.minValue ||
            filters.maxValue ||
            filters.hasContractor !== null;
        
        // If we have filters or sort params, fetch permits
        // Note: If only sort is in URL but no filters, we still need to fetch
        // (this handles the case where user navigates directly to a URL with just sort params)
        if (hasAnyFilters || hasSortInUrl) {
            fetchPermits(1);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [userTimezone, user, session, filters.cities, filters.statuses, filters.propertyTypes, filters.permitTypes, filters.minAppliedDate, filters.maxAppliedDate, filters.minLastUpdateDate, filters.maxLastUpdateDate, filters.minValue, filters.maxValue, filters.hasContractor, searchParams, sort.field, sort.order]);



    const fetchPermits = async (page: number = 1) => {
        setLoading(true);
        setHasSearched(true);
        
        const result = await getPermits(
            filters,
            page,
            PAGE_SIZE,
            sort.field || undefined,
            sort.order,
            userTimezone
        );

        setPermits(result.permits);
        setPagination({
            permits: [],
            totalCount: result.totalCount,
            page: result.page,
            pageSize: result.pageSize,
            hasNextPage: result.hasNextPage,
            hasPreviousPage: result.hasPreviousPage,
        });
        
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
        // Reset to page 1 when searching
        await fetchPermits(1);
        // URL will be updated by the useEffect that watches filters
    };

    const handlePageChange = async (page: number) => {
        await fetchPermits(page);
        // URL will be updated by the useEffect that watches pagination.page
    };

    const handleSortReset = () => {
        setSort({
            field: "APPLIED_DATE",
            order: "DESC",
        });
    };

    // Fetch user info on mount
    React.useEffect(() => {
        const fetchUser = async () => {
            const userData = await getMe();
            if (userData) {
                setUser(userData);
            }
        };
        if (session) {
            fetchUser();
        }
    }, [session]);

    // Refetch when sort changes
    React.useEffect(() => {
        if (!hasSearched) return;
        fetchPermits(pagination?.page || 1);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [sort.field, sort.order]);

    return (
        <div className="min-h-screen bg-blue-50">
            <Header />
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                <div className="flex gap-6">
                    {/* Left Sidebar - Filters */}
                    <aside className="w-80 flex-shrink-0 h-[calc(100vh-8rem)]">
                        <PermitFilters
                            filters={filters}
                            onFiltersChange={setFilters}
                            onSearch={handleSearch}
                            onSortReset={handleSortReset}
                        />
                    </aside>

                    {/* Main Content Area */}
                    <main className="flex-1 min-w-0">

                        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                            {loading ? (
                                <div className="text-center py-12">
                                    <p className="text-gray-500">Loading permits...</p>
                                </div>
                            ) : !hasSearched ? (
                                <div className="text-center py-12">
                                    <p className="text-gray-500">
                                        Use the filters to find permits
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
                                    {pagination && !isPremium && (
                                        <div className="mb-4 bg-blue-50 border border-blue-200 rounded-lg p-4">
                                            <div className="flex items-start">
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
                                                            You&apos;re viewing a limited
                                                            set of results (max 3 permits).
                                                            Upgrade to Premium for unlimited
                                                            access to all permit data.
                                                        </p>
                                                    </div>
                                                    <div className="mt-3">
                                                        <a
                                                            href="/pricing"
                                                            className="inline-flex items-center px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
                                                        >
                                                            Upgrade to Premium
                                                        </a>
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
                                    <div className="overflow-hidden">
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
                        </div>
                    </main>
                </div>
            </div>
        </div>
    );
}

export default function Home() {
    return (
        <Suspense fallback={
            <div className="min-h-screen bg-blue-50">
                <Header />
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                    <div className="text-center py-12">
                        <p className="text-gray-500">Loading...</p>
                    </div>
                </div>
            </div>
        }>
            <HomeContent />
        </Suspense>
    );
}

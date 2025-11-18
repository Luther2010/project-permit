"use client";

import { useEffect, useState } from "react";
import type { Permit } from "@/types/permit";
import { graphqlFetch } from "@/lib/graphql-client";

interface PermitDetailViewProps {
    permitId: string;
    basicPermit: Permit;
}

// Cache for fetched details to avoid refetching when row is collapsed/re-expanded
const detailsCache = new Map<string, Permit | null>();

export function PermitDetailView({
    permitId,
    basicPermit,
}: PermitDetailViewProps) {
    const [details, setDetails] = useState<Permit | null>(
        detailsCache.get(permitId) || null
    );
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        // Check if we already have all the detail fields in basicPermit
        const hasAllDetails =
            basicPermit.description &&
            basicPermit.address &&
            basicPermit.state &&
            basicPermit.zipCode;

        if (hasAllDetails) {
            // Use basic permit data if it already has all details
            setDetails(basicPermit);
            return;
        }

        // Check cache first - if cached, use it immediately
        const cached = detailsCache.get(permitId);
        if (cached !== undefined) {
            setDetails(cached);
            return;
        }

        // Fetch full details
        async function fetchDetails() {
            setLoading(true);
            setError(null);

            const query = `
                query GetPermit($id: String!) {
                    permit(id: $id) {
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
                        appliedDate
                        appliedDateString
                        contractors {
                            role
                            contractor {
                                id
                                licenseNo
                                name
                                mailingAddress
                                city
                                state
                                zipCode
                                phone
                                businessType
                                classifications { classification }
                            }
                        }
                    }
                }
            `;

            try {
                const data = await graphqlFetch(query, { id: permitId });
                const fetchedDetails = data.permit || null;
                detailsCache.set(permitId, fetchedDetails);
                setDetails(fetchedDetails);
            } catch (err) {
                console.error("Error fetching permit details:", err);
                setError("Failed to load details");
            } finally {
                setLoading(false);
            }
        }

        fetchDetails();
    }, [permitId, basicPermit]);

    if (loading) {
        return (
            <div className="text-center py-4 text-gray-500">
                Loading details...
            </div>
        );
    }

    if (error) {
        return (
            <div className="text-center py-4 text-red-500">
                {error}
            </div>
        );
    }

    const displayPermit = details || basicPermit;

    return (
        <div className="space-y-3">
            {displayPermit.title && (
                <div>
                    <span className="text-xs font-medium text-gray-500 uppercase">
                        Title:
                    </span>
                    <p className="mt-1 text-sm font-medium text-gray-900">
                        {displayPermit.title}
                    </p>
                </div>
            )}
            {displayPermit.description && (
                <div>
                    <span className="text-xs font-medium text-gray-500 uppercase">
                        Description:
                    </span>
                    <p className="mt-1 text-sm text-gray-700">
                        {displayPermit.description}
                    </p>
                </div>
            )}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                {displayPermit.address && (
                    <div>
                        <span className="text-gray-500 font-medium">
                            Address:
                        </span>
                        <span className="ml-2 text-gray-900">
                            {displayPermit.address}
                        </span>
                    </div>
                )}
                {displayPermit.state && (
                    <div>
                        <span className="text-gray-500 font-medium">State:</span>
                        <span className="ml-2 text-gray-900">
                            {displayPermit.state}
                        </span>
                    </div>
                )}
                {displayPermit.zipCode && (
                    <div>
                        <span className="text-gray-500 font-medium">
                            Zip Code:
                        </span>
                        <span className="ml-2 text-gray-900">
                            {displayPermit.zipCode}
                        </span>
                    </div>
                )}
            </div>

            {displayPermit.contractors && displayPermit.contractors.length > 0 && (
                <div className="mt-2">
                    <span className="text-xs font-medium text-gray-500 uppercase">
                        Contractors:
                    </span>
                    <div className="mt-2 space-y-2">
                        {displayPermit.contractors.map((link, idx) => (
                            <div
                                key={link.contractor.id + idx}
                                className="rounded border border-gray-200 p-3"
                            >
                                <div className="flex items-center justify-between">
                                    <div className="text-sm font-medium text-gray-900">
                                        {link.contractor.name || "Unknown Contractor"}
                                    </div>
                                    {link.role && (
                                        <span className="text-xs text-gray-600">{link.role}</span>
                                    )}
                                </div>
                                <div className="mt-1 grid grid-cols-2 md:grid-cols-3 gap-2 text-xs text-gray-700">
                                    <div>
                                        <span className="text-gray-500">License:</span>
                                        <span className="ml-1">{link.contractor.licenseNo}</span>
                                    </div>
                                    {link.contractor.phone && (
                                        <div>
                                            <span className="text-gray-500">Phone:</span>
                                            <span className="ml-1">{link.contractor.phone}</span>
                                        </div>
                                    )}
                                    {(link.contractor.city || link.contractor.state) && (
                                        <div>
                                            <span className="text-gray-500">Location:</span>
                                            <span className="ml-1">
                                                {link.contractor.city || ""} {link.contractor.state || ""}
                                            </span>
                                        </div>
                                    )}
                                    {link.contractor.classifications?.length > 0 && (
                                        <div className="col-span-2">
                                            <span className="text-gray-500">Classifications:</span>
                                            <span className="ml-1">
                                                {link.contractor.classifications
                                                    .map((c) => c.classification)
                                                    .join(", ")}
                                            </span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}


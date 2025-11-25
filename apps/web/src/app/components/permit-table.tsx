"use client";

import { useState } from "react";
import * as React from "react";
import Link from "next/link";
import type { Permit } from "@/types/permit";
import { PermitDetailView } from "./permit-detail-view";
import { getCityDisplayName, getCityPageUrl } from "@/lib/cities";
import type { City } from "@prisma/client";
import { getPermitBadges } from "@/lib/badges/permit-badges";
import { PermitBadges } from "./permit-badge";

interface PermitRowProps {
    permit: Permit;
    isExpanded: boolean;
    onToggle: () => void;
}

// Formatting utilities
const formatCurrency = (amount: number | null) => {
    if (!amount) return "N/A";
    return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        minimumFractionDigits: 0,
    }).format(amount);
};

const formatDate = (date: string | null) => {
    if (!date) return "N/A";
    try {
        const dateObj = new Date(date);
        if (isNaN(dateObj.getTime())) return "Invalid date";
        return new Intl.DateTimeFormat("en-US", {
            year: "numeric",
            month: "short",
            day: "numeric",
        }).format(dateObj);
    } catch {
        return "Invalid date";
    }
};

const formatPropertyType = (type: string | null) => {
    if (!type) return "N/A";
    return type.charAt(0) + type.slice(1).toLowerCase();
};

const formatPermitType = (type: string | null) => {
    if (!type) return "N/A";
    return type.charAt(0) + type.slice(1).toLowerCase();
};

const formatStatus = (status: string | null) => {
    if (!status) return "N/A";
    return status
        .split("_")
        .map((word) => word.charAt(0) + word.slice(1).toLowerCase())
        .join(" ");
};

const getStatusColor = (status: string | null) => {
    switch (status?.toUpperCase()) {
        case "ISSUED":
            return "bg-green-100 text-green-800";
        case "IN_REVIEW":
            return "bg-yellow-100 text-yellow-800";
        case "SUBMITTED":
            return "bg-blue-100 text-blue-800";
        case "APPROVED":
            return "bg-emerald-100 text-emerald-800";
        case "DRAFT":
            return "bg-gray-100 text-gray-800";
        case "EXPIRED":
            return "bg-orange-100 text-orange-800";
        case "REVOKED":
        case "CANCELLED":
            return "bg-red-100 text-red-800";
        default:
            return "bg-gray-100 text-gray-800";
    }
};

function PermitRow({
    permit,
    isExpanded,
    onToggle,
}: PermitRowProps) {
    return (
        <>
            <tr
                onClick={onToggle}
                className="border-b border-gray-200 hover:bg-gray-50 cursor-pointer transition-colors"
            >
                <td className="px-4 py-3">
                    <div className="flex flex-col gap-1.5">
                        <span className="text-sm font-medium text-gray-900">
                            {permit.permitNumber}
                        </span>
                        <PermitBadges badges={getPermitBadges(permit)} />
                    </div>
                </td>
                <td className="px-4 py-3 text-sm text-gray-700">
                    {formatPermitType(permit.permitType)}
                </td>
                <td className="px-4 py-3 text-sm text-gray-700">
                    {formatPropertyType(permit.propertyType)}
                </td>
                <td className="px-4 py-3 text-sm text-gray-700">
                    {permit.city ? (
                        <Link
                            href={getCityPageUrl(permit.city as City)}
                            onClick={(e) => e.stopPropagation()}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:text-blue-800 hover:underline"
                        >
                            {getCityDisplayName(permit.city as City)}
                        </Link>
                    ) : (
                        "-"
                    )}
                </td>
                <td className="px-4 py-3 text-sm text-gray-700">
                    {formatCurrency(permit.value)}
                </td>
                <td className="px-4 py-3 text-sm text-gray-700">
                    {permit.appliedDateString ||
                        formatDate(permit.appliedDate) ||
                        "-"}
                </td>
                <td className="px-4 py-3">
                    {permit.status && (
                        <span
                            className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(permit.status)}`}
                        >
                            {formatStatus(permit.status)}
                        </span>
                    )}
                </td>
                <td className="px-4 py-3 text-sm text-gray-500">
                    <svg
                        className={`w-5 h-5 transition-transform ${
                            isExpanded ? "transform rotate-180" : ""
                        }`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                    >
                        <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M19 9l-7 7-7-7"
                        />
                    </svg>
                </td>
            </tr>
            {isExpanded && (
                <tr>
                    <td colSpan={8} className="px-4 py-4 bg-gray-50">
                        <PermitDetailView
                            permitId={permit.id}
                            basicPermit={permit}
                        />
                    </td>
                </tr>
            )}
        </>
    );
}

type SortField =
    | "PERMIT_TYPE"
    | "PROPERTY_TYPE"
    | "CITY"
    | "VALUE"
    | "APPLIED_DATE"
    | "STATUS";
type SortOrder = "ASC" | "DESC";

interface PermitTableProps {
    permits: Permit[];
    sortField: SortField | null;
    sortOrder: SortOrder;
    onSort: (field: SortField) => void;
}

function SortableHeader({
    field,
    currentSortField,
    currentSortOrder,
    onSort,
    children,
}: {
    field: SortField;
    currentSortField: SortField | null;
    currentSortOrder: SortOrder;
    onSort: (field: SortField) => void;
    children: React.ReactNode;
}) {
    const isActive = currentSortField === field;
    const isAsc = isActive && currentSortOrder === "ASC";

    return (
        <th
            onClick={() => onSort(field)}
            className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 select-none"
        >
            <div className="flex items-center space-x-1">
                <span>{children}</span>
                <span className="flex flex-col">
                    <svg
                        className={`w-3 h-3 ${
                            isActive && !isAsc
                                ? "text-gray-900"
                                : "text-gray-400"
                        }`}
                        fill="currentColor"
                        viewBox="0 0 20 20"
                    >
                        <path
                            fillRule="evenodd"
                            d="M14.77 12.79a.75.75 0 01-1.06.02L10 8.832 6.29 12.81a.75.75 0 11-1.08-1.04l4.25-4.5a.75.75 0 011.08 0l4.25 4.5a.75.75 0 01.02 1.06z"
                            clipRule="evenodd"
                        />
                    </svg>
                    <svg
                        className={`w-3 h-3 -mt-1 ${
                            isActive && isAsc ? "text-gray-900" : "text-gray-400"
                        }`}
                        fill="currentColor"
                        viewBox="0 0 20 20"
                    >
                        <path
                            fillRule="evenodd"
                            d="M5.23 7.21a.75.75 0 011.06-.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01-.02-1.06z"
                            clipRule="evenodd"
                        />
                    </svg>
                </span>
            </div>
        </th>
    );
}

export function PermitTable({
    permits,
    sortField,
    sortOrder,
    onSort,
}: PermitTableProps) {
    const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

    const handleToggleRow = (id: string) => {
        const isCurrentlyExpanded = expandedRows.has(id);
        const newExpanded = new Set(expandedRows);

        if (isCurrentlyExpanded) {
            newExpanded.delete(id);
        } else {
            newExpanded.add(id);
        }

        setExpandedRows(newExpanded);
    };

    if (permits.length === 0) {
        return (
            <div className="text-center py-12 text-gray-500">
                No permits to display
            </div>
        );
    }

    return (
        <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 bg-white">
                <thead className="bg-gray-50">
                    <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Permit Number
                        </th>
                        <SortableHeader
                            field="PERMIT_TYPE"
                            currentSortField={sortField}
                            currentSortOrder={sortOrder}
                            onSort={onSort}
                        >
                            Type
                        </SortableHeader>
                        <SortableHeader
                            field="PROPERTY_TYPE"
                            currentSortField={sortField}
                            currentSortOrder={sortOrder}
                            onSort={onSort}
                        >
                            Property
                        </SortableHeader>
                        <SortableHeader
                            field="CITY"
                            currentSortField={sortField}
                            currentSortOrder={sortOrder}
                            onSort={onSort}
                        >
                            City
                        </SortableHeader>
                        <SortableHeader
                            field="VALUE"
                            currentSortField={sortField}
                            currentSortOrder={sortOrder}
                            onSort={onSort}
                        >
                            Value
                        </SortableHeader>
                        <SortableHeader
                            field="APPLIED_DATE"
                            currentSortField={sortField}
                            currentSortOrder={sortOrder}
                            onSort={onSort}
                        >
                            Applied Date
                        </SortableHeader>
                        <SortableHeader
                            field="STATUS"
                            currentSortField={sortField}
                            currentSortOrder={sortOrder}
                            onSort={onSort}
                        >
                            Status
                        </SortableHeader>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-10">
                            {/* Expand/Collapse column */}
                        </th>
                    </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                    {permits.map((permit) => (
                        <PermitRow
                            key={permit.id}
                            permit={permit}
                            isExpanded={expandedRows.has(permit.id)}
                            onToggle={() => handleToggleRow(permit.id)}
                        />
                    ))}
                </tbody>
            </table>
        </div>
    );
}


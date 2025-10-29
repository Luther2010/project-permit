"use client";

import { useState } from "react";
import type { Permit } from "@/types/permit";
import { PermitDetailView } from "./permit-detail-view";

interface PermitRowProps {
    permit: Permit;
    isExpanded: boolean;
    onToggle: () => void;
}

// Formatting utilities (reused from permit-card)
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
                <td className="px-4 py-3 text-sm font-medium text-gray-900">
                    {permit.permitNumber}
                </td>
                <td className="px-4 py-3 text-sm text-gray-700">
                    {permit.title || "-"}
                </td>
                <td className="px-4 py-3 text-sm text-gray-700">
                    {formatPermitType(permit.permitType)}
                </td>
                <td className="px-4 py-3 text-sm text-gray-700">
                    {formatPropertyType(permit.propertyType)}
                </td>
                <td className="px-4 py-3 text-sm text-gray-700">
                    {permit.city || "-"}
                </td>
                <td className="px-4 py-3 text-sm text-gray-700">
                    {formatCurrency(permit.value)}
                </td>
                <td className="px-4 py-3 text-sm text-gray-700">
                    {permit.issuedDateString ||
                        formatDate(permit.issuedDate) ||
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
                    <td colSpan={9} className="px-4 py-4 bg-gray-50">
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

interface PermitTableProps {
    permits: Permit[];
}

export function PermitTable({ permits }: PermitTableProps) {
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
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Title
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Type
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Property
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            City
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Value
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Issue Date
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Status
                        </th>
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


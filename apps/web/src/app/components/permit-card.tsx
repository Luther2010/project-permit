import type { Permit } from "@/types/permit";

interface PermitCardProps {
    permit: Permit;
}

export function PermitCard({ permit }: PermitCardProps) {
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
        // Convert RESIDENTIAL -> Residential, COMMERCIAL -> Commercial, etc.
        return type.charAt(0) + type.slice(1).toLowerCase();
    };

    const formatPermitType = (type: string | null) => {
        if (!type) return "N/A";
        // Convert BUILDING -> Building, ELECTRICAL -> Electrical, etc.
        return type.charAt(0) + type.slice(1).toLowerCase();
    };

    const formatStatus = (status: string | null) => {
        if (!status) return "N/A";
        // Convert IN_REVIEW -> In Review, DRAFT -> Draft, etc.
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

    return (
        <div className="border border-gray-200 rounded-lg p-6 hover:shadow-md transition-shadow bg-white">
            <div className="flex items-start justify-between mb-3">
                <div>
                    <h3 className="text-lg font-semibold text-gray-900">
                        {permit.permitNumber}
                    </h3>
                    {permit.title && (
                        <p className="text-sm text-gray-600 mt-1">
                            {permit.title}
                        </p>
                    )}
                </div>
                {permit.status && (
                    <span
                        className={`px-3 py-1 text-xs font-medium rounded-full ${getStatusColor(permit.status)}`}
                    >
                        {formatStatus(permit.status)}
                    </span>
                )}
            </div>

            {permit.description && (
                <p className="text-sm text-gray-700 mb-4">
                    {permit.description}
                </p>
            )}

            <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                    <span className="text-gray-500 font-medium">Type:</span>
                    <span className="ml-2 text-gray-900">
                        {formatPermitType(permit.permitType)}
                    </span>
                </div>
                <div>
                    <span className="text-gray-500 font-medium">Property:</span>
                    <span className="ml-2 text-gray-900">
                        {formatPropertyType(permit.propertyType)}
                    </span>
                </div>
                <div>
                    <span className="text-gray-500 font-medium">Value:</span>
                    <span className="ml-2 text-gray-900">
                        {formatCurrency(permit.value)}
                    </span>
                </div>
                <div>
                    <span className="text-gray-500 font-medium">Applied:</span>
                    <span className="ml-2 text-gray-900">
                        {permit.appliedDateString || formatDate(permit.appliedDate)}
                    </span>
                </div>
                {(permit.city || permit.state) && (
                    <div>
                        <span className="text-gray-500 font-medium">
                            Location:
                        </span>
                        <span className="ml-2 text-gray-900">
                            {permit.city || ""} {permit.state || ""}
                        </span>
                    </div>
                )}
            </div>

            {permit.address && (
                <div className="mt-3 pt-3 border-t border-gray-200">
                    <span className="text-xs text-gray-500">
                        {permit.address}
                    </span>
                </div>
            )}
        </div>
    );
}

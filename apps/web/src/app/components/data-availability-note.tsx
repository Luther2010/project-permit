export function DataAvailabilityNote() {
    return (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-start">
            <div className="flex-shrink-0">
                <svg
                    className="w-5 h-5 text-blue-600 flex-shrink-0"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                >
                    <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                </svg>
            </div>
            <div className="ml-3 flex-1">
                <p className="text-sm font-medium text-blue-800">
                    <strong>Note:</strong> Data is available starting from January 2025.
                </p>
            </div>
        </div>
    );
}


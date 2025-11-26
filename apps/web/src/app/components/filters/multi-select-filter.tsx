"use client";

interface Option<T> {
    value: T;
    label: string;
}

interface MultiSelectFilterProps<T> {
    label: string;
    options: Option<T>[];
    selectedValues: T[];
    onChange: (selectedValues: T[]) => void;
    showClearButton?: boolean;
}

export function MultiSelectFilter<T extends string | number>({
    label,
    options,
    selectedValues,
    onChange,
    showClearButton = false,
}: MultiSelectFilterProps<T>) {
    const handleToggle = (value: T, checked: boolean) => {
        const newSelection = checked
            ? [...selectedValues, value]
            : selectedValues.filter((v) => v !== value);
        onChange(newSelection);
    };

    const allSelected = options.length > 0 && selectedValues.length === options.length;
    const someSelected = selectedValues.length > 0 && selectedValues.length < options.length;

    const handleSelectAll = (checked: boolean) => {
        if (checked) {
            onChange(options.map((opt) => opt.value));
        } else {
            onChange([]);
        }
    };

    return (
        <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
                {label}
            </label>
            <div className="border border-gray-300 rounded-md p-3 max-h-48 overflow-y-auto bg-white">
                {/* Select All option */}
                <label
                    className="flex items-center space-x-2 py-1 cursor-pointer hover:bg-gray-50 rounded px-2 border-b border-gray-200 mb-1 pb-2"
                >
                    <input
                        type="checkbox"
                        checked={allSelected}
                        ref={(input) => {
                            if (input) input.indeterminate = someSelected;
                        }}
                        onChange={(e) => handleSelectAll(e.target.checked)}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-sm font-medium text-gray-900">
                        Select All
                    </span>
                </label>
                {options.map((option) => (
                    <label
                        key={String(option.value)}
                        className="flex items-center space-x-2 py-1 cursor-pointer hover:bg-gray-50 rounded px-2"
                    >
                        <input
                            type="checkbox"
                            checked={selectedValues.includes(option.value)}
                            onChange={(e) =>
                                handleToggle(option.value, e.target.checked)
                            }
                            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-sm text-gray-700">
                            {option.label}
                        </span>
                    </label>
                ))}
            </div>
            {showClearButton && selectedValues.length > 0 && (
                <button
                    type="button"
                    onClick={() => onChange([])}
                    className="mt-2 text-sm text-blue-600 hover:text-blue-800"
                >
                    Clear selection
                </button>
            )}
        </div>
    );
}


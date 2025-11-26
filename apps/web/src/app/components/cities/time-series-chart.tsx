"use client";

import type { City } from "@prisma/client";
import { getCityDisplayName } from "@/lib/cities";

interface MonthlyCount {
    month: string; // YYYY-MM
    count: number;
}

interface CityData {
    city: City;
    monthlyCounts: MonthlyCount[] | null;
    permitCount: number;
}

interface TimeSeriesChartProps {
    data: CityData[];
}

const COLORS = [
    "#3B82F6", // blue
    "#10B981", // green
    "#F59E0B", // amber
    "#EF4444", // red
    "#8B5CF6", // purple
    "#EC4899", // pink
    "#06B6D4", // cyan
    "#84CC16", // lime
];

export function TimeSeriesChart({ data }: TimeSeriesChartProps) {
    if (data.length === 0) {
        return (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 text-center">
                <p className="text-gray-500">No data available</p>
            </div>
        );
    }

    // Filter out cities without monthly breakdown data
    const citiesWithData = data.filter((d) => d.monthlyCounts !== null && d.monthlyCounts.length > 0);
    
    if (citiesWithData.length === 0) {
        return (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 text-center">
                <p className="text-gray-500">No monthly data available</p>
            </div>
        );
    }

    // Get all unique months from all cities
    const allMonths = citiesWithData[0]?.monthlyCounts?.map((m) => m.month) || [];
    
    // Find max count for scaling
    const maxCount = Math.max(
        ...citiesWithData.flatMap((d) => (d.monthlyCounts || []).map((m) => m.count)),
        1
    );

    const chartHeight = 300;
    const chartWidth = 800;
    const padding = { top: 20, right: 20, bottom: 40, left: 60 };
    const innerWidth = chartWidth - padding.left - padding.right;
    const innerHeight = chartHeight - padding.top - padding.bottom;

    // Format month for display (e.g., "Jan 2025")
    const formatMonth = (monthStr: string) => {
        const [year, month] = monthStr.split("-");
        const date = new Date(parseInt(year), parseInt(month) - 1);
        return date.toLocaleDateString("en-US", { month: "short", year: "numeric" });
    };

    // Get x position for a month
    const getX = (index: number) => {
        return padding.left + (index / (allMonths.length - 1)) * innerWidth;
    };

    // Get y position for a count
    const getY = (count: number) => {
        return padding.top + innerHeight - (count / maxCount) * innerHeight;
    };

    // Generate path for a city's data
    const getPath = (cityData: CityData) => {
        if (!cityData.monthlyCounts) return "";
        const points = cityData.monthlyCounts.map((monthData, index) => {
            const x = getX(index);
            const y = getY(monthData.count);
            return `${index === 0 ? "M" : "L"} ${x} ${y}`;
        });
        return points.join(" ");
    };

    return (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="overflow-x-auto">
                <svg
                    width={chartWidth}
                    height={chartHeight + 100}
                    className="min-w-full"
                    viewBox={`0 0 ${chartWidth} ${chartHeight + 100}`}
                >
                    {/* Y-axis label */}
                    <text
                        x={padding.left / 2}
                        y={chartHeight / 2}
                        textAnchor="middle"
                        className="text-xs fill-gray-600"
                        transform={`rotate(-90 ${padding.left / 2} ${chartHeight / 2})`}
                    >
                        Number of Permits
                    </text>

                    {/* Y-axis grid lines and labels */}
                    {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
                        const value = Math.round(maxCount * ratio);
                        const y = getY(value);
                        return (
                            <g key={ratio}>
                                <line
                                    x1={padding.left}
                                    y1={y}
                                    x2={chartWidth - padding.right}
                                    y2={y}
                                    stroke="#E5E7EB"
                                    strokeWidth={1}
                                />
                                <text
                                    x={padding.left - 10}
                                    y={y + 4}
                                    textAnchor="end"
                                    className="text-xs fill-gray-600"
                                >
                                    {value}
                                </text>
                            </g>
                        );
                    })}

                    {/* X-axis grid lines and labels */}
                    {allMonths.map((month, index) => {
                        const x = getX(index);
                        return (
                            <g key={month}>
                                <line
                                    x1={x}
                                    y1={padding.top}
                                    x2={x}
                                    y2={chartHeight - padding.bottom}
                                    stroke="#E5E7EB"
                                    strokeWidth={1}
                                />
                                <text
                                    x={x}
                                    y={chartHeight - padding.bottom + 20}
                                    textAnchor="middle"
                                    className="text-xs fill-gray-600"
                                >
                                    {formatMonth(month)}
                                </text>
                            </g>
                        );
                    })}

                    {/* Plot lines for each city */}
                    {citiesWithData.map((cityData, cityIndex) => {
                        const color = COLORS[cityIndex % COLORS.length];
                        return (
                            <g key={cityData.city}>
                                <path
                                    d={getPath(cityData)}
                                    fill="none"
                                    stroke={color}
                                    strokeWidth={2}
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                />
                                {/* Data points */}
                                {cityData.monthlyCounts?.map((monthData, index) => {
                                    const x = getX(index);
                                    const y = getY(monthData.count);
                                    return (
                                        <circle
                                            key={`${cityData.city}-${monthData.month}`}
                                            cx={x}
                                            cy={y}
                                            r={4}
                                            fill={color}
                                        />
                                    );
                                })}
                            </g>
                        );
                    })}
                </svg>
            </div>

            {/* Legend */}
            <div className="mt-6 flex flex-wrap gap-4 justify-center">
                {citiesWithData.map((cityData, index) => {
                    const color = COLORS[index % COLORS.length];
                    return (
                        <div key={cityData.city} className="flex items-center gap-2">
                            <div
                                className="w-4 h-4 rounded-full"
                                style={{ backgroundColor: color }}
                            />
                            <span className="text-sm text-gray-700">
                                {getCityDisplayName(cityData.city)} ({cityData.permitCount.toLocaleString()})
                            </span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}


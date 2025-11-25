"use client";

import Link from "next/link";

export function HeroSection() {
    return (
        <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
                <div className="text-center">
                    <div className="inline-flex items-center gap-2 bg-blue-500/20 backdrop-blur-sm border border-blue-400/30 rounded-full px-4 py-2 mb-6">
                        <svg
                            className="w-5 h-5 text-blue-200"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                        >
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M13 10V3L4 14h7v7l9-11h-7z"
                            />
                        </svg>
                        <span className="text-sm font-medium text-blue-100">
                            Most Current Permit Data in the Market
                        </span>
                    </div>
                    <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold mb-4">
                        Real-Time Permit Information
                    </h1>
                    <p className="text-xl sm:text-2xl text-blue-100 mb-6 max-w-3xl mx-auto">
                        Get the latest permit data updated daily from 14+ cities across the Bay Area
                    </p>
                    <div className="flex flex-wrap justify-center gap-6 text-sm sm:text-base mb-8">
                        <div className="flex items-center gap-2">
                            <svg
                                className="w-5 h-5 text-blue-200"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                            >
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                                />
                            </svg>
                            <span className="text-blue-100">Updated Daily</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <svg
                                className="w-5 h-5 text-blue-200"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                            >
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                                />
                            </svg>
                            <span className="text-blue-100">14+ Cities & Rapidly Expanding</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <svg
                                className="w-5 h-5 text-blue-200"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                            >
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                                />
                            </svg>
                            <span className="text-blue-100">Direct from Official Sources</span>
                        </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-4xl mx-auto text-sm sm:text-base">
                        <div className="bg-blue-500/20 backdrop-blur-sm border border-blue-400/30 rounded-lg p-4">
                            <div className="flex items-start gap-3">
                                <svg
                                    className="w-6 h-6 text-blue-200 flex-shrink-0 mt-0.5"
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                >
                                    <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={2}
                                        d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"
                                    />
                                </svg>
                                <div>
                                    <h3 className="font-semibold text-blue-50 mb-1">Rapidly Expanding</h3>
                                    <p className="text-blue-100 text-sm">
                                        We&apos;re continuously adding new cities to our coverage
                                    </p>
                                </div>
                            </div>
                        </div>
                        <div className="bg-blue-500/20 backdrop-blur-sm border border-blue-400/30 rounded-lg p-4">
                            <div className="flex items-start gap-3">
                                <svg
                                    className="w-6 h-6 text-blue-200 flex-shrink-0 mt-0.5"
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                >
                                    <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={2}
                                        d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
                                    />
                                </svg>
                                <div>
                                    <h3 className="font-semibold text-blue-50 mb-1">Your Voice Matters</h3>
                                    <p className="text-blue-100 text-sm">
                                        <Link 
                                            href="/features#voting" 
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="underline hover:text-blue-50 transition-colors"
                                        >
                                            Vote on which cities we should add next
                                        </Link>
                                    </p>
                                </div>
                            </div>
                        </div>
                        <div className="bg-blue-500/20 backdrop-blur-sm border border-blue-400/30 rounded-lg p-4">
                            <div className="flex items-start gap-3">
                                <svg
                                    className="w-6 h-6 text-blue-200 flex-shrink-0 mt-0.5"
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                >
                                    <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={2}
                                        d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
                                    />
                                </svg>
                                <div>
                                    <h3 className="font-semibold text-blue-50 mb-1">One Subscription</h3>
                                    <p className="text-blue-100 text-sm">
                                        Access all cities with a single subscription
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}


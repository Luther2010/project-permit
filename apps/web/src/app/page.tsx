"use client";

import { PermitCard } from "./components/permit-card";
import { graphqlFetch } from "@/lib/graphql-client";
import type { Permit } from "@/types/permit";
import { AuthButtons } from "./components/auth-buttons";
import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";

async function getPermits(): Promise<{ permits: Permit[] }> {
    const query = `
        query {
            permits {
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
                issuedDate
                issuedDateString
            }
        }
    `;

    try {
        const data = await graphqlFetch(query);
        return { permits: data.permits || [] };
    } catch (error) {
        console.error("Error fetching permits:", error);
        return { permits: [] };
    }
}

export default function Home() {
    const { data: session, status } = useSession();
    const [permits, setPermits] = useState<Permit[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function fetchPermits() {
            setLoading(true);
            const { permits } = await getPermits();
            setPermits(permits);
            setLoading(false);
        }
        fetchPermits();
    }, []);

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

                {loading ? (
                    <div className="text-center py-12">
                        <p className="text-gray-500">Loading permits...</p>
                    </div>
                ) : permits.length === 0 ? (
                    <div className="text-center py-12">
                        <p className="text-gray-500">No permits found</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {permits.map((permit) => (
                            <PermitCard key={permit.id} permit={permit} />
                        ))}
                    </div>
                )}
            </main>
        </div>
    );
}

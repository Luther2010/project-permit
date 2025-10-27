import { PermitCard } from "./components/permit-card";

async function getPermits() {
    const res = await fetch(
        `${process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000"}/api/permits`,
        {
            next: { revalidate: 0 }, // Always fetch fresh data
        }
    );

    if (!res.ok) {
        return { permits: [] };
    }

    return res.json();
}

export default async function Home() {
    const { permits } = await getPermits();

    return (
        <div className="min-h-screen bg-gray-50">
            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                <div className="mb-8">
                    <h1 className="text-3xl font-bold text-gray-900">
                        Permits
                    </h1>
                    <p className="mt-2 text-gray-600">
                        Browse building permits and project information
                    </p>
                </div>

                {permits.length === 0 ? (
                    <div className="text-center py-12">
                        <p className="text-gray-500">No permits found</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {permits.map((permit: any) => (
                            <PermitCard key={permit.id} permit={permit} />
                        ))}
                    </div>
                )}
            </main>
        </div>
    );
}

import { PrismaClient } from "@prisma/client";

// Use DATABASE_URL from environment (can be overridden for prod)
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
    console.error("❌ DATABASE_URL environment variable is not set");
    process.exit(1);
}

const prisma = new PrismaClient({
    datasources: {
        db: {
            url: databaseUrl,
        },
    },
});

const features = [
    {
        id: "1",
        title: "Better Permit Classification",
        description: "Improved accuracy in categorizing permit types and property types",
    },
    {
        id: "2",
        title: "Natural Language Search",
        description: "Search permits using natural language queries powered by AI",
    },
    {
        id: "3",
        title: "More Cities",
        description: "Expand coverage to include more cities and regions",
    },
    {
        id: "4",
        title: "Export to CSV",
        description: "Download permit data as CSV files",
    },
    {
        id: "5",
        title: "Mobile App",
        description: "Native mobile app for iOS and Android",
    },
    {
        id: "6",
        title: "API Access",
        description: "Programmatic access to permit data",
    },
    {
        id: "7",
        title: "Contractor Profiles",
        description: "Detailed contractor information and ratings",
    },
    {
        id: "8",
        title: "Permit Analytics Dashboard",
        description: "Visual analytics and insights",
    },
    {
        id: "9",
        title: "Saved Searches",
        description: "Save and reuse your search queries",
    },
];

async function main() {
    console.log("Seeding feature options...");

    for (const feature of features) {
        await prisma.featureOption.upsert({
            where: { id: feature.id },
            update: {
                title: feature.title,
                description: feature.description,
                status: "ACTIVE",
            },
            create: {
                id: feature.id,
                title: feature.title,
                description: feature.description,
                status: "ACTIVE",
            },
        });
        console.log(`✓ Seeded feature: ${feature.title}`);
    }

    console.log("✅ Feature seeding completed!");
}

main()
    .catch((e) => {
        console.error("❌ Error seeding features:", e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });


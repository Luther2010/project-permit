import { prisma } from "../src/lib/db";
import { PermitType, PermitStatus } from "@prisma/client";

async function main() {
    console.log("🌱 Seeding database...");

    // Create sample permits
    const permits = [
        {
            permitNumber: "BLD-2024-001",
            title: "Residential Addition",
            description: "Single family residential addition - 500 sq ft",
            address: "123 Main St",
            city: null, // Seed data - city not in enum
            state: "CA",
            zipCode: "94102",
            permitType: PermitType.BUILDING,
            status: PermitStatus.ISSUED,
            value: 150000,
            issuedDate: new Date("2024-01-15"),
            sourceUrl: "https://example.com/permits/BLD-2024-001",
        },
        {
            permitNumber: "ELC-2024-042",
            title: "Electrical Service Upgrade",
            description: "Upgrade electrical service to 200A",
            address: "456 Oak Ave",
            city: null, // Seed data - city not in enum
            state: "CA",
            zipCode: "94103",
            permitType: PermitType.ELECTRICAL,
            status: PermitStatus.IN_REVIEW,
            value: 8500,
            issuedDate: new Date("2024-02-01"),
            sourceUrl: "https://example.com/permits/ELC-2024-042",
        },
        {
            permitNumber: "PLB-2024-128",
            title: "Bathroom Remodel",
            description: "Complete bathroom remodel with new fixtures",
            address: "789 Pine St",
            city: null, // Seed data - city not in enum
            state: "CA",
            zipCode: "94601",
            permitType: PermitType.PLUMBING,
            status: PermitStatus.ISSUED,
            value: 25000,
            issuedDate: new Date("2024-02-15"),
            sourceUrl: "https://example.com/permits/PLB-2024-128",
        },
    ];

    for (const permit of permits) {
        // Skip permits without a city (can't use composite key)
        if (!permit.city) {
            console.log(`⚠️  Skipping permit ${permit.permitNumber}: city is null`);
            continue;
        }

        const created = await prisma.permit.upsert({
            where: {
                permitNumber_city: {
                    permitNumber: permit.permitNumber,
                    city: permit.city,
                }
            },
            update: {},
            create: permit,
        });
        console.log(`✅ Created permit: ${created.permitNumber}`);
    }

    console.log("✨ Seeding completed!");
}

main()
    .catch((e) => {
        console.error("❌ Seeding failed:", e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });

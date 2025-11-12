import { prisma } from "../src/lib/db";

async function main() {
    console.log("🗑️  Clearing all permits from database...");
    
    // Delete permit-contractor links first (foreign key constraint)
    const deletedLinks = await prisma.permitContractor.deleteMany({});
    console.log(`Deleted ${deletedLinks.count} permit-contractor links`);
    
    // Then delete permits
    const result = await prisma.permit.deleteMany({});
    console.log(`✅ Deleted ${result.count} permits`);
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });

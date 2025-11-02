import { prisma } from "../src/lib/db";

async function main() {
    console.log("🗑️  Clearing all permits from database...");
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

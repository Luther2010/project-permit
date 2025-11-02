import { prisma } from "../src/lib/db";

async function main() {
    const total = await prisma.permit.count();
    const byCity = await prisma.permit.groupBy({
        by: ['city'],
        _count: true,
    });
    
    console.log(`\n📊 Total permits in database: ${total}\n`);
    console.log("Permits by city:");
    for (const city of byCity) {
        console.log(`  ${city.city || 'null'}: ${city._count}`);
    }
}

main()
    .catch(console.error)
    .finally(async () => {
        await prisma.$disconnect();
    });

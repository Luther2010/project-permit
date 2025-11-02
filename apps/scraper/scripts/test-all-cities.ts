import { getEnabledCities } from "../src/config/cities";
import { scrapeCity } from "../src/scraper";

async function main() {
    const cities = getEnabledCities();
    const testDate = new Date(2025, 9, 28); // October 28, 2025
    const limit = 3;

    console.log(`🧪 Testing all ${cities.length} enabled cities with limit ${limit}...\n`);

    for (const cityConfig of cities) {
        try {
            console.log(`\n${"=".repeat(60)}`);
            console.log(`Testing: ${cityConfig.city} (${cityConfig.scraperType})`);
            console.log("=".repeat(60));
            
            await scrapeCity(cityConfig.city, testDate, limit);
            
            console.log(`✅ ${cityConfig.city} test completed\n`);
        } catch (error) {
            console.error(`❌ ${cityConfig.city} test failed:`, error);
            console.log();
        }
    }

    console.log("\n✨ All tests completed!");
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        const { prisma } = await import("../src/lib/db");
        await prisma.$disconnect();
    });

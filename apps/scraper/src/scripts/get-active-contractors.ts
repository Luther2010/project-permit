/**
 * Script to get active contractors from the last N months
 * 
 * Usage:
 *   pnpm tsx src/scripts/get-active-contractors.ts [months]
 *   Default: 12 months
 */

import { getActiveContractors } from "../lib/get-active-contractors";
import { prisma } from "../lib/db";

async function main() {
    const args = process.argv.slice(2);
    const months = args[0] ? parseInt(args[0], 10) : 12;

    if (isNaN(months) || months <= 0) {
        console.error("Invalid months value. Must be a positive number.");
        process.exit(1);
    }

    console.log(`\n📊 Fetching contractors with permits in the last ${months} months...\n`);

    try {
        const activeContractors = await getActiveContractors(months);

        console.log(`\n✅ Results:\n`);
        console.log(`Total contractors: ${activeContractors.length}`);
        
        if (activeContractors.length > 0) {
            // Calculate statistics
            const totalPermits = activeContractors.reduce((sum, c) => sum + c.permitCount, 0);
            const avgPermitsPerContractor = totalPermits / activeContractors.length;
            const maxPermits = Math.max(...activeContractors.map(c => c.permitCount));
            const minPermits = Math.min(...activeContractors.map(c => c.permitCount));

            console.log(`Total permits: ${totalPermits}`);
            console.log(`Average permits per contractor: ${avgPermitsPerContractor.toFixed(2)}`);
            console.log(`Max permits for a single contractor: ${maxPermits}`);
            console.log(`Min permits for a single contractor: ${minPermits}`);

            // Show top 10 contractors by permit count
            const topContractors = activeContractors
                .sort((a, b) => b.permitCount - a.permitCount)
                .slice(0, 10);

            console.log(`\n📈 Top 10 contractors by permit count:\n`);
            topContractors.forEach((contractor, index) => {
                console.log(
                    `${index + 1}. ${contractor.licenseNo} - ${contractor.name || "Unknown"} (${contractor.permitCount} permits)`
                );
            });
        }

        process.exit(0);
    } catch (error) {
        console.error("❌ Error:", error);
        process.exit(1);
    } finally {
        await prisma.$disconnect();
    }
}

main();


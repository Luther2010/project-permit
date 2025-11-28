/**
 * Generate CSV template for Energov permits for a specific date
 * 
 * This script queries the database for Energov permits (Sunnyvale and Gilroy)
 * for a specific date and generates a CSV template that can be filled in manually.
 * 
 * Usage:
 *   pnpm exec dotenv -e .env -- tsx scripts/generate-energov-template.ts <date> [output-file]
 * 
 * Example:
 *   pnpm exec dotenv -e .env -- tsx scripts/generate-energov-template.ts 2025-11-26
 *   pnpm exec dotenv -e .env -- tsx scripts/generate-energov-template.ts 2025-11-26 ../../data/energov-manual-data-2025-11-26.csv
 * 
 * Output:
 *   - If no output file specified, prints to stdout
 *   - If output file specified, writes to that file
 */

import { prisma } from "../src/lib/db";
import { City } from "@prisma/client";
import * as fs from "fs";
import * as path from "path";

async function generateTemplate(date: string, outputFile?: string) {
  // Validate date format (YYYY-MM-DD)
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(date)) {
    throw new Error("Invalid date format. Use YYYY-MM-DD");
  }

  console.log(`📅 Generating template for date: ${date}\n`);

  // Query Energov permits (Sunnyvale and Gilroy) for the specified date
  const permits = await prisma.permit.findMany({
    where: {
      city: {
        in: [City.SUNNYVALE, City.GILROY],
      },
      appliedDateString: date,
    },
    select: {
      permitNumber: true,
      value: true,
      contractors: {
        include: {
          contractor: {
            select: {
              licenseNo: true,
            },
          },
        },
      },
    },
    orderBy: {
      permitNumber: "asc",
    },
  });

  console.log(`📊 Found ${permits.length} Energov permit(s) for ${date}\n`);

  // Generate CSV
  const csvLines = ["permitNumber,value,contractorLicense"];

  for (const permit of permits) {
    const value = permit.value ? permit.value.toString() : "";
    // Get first contractor license number if any contractors are linked
    const contractorLicense = permit.contractors.length > 0 
      ? permit.contractors[0].contractor.licenseNo 
      : "";
    csvLines.push(`${permit.permitNumber},${value},${contractorLicense}`);
  }

  const csvContent = csvLines.join("\n") + "\n";

  // Output
  if (outputFile) {
    // Ensure directory exists
    const dir = path.dirname(outputFile);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(outputFile, csvContent, "utf-8");
    console.log(`✅ Template written to: ${outputFile}`);
    console.log(`\n📝 Next steps:`);
    console.log(`   1. Fill in the value and contractorLicense columns`);
    console.log(`   2. Run: pnpm exec dotenv -e .env -- tsx scripts/import-energov-manual-data.ts ${outputFile}`);
  } else {
    console.log(csvContent);
  }
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.error("❌ Error: Date is required");
    console.error("\nUsage:");
    console.error("  pnpm exec dotenv -e .env -- tsx scripts/generate-energov-template.ts <date> [output-file]");
    console.error("\nExample:");
    console.error("  pnpm exec dotenv -e .env -- tsx scripts/generate-energov-template.ts 2025-11-26");
    console.error("  pnpm exec dotenv -e .env -- tsx scripts/generate-energov-template.ts 2025-11-26 ../../data/energov-manual-data-2025-11-26.csv");
    process.exit(1);
  }

  const date = args[0];
  const outputFile = args[1];

  try {
    await generateTemplate(date, outputFile);
  } catch (error) {
    console.error("\n❌ Failed:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();


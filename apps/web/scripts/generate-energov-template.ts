/**
 * Generate CSV template for Energov permits for a date range
 * 
 * This script queries the database for Energov permits (Sunnyvale and Gilroy)
 * for a date range and generates a CSV template that can be filled in manually.
 * 
 * Usage:
 *   pnpm exec dotenv -e .env -- tsx scripts/generate-energov-template.ts --start-date <date> --end-date <date> [output-file]
 *   pnpm exec dotenv -e .env -- tsx scripts/generate-energov-template.ts <date> [output-file]  (single date, for backward compatibility)
 * 
 * Example:
 *   pnpm exec dotenv -e .env -- tsx scripts/generate-energov-template.ts --start-date 2025-11-22 --end-date 2025-11-28
 *   pnpm exec dotenv -e .env -- tsx scripts/generate-energov-template.ts --start-date 2025-11-22 --end-date 2025-11-28 ../../data/energov-manual-data-2025-11-22-1128.csv
 *   pnpm exec dotenv -e .env -- tsx scripts/generate-energov-template.ts 2025-11-26  (backward compatible: single date)
 * 
 * Output:
 *   - If no output file specified, prints to stdout
 *   - If output file specified, writes to that file
 */

import { prisma } from "../src/lib/db";
import { City } from "@prisma/client";
import * as fs from "fs";
import * as path from "path";

async function generateTemplate(startDate: string, endDate: string, outputFile?: string) {
  // Validate date format (YYYY-MM-DD)
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(startDate) || !dateRegex.test(endDate)) {
    throw new Error("Invalid date format. Use YYYY-MM-DD");
  }

  if (startDate > endDate) {
    throw new Error("Start date must be before or equal to end date");
  }

  const isSingleDate = startDate === endDate;
  const dateRangeText = isSingleDate ? startDate : `${startDate} to ${endDate}`;
  console.log(`📅 Generating template for date${isSingleDate ? "" : " range"}: ${dateRangeText}\n`);

  // Query Energov permits (Sunnyvale and Gilroy) for the date range
  const permits = await prisma.permit.findMany({
    where: {
      city: {
        in: [City.SUNNYVALE, City.GILROY],
      },
      appliedDateString: {
        gte: startDate,
        lte: endDate,
      },
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

  console.log(`📊 Found ${permits.length} Energov permit(s) for ${dateRangeText}\n`);

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
    console.error("❌ Error: Date or date range is required");
    console.error("\nUsage:");
    console.error("  pnpm exec dotenv -e .env -- tsx scripts/generate-energov-template.ts --start-date <date> --end-date <date> [output-file]");
    console.error("  pnpm exec dotenv -e .env -- tsx scripts/generate-energov-template.ts <date> [output-file]  (single date, backward compatible)");
    console.error("\nExample:");
    console.error("  pnpm exec dotenv -e .env -- tsx scripts/generate-energov-template.ts --start-date 2025-11-22 --end-date 2025-11-28");
    console.error("  pnpm exec dotenv -e .env -- tsx scripts/generate-energov-template.ts --start-date 2025-11-22 --end-date 2025-11-28 ../../data/energov-manual-data-2025-11-22-1128.csv");
    console.error("  pnpm exec dotenv -e .env -- tsx scripts/generate-energov-template.ts 2025-11-26  (single date)");
    process.exit(1);
  }

  let startDate: string;
  let endDate: string;
  let outputFile: string | undefined;

  // Check if using new format (--start-date and --end-date)
  const startDateIndex = args.indexOf("--start-date");
  const endDateIndex = args.indexOf("--end-date");

  if (startDateIndex !== -1 && endDateIndex !== -1) {
    // New format: --start-date and --end-date
    startDate = args[startDateIndex + 1];
    endDate = args[endDateIndex + 1];
    
    if (!startDate || !endDate) {
      console.error("❌ Error: --start-date and --end-date require date values");
      process.exit(1);
    }

    // Output file is the next argument after --end-date value, if it exists
    const outputFileIndex = endDateIndex + 2;
    if (outputFileIndex < args.length && !args[outputFileIndex].startsWith("--")) {
      outputFile = args[outputFileIndex];
    }
  } else {
    // Backward compatible: single date format
    startDate = args[0];
    endDate = args[0]; // Same date for start and end
    outputFile = args[1];
  }

  try {
    await generateTemplate(startDate, endDate, outputFile);
  } catch (error) {
    console.error("\n❌ Failed:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();


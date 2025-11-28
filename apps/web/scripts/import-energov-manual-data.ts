/**
 * Import manual data (value and contractor license) for Energov permits from CSV
 * 
 * This script reads a CSV file with permit numbers, values, and contractor license numbers
 * and updates the corresponding permits in the database.
 * 
 * Usage:
 *   pnpm exec dotenv -e .env -- tsx scripts/import-energov-manual-data.ts <csv-file-path>
 * 
 * CSV Format:
 *   permitNumber,value,contractorLicense
 *   BLDG-2025-5155,34100,123456
 *   BLDG-2025-5156,19482,
 * 
 * Notes:
 *   - Empty values are skipped (won't overwrite existing data)
 *   - Contractor license numbers will trigger automatic contractor matching
 *   - Updates are made to the development database
 */

import { prisma } from "../src/lib/db";
import * as fs from "fs";

interface CsvRow {
  permitNumber: string;
  value?: string;
  contractorLicense?: string;
}

function parseCsv(filePath: string): CsvRow[] {
  const content = fs.readFileSync(filePath, "utf-8");
  const lines = content.trim().split("\n");
  
  if (lines.length < 2) {
    throw new Error("CSV file must have at least a header row and one data row");
  }

  // Parse header
  const headers = lines[0].split(",").map(h => h.trim());
  const permitNumberIndex = headers.indexOf("permitNumber");
  const valueIndex = headers.indexOf("value");
  const contractorLicenseIndex = headers.indexOf("contractorLicense");

  if (permitNumberIndex === -1) {
    throw new Error("CSV must have 'permitNumber' column");
  }

  // Parse data rows
  const rows: CsvRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(",").map(v => v.trim());
    const row: CsvRow = {
      permitNumber: values[permitNumberIndex] || "",
    };

    if (valueIndex !== -1 && values[valueIndex]) {
      const valueStr = values[valueIndex].trim();
      if (valueStr) {
        row.value = valueStr;
      }
    }

    if (contractorLicenseIndex !== -1 && values[contractorLicenseIndex]) {
      const licenseStr = values[contractorLicenseIndex].trim();
      if (licenseStr) {
        row.contractorLicense = licenseStr;
      }
    }

    if (row.permitNumber) {
      rows.push(row);
    }
  }

  return rows;
}

async function importData(csvFilePath: string) {
  console.log(`📂 Reading CSV file: ${csvFilePath}\n`);

  if (!fs.existsSync(csvFilePath)) {
    throw new Error(`File not found: ${csvFilePath}`);
  }

  const rows = parseCsv(csvFilePath);
  console.log(`📊 Found ${rows.length} permit(s) in CSV\n`);

  let updated = 0;
  let notFound = 0;
  let skipped = 0;
  let errors = 0;

  for (const row of rows) {
    try {
      // Find permit by permit number
      const permit = await prisma.permit.findUnique({
        where: { permitNumber: row.permitNumber },
        include: {
          contractors: {
            include: {
              contractor: {
                select: { licenseNo: true },
              },
            },
          },
        },
      });

      if (!permit) {
        console.log(`⚠️  Permit not found: ${row.permitNumber}`);
        notFound++;
        continue;
      }

      // Prepare update data
      const updateData: {
        value?: number;
      } = {};

      // Update value if provided
      let hasValueUpdate = false;
      if (row.value) {
        const valueNum = parseFloat(row.value);
        if (isNaN(valueNum)) {
          console.log(`⚠️  Invalid value for ${row.permitNumber}: ${row.value}`);
          errors++;
          continue;
        }
        updateData.value = valueNum;
        hasValueUpdate = true;
      }

      // Skip if nothing to update
      if (!hasValueUpdate && !row.contractorLicense) {
        console.log(`⏭️  Skipping ${row.permitNumber}: no data to update`);
        skipped++;
        continue;
      }

      let permitUpdated = false;
      let contractorLinked = false;

      // Update permit value if provided
      if (hasValueUpdate) {
        await prisma.permit.update({
          where: { permitNumber: row.permitNumber },
          data: updateData,
        });
        console.log(`✅ Updated ${row.permitNumber} value: ${updateData.value}`);
        permitUpdated = true;
      }

      // If contractor license was provided, try to link contractor
      if (row.contractorLicense) {
        const contractor = await prisma.contractor.findUnique({
          where: { licenseNo: row.contractorLicense },
        });

        if (contractor) {
          // Check if link already exists
          const existingLink = await prisma.permitContractor.findUnique({
            where: {
              permitId_contractorId: {
                permitId: permit.id,
                contractorId: contractor.id,
              },
            },
          });

          if (!existingLink) {
            await prisma.permitContractor.create({
              data: {
                permitId: permit.id,
                contractorId: contractor.id,
              },
            });
            console.log(`   🔗 Linked contractor ${row.contractorLicense} to permit`);
            contractorLinked = true;
          } else {
            console.log(`   ℹ️  Contractor ${row.contractorLicense} already linked`);
          }
        } else {
          console.log(`   ⚠️  Contractor ${row.contractorLicense} not found in database`);
        }
      }

      // Count as updated if value was updated or contractor was linked
      if (permitUpdated || contractorLinked) {
        updated++;
      } else {
        // If we got here, contractor was provided but already linked or not found
        // (value wasn't updated and contractor wasn't newly linked)
        skipped++;
      }
    } catch (error) {
      console.error(`❌ Error processing ${row.permitNumber}:`, error);
      errors++;
    }
  }

  console.log(`\n📊 Import Summary:`);
  console.log(`   ✅ Updated: ${updated}`);
  console.log(`   ⚠️  Not found: ${notFound}`);
  console.log(`   ⏭️  Skipped: ${skipped}`);
  console.log(`   ❌ Errors: ${errors}`);
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.error("❌ Error: CSV file path is required");
    console.error("\nUsage:");
    console.error("  pnpm exec dotenv -e .env -- tsx scripts/import-energov-manual-data.ts <csv-file-path>");
    console.error("\nExample:");
    console.error("  pnpm exec dotenv -e .env -- tsx scripts/import-energov-manual-data.ts ../../data/energov-manual-data-2025-11-26.csv");
    process.exit(1);
  }

  const csvFilePath = args[0];

  try {
    await importData(csvFilePath);
    console.log("\n✅ Import complete!");
  } catch (error) {
    console.error("\n❌ Import failed:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();


/**
 * Sync data from development database to production database
 * 
 * Usage:
 *   DATABASE_URL=<dev-db-url> PROD_DATABASE_URL=<prod-db-url> pnpm sync-dev-to-prod [--dry-run] [--tables=permits,permitContractors]
 * 
 * Options:
 *   --dry-run: Show what would be synced without actually syncing
 *   --tables: Comma-separated list of tables to sync (default: permits,permitContractors)
 * 
 * Environment Variables:
 *   DATABASE_URL: Development database connection string
 *   PROD_DATABASE_URL: Production database connection string
 */

import { PrismaClient } from "@prisma/client";

const devDbUrl = process.env.DATABASE_URL;
const prodDbUrl = process.env.PROD_DATABASE_URL;

if (!devDbUrl || !devDbUrl.startsWith("postgresql://")) {
  console.error("❌ Error: DATABASE_URL must be set to development PostgreSQL connection string");
  process.exit(1);
}

if (!prodDbUrl || !prodDbUrl.startsWith("postgresql://")) {
  console.error("❌ Error: PROD_DATABASE_URL must be set to production PostgreSQL connection string");
  process.exit(1);
}

const args = process.argv.slice(2);
const isDryRun = args.includes("--dry-run");
const tablesArg = args.find(arg => arg.startsWith("--tables="));
const tablesToSync = tablesArg 
  ? tablesArg.split("=")[1].split(",").map(t => t.trim())
  : ["permits", "permitContractors"]; // Default: only permits and permit-contractor links

const devPrisma = new PrismaClient({
  datasources: {
    db: {
      url: devDbUrl,
    },
  },
});

const prodPrisma = new PrismaClient({
  datasources: {
    db: {
      url: prodDbUrl,
    },
  },
});

interface SyncStats {
  contractors: { created: number; updated: number; skipped: number };
  permits: { created: number; updated: number; skipped: number };
  permitContractors: { created: number; skipped: number };
}

async function syncContractors(dryRun: boolean): Promise<SyncStats["contractors"]> {
  console.log("\n📦 Syncing Contractors...");
  
  const devContractors = await devPrisma.contractor.findMany({
    include: {
      classifications: true,
    },
  });

  const stats = { created: 0, updated: 0, skipped: 0 };

  for (const contractor of devContractors) {
    const existing = await prodPrisma.contractor.findUnique({
      where: { licenseNo: contractor.licenseNo },
    });

    if (existing) {
      // Check if update is needed
      const needsUpdate = 
        existing.name !== contractor.name ||
        existing.mailingAddress !== contractor.mailingAddress ||
        existing.city !== contractor.city ||
        existing.state !== contractor.state ||
        existing.zipCode !== contractor.zipCode ||
        existing.phone !== contractor.phone;

      if (needsUpdate) {
        if (dryRun) {
          console.log(`  🔄 Would update: ${contractor.licenseNo} - ${contractor.name}`);
          stats.updated++;
        } else {
          await prodPrisma.contractor.update({
            where: { licenseNo: contractor.licenseNo },
            data: {
              name: contractor.name,
              mailingAddress: contractor.mailingAddress,
              city: contractor.city,
              state: contractor.state,
              zipCode: contractor.zipCode,
              phone: contractor.phone,
              businessType: contractor.businessType,
              issueDate: contractor.issueDate,
              updatedAt: new Date(),
            },
          });
          console.log(`  ✅ Updated: ${contractor.licenseNo} - ${contractor.name}`);
          stats.updated++;
        }
      } else {
        stats.skipped++;
      }
    } else {
      if (dryRun) {
        console.log(`  ➕ Would create: ${contractor.licenseNo} - ${contractor.name}`);
        stats.created++;
      } else {
        await prodPrisma.contractor.create({
          data: {
            licenseNo: contractor.licenseNo,
            name: contractor.name,
            mailingAddress: contractor.mailingAddress,
            city: contractor.city,
            county: contractor.county,
            state: contractor.state,
            zipCode: contractor.zipCode,
            phone: contractor.phone,
            businessType: contractor.businessType,
            issueDate: contractor.issueDate,
            createdAt: contractor.createdAt,
            updatedAt: new Date(),
          },
        });
        console.log(`  ✅ Created: ${contractor.licenseNo} - ${contractor.name}`);
        stats.created++;
      }
    }

    // Sync classifications
    if (!dryRun && contractor.classifications.length > 0) {
      for (const classification of contractor.classifications) {
        await prodPrisma.contractorClassification.upsert({
          where: {
            contractorId_classification: {
              contractorId: contractor.id,
              classification: classification.classification,
            },
          },
          create: {
            contractorId: contractor.id,
            classification: classification.classification,
          },
          update: {},
        });
      }
    }
  }

  return stats;
}

async function syncPermits(dryRun: boolean): Promise<SyncStats["permits"]> {
  console.log("\n📦 Syncing Permits...");
  
  const devPermits = await devPrisma.permit.findMany();
  const stats = { created: 0, updated: 0, skipped: 0 };
  const cityCounts = new Map<string, number>(); // Track new permits by city (for dry-run summary)

  for (const permit of devPermits) {
    const existing = await prodPrisma.permit.findUnique({
      where: { permitNumber: permit.permitNumber },
    });

    if (existing) {
      // Check if update is needed
      const needsUpdate = 
        existing.title !== permit.title ||
        existing.address !== permit.address ||
        existing.status !== permit.status ||
        existing.value !== permit.value ||
        existing.appliedDateString !== permit.appliedDateString;

      if (needsUpdate) {
        if (dryRun) {
          console.log(`  🔄 Would update: ${permit.permitNumber}`);
          stats.updated++;
        } else {
          await prodPrisma.permit.update({
            where: { permitNumber: permit.permitNumber },
            data: {
              title: permit.title,
              description: permit.description,
              address: permit.address,
              city: permit.city,
              state: permit.state,
              zipCode: permit.zipCode,
              propertyType: permit.propertyType,
              permitType: permit.permitType,
              status: permit.status,
              value: permit.value,
              appliedDate: permit.appliedDate,
              appliedDateString: permit.appliedDateString,
              expirationDate: permit.expirationDate,
              sourceUrl: permit.sourceUrl,
              scrapedAt: permit.scrapedAt,
              updatedAt: new Date(),
            },
          });
          console.log(`  ✅ Updated: ${permit.permitNumber}`);
          stats.updated++;
        }
      } else {
        stats.skipped++;
      }
    } else {
      if (dryRun) {
        console.log(`  ➕ Would create: ${permit.permitNumber} - ${permit.address}`);
        stats.created++;
        // Track by city for summary
        const city = permit.city || "UNKNOWN";
        cityCounts.set(city, (cityCounts.get(city) || 0) + 1);
      } else {
        await prodPrisma.permit.create({
          data: {
            permitNumber: permit.permitNumber,
            title: permit.title,
            description: permit.description,
            address: permit.address,
            city: permit.city,
            state: permit.state,
            zipCode: permit.zipCode,
            propertyType: permit.propertyType,
            permitType: permit.permitType,
            status: permit.status,
            value: permit.value,
            appliedDate: permit.appliedDate,
            appliedDateString: permit.appliedDateString,
            expirationDate: permit.expirationDate,
            sourceUrl: permit.sourceUrl,
            scrapedAt: permit.scrapedAt,
            createdAt: permit.createdAt,
            updatedAt: new Date(),
          },
        });
        console.log(`  ✅ Created: ${permit.permitNumber}`);
        stats.created++;
      }
    }
  }

  // Show city breakdown in dry-run
  if (dryRun && cityCounts.size > 0) {
    console.log("\n📊 New Permits by City:");
    const sortedCities = Array.from(cityCounts.entries()).sort((a, b) => b[1] - a[1]);
    for (const [city, count] of sortedCities) {
      console.log(`  ${city}: ${count}`);
    }
  }

  return stats;
}

async function syncPermitContractors(dryRun: boolean): Promise<SyncStats["permitContractors"]> {
  console.log("\n📦 Syncing Permit-Contractor Links...");
  
  const devLinks = await devPrisma.permitContractor.findMany({
    include: {
      permit: { select: { permitNumber: true } },
      contractor: { select: { licenseNo: true } },
    },
  });

  const stats = { created: 0, skipped: 0 };

  for (const link of devLinks) {
    // Find permit and contractor IDs in prod DB
    const prodPermit = await prodPrisma.permit.findUnique({
      where: { permitNumber: link.permit.permitNumber },
    });
    const prodContractor = await prodPrisma.contractor.findUnique({
      where: { licenseNo: link.contractor.licenseNo },
    });

    if (!prodPermit || !prodContractor) {
      if (dryRun) {
        console.log(`  ⚠️  Would skip link: Permit or contractor not found in prod (${link.permit.permitNumber} <-> ${link.contractor.licenseNo})`);
      }
      stats.skipped++;
      continue;
    }

    const existing = await prodPrisma.permitContractor.findUnique({
      where: {
        permitId_contractorId: {
          permitId: prodPermit.id,
          contractorId: prodContractor.id,
        },
      },
    });

    if (!existing) {
      if (dryRun) {
        console.log(`  ➕ Would create link: ${link.permit.permitNumber} <-> ${link.contractor.licenseNo}`);
        stats.created++;
      } else {
        await prodPrisma.permitContractor.create({
          data: {
            permitId: prodPermit.id,
            contractorId: prodContractor.id,
            role: link.role,
          },
        });
        console.log(`  ✅ Created link: ${link.permit.permitNumber} <-> ${link.contractor.licenseNo}`);
        stats.created++;
      }
    } else {
      stats.skipped++;
    }
  }

  return stats;
}

async function showDiff() {
  console.log("\n📊 Database Comparison:");
  
  const devCounts = {
    permits: await devPrisma.permit.count(),
    permitContractors: await devPrisma.permitContractor.count(),
  };

  const prodCounts = {
    permits: await prodPrisma.permit.count(),
    permitContractors: await prodPrisma.permitContractor.count(),
  };

  console.log("\n  Dev DB:");
  console.log(`    Permits: ${devCounts.permits}`);
  console.log(`    Permit-Contractor Links: ${devCounts.permitContractors}`);

  console.log("\n  Prod DB:");
  console.log(`    Permits: ${prodCounts.permits}`);
  console.log(`    Permit-Contractor Links: ${prodCounts.permitContractors}`);

  console.log("\n  Diff:");
  console.log(`    Permits: ${devCounts.permits - prodCounts.permits > 0 ? '+' : ''}${devCounts.permits - prodCounts.permits}`);
  console.log(`    Permit-Contractor Links: ${devCounts.permitContractors - prodCounts.permitContractors > 0 ? '+' : ''}${devCounts.permitContractors - prodCounts.permitContractors}`);
}

async function main() {
  console.log("🔄 Dev → Prod Sync Tool\n");
  console.log(`Mode: ${isDryRun ? "🔍 DRY RUN (no changes will be made)" : "✅ LIVE SYNC"}`);
  console.log(`Tables to sync: ${tablesToSync.join(", ")}\n`);

  try {
    await devPrisma.$connect();
    await prodPrisma.$connect();
    console.log("✅ Connected to both databases\n");

    // Show diff first
    await showDiff();

    const stats: SyncStats = {
      contractors: { created: 0, updated: 0, skipped: 0 },
      permits: { created: 0, updated: 0, skipped: 0 },
      permitContractors: { created: 0, skipped: 0 },
    };

    if (tablesToSync.includes("contractors")) {
      stats.contractors = await syncContractors(isDryRun);
    }

    if (tablesToSync.includes("permits")) {
      stats.permits = await syncPermits(isDryRun);
    }

    if (tablesToSync.includes("permitContractors")) {
      stats.permitContractors = await syncPermitContractors(isDryRun);
    }

    // Summary
    console.log("\n\n📊 Sync Summary:");
    
    if (tablesToSync.includes("contractors")) {
      console.log("\n  Contractors:");
      console.log(`    Created: ${stats.contractors.created}`);
      console.log(`    Updated: ${stats.contractors.updated}`);
      console.log(`    Skipped: ${stats.contractors.skipped}`);
    }

    if (tablesToSync.includes("permits")) {
      console.log("\n  Permits:");
      console.log(`    Created: ${stats.permits.created}`);
      console.log(`    Updated: ${stats.permits.updated}`);
      console.log(`    Skipped: ${stats.permits.skipped}`);
    }

    if (tablesToSync.includes("permitContractors")) {
      console.log("\n  Permit-Contractor Links:");
      console.log(`    Created: ${stats.permitContractors.created}`);
      console.log(`    Skipped: ${stats.permitContractors.skipped}`);
    }

    if (isDryRun) {
      console.log("\n⚠️  This was a DRY RUN. No changes were made.");
      console.log("   Run without --dry-run to actually sync.");
    } else {
      console.log("\n✅ Sync complete!");
    }
  } catch (error: any) {
    console.error("❌ Sync failed:", error);
    throw error;
  } finally {
    await devPrisma.$disconnect();
    await prodPrisma.$disconnect();
  }
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});


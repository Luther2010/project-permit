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
  
  console.log("  📥 Fetching contractors from dev database...");
  const devContractors = await devPrisma.contractor.findMany({
    include: {
      classifications: true,
    },
  });

  console.log("  📥 Fetching contractors from prod database...");
  const prodContractors = await prodPrisma.contractor.findMany({
    select: {
      id: true,
      licenseNo: true,
      name: true,
      mailingAddress: true,
      city: true,
      state: true,
      zipCode: true,
      phone: true,
    },
  });

  // Create Maps for O(1) lookup
  const prodContractorsMap = new Map(
    prodContractors.map(c => [c.licenseNo, c])
  );
  const prodContractorIdMap = new Map(
    prodContractors.map(c => [c.licenseNo, c.id])
  );

  const stats = { created: 0, updated: 0, skipped: 0 };

  for (const contractor of devContractors) {
    const existing = prodContractorsMap.get(contractor.licenseNo);

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
          const newContractor = await prodPrisma.contractor.create({
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
          // Update map so classifications can be synced
          prodContractorIdMap.set(contractor.licenseNo, newContractor.id);
          console.log(`  ✅ Created: ${contractor.licenseNo} - ${contractor.name}`);
          stats.created++;
        }
      }

    // Sync classifications
    if (!dryRun && contractor.classifications.length > 0) {
      // Get prod contractor ID (either existing or newly created)
      const prodContractorId = prodContractorIdMap.get(contractor.licenseNo);
      if (prodContractorId) {
        for (const classification of contractor.classifications) {
          await prodPrisma.contractorClassification.upsert({
            where: {
              contractorId_classification: {
                contractorId: prodContractorId,
                classification: classification.classification,
              },
            },
            create: {
              contractorId: prodContractorId,
              classification: classification.classification,
            },
            update: {},
          });
        }
      }
    }
  }

  return stats;
}

async function syncPermits(dryRun: boolean): Promise<SyncStats["permits"]> {
  console.log("\n📦 Syncing Permits...");
  
  // Fetch all permits from both databases upfront
  console.log("  📥 Fetching permits from dev database...");
  const devPermits = await devPrisma.permit.findMany();
  
  console.log("  📥 Fetching permits from prod database...");
  const prodPermits = await prodPrisma.permit.findMany({
    select: {
      permitNumber: true,
      city: true,
      title: true,
      address: true,
      status: true,
      value: true,
      appliedDateString: true,
    },
  });

  // Create a Map for O(1) lookup using composite key (permitNumber + city)
  const prodPermitsMap = new Map(
    prodPermits.map(p => [`${p.permitNumber}|${p.city}`, p])
  );

  const stats = { created: 0, updated: 0, skipped: 0 };
  const cityCounts = new Map<string, number>(); // Track new permits by city (for dry-run summary)

  for (const permit of devPermits) {
    // Skip permits without a city (can't use composite key)
    if (!permit.city) {
      console.log(`  ⚠️  Skipping permit ${permit.permitNumber}: city is null`);
      stats.skipped++;
      continue;
    }

    const compositeKey = `${permit.permitNumber}|${permit.city}`;
    const existing = prodPermitsMap.get(compositeKey);

    if (existing) {
      // Check if update is needed
      const needsUpdate = 
        existing.title !== permit.title ||
        existing.address !== permit.address ||
        existing.status !== permit.status ||
        existing.value !== permit.value ||
        existing.appliedDateString !== permit.appliedDateString;

      if (needsUpdate) {
        // Determine which fields changed
        const changes: string[] = [];
        if (existing.title !== permit.title) {
          changes.push(`title: "${existing.title}" → "${permit.title}"`);
        }
        if (existing.address !== permit.address) {
          changes.push(`address: "${existing.address}" → "${permit.address}"`);
        }
        if (existing.status !== permit.status) {
          changes.push(`status: "${existing.status}" → "${permit.status}"`);
        }
        if (existing.value !== permit.value) {
          changes.push(`value: ${existing.value} → ${permit.value}`);
        }
        if (existing.appliedDateString !== permit.appliedDateString) {
          changes.push(`appliedDateString: "${existing.appliedDateString}" → "${permit.appliedDateString}"`);
        }

        if (dryRun) {
          console.log(`  🔄 Would update: ${permit.permitNumber}`);
          if (changes.length > 0) {
            changes.forEach(change => console.log(`     ${change}`));
          }
          stats.updated++;
        } else {
          await prodPrisma.permit.update({
            where: { 
              permitNumber_city: {
                permitNumber: permit.permitNumber,
                city: permit.city,
              }
            },
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
      // Check if permit with same number exists in prod (different city scenario)
      const existingPermitWithSameNumber = await prodPrisma.permit.findFirst({
        where: { permitNumber: permit.permitNumber },
        select: { permitNumber: true, city: true },
      });

      if (existingPermitWithSameNumber && existingPermitWithSameNumber.city !== permit.city) {
        // Permit exists with same number but different city - skip it
        console.log(`  ⚠️  Skipping ${permit.permitNumber}: exists in prod with city ${existingPermitWithSameNumber.city}, dev has city ${permit.city}`);
        stats.skipped++;
        continue;
      }

      if (dryRun) {
        console.log(`  ➕ Would create: ${permit.permitNumber} - ${permit.address}`);
        stats.created++;
        // Track by city for summary
        const city = permit.city || "UNKNOWN";
        cityCounts.set(city, (cityCounts.get(city) || 0) + 1);
      } else {
        try {
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
        } catch (error: unknown) {
          if (error && typeof error === 'object' && 'code' in error && error.code === 'P2002') {
            // Check if permit exists with same number but different city
            const existingPermit = await prodPrisma.permit.findFirst({
              where: { permitNumber: permit.permitNumber },
              select: { permitNumber: true, city: true },
            });
            console.error(`  ❌ Failed to create ${permit.permitNumber} (city: ${permit.city}):`);
            console.error(`     Existing permit in prod: ${existingPermit ? `${existingPermit.permitNumber} (city: ${existingPermit.city})` : 'not found'}`);
            throw error;
          }
          throw error;
        }
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
  
  console.log("  📥 Fetching links from dev database...");
  const devLinks = await devPrisma.permitContractor.findMany({
    include: {
      permit: { select: { permitNumber: true, city: true } },
      contractor: { select: { licenseNo: true } },
    },
  });

  // Fetch all prod permits and contractors upfront
  console.log("  📥 Fetching permits and contractors from prod database...");
  const [prodPermits, prodContractors, prodLinks] = await Promise.all([
    prodPrisma.permit.findMany({
      select: { id: true, permitNumber: true, city: true },
    }),
    prodPrisma.contractor.findMany({
      select: { id: true, licenseNo: true },
    }),
    prodPrisma.permitContractor.findMany({
      select: {
        permitId: true,
        contractorId: true,
      },
    }),
  ]);

  // Create Maps for O(1) lookup using composite key (permitNumber + city)
  const prodPermitsMap = new Map(
    prodPermits.map(p => [`${p.permitNumber}|${p.city}`, p.id])
  );
  const prodContractorsMap = new Map(
    prodContractors.map(c => [c.licenseNo, c.id])
  );
  const prodLinksSet = new Set(
    prodLinks.map(l => `${l.permitId}_${l.contractorId}`)
  );

  const stats = { created: 0, skipped: 0 };

  for (const link of devLinks) {
    // Look up permit and contractor IDs in prod DB using composite key
    const permitCompositeKey = `${link.permit.permitNumber}|${link.permit.city}`;
    const prodPermitId = prodPermitsMap.get(permitCompositeKey);
    const prodContractorId = prodContractorsMap.get(link.contractor.licenseNo);

    if (!prodPermitId || !prodContractorId) {
      if (dryRun) {
        console.log(`  ⚠️  Would skip link: Permit or contractor not found in prod (${link.permit.permitNumber} <-> ${link.contractor.licenseNo})`);
      }
      stats.skipped++;
      continue;
    }

    const linkKey = `${prodPermitId}_${prodContractorId}`;
    if (prodLinksSet.has(linkKey)) {
      stats.skipped++;
      continue;
    }

    if (dryRun) {
      console.log(`  ➕ Would create link: ${link.permit.permitNumber} <-> ${link.contractor.licenseNo}`);
      stats.created++;
    } else {
      await prodPrisma.permitContractor.create({
        data: {
          permitId: prodPermitId,
          contractorId: prodContractorId,
          role: link.role,
        },
      });
      console.log(`  ✅ Created link: ${link.permit.permitNumber} <-> ${link.contractor.licenseNo}`);
      stats.created++;
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
  } catch (error: unknown) {
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


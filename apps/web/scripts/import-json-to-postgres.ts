/**
 * Step 2: Import JSON data to PostgreSQL
 * 
 * Steps:
 *   1. Make sure DATABASE_URL is set to your PostgreSQL connection string
 *   2. Make sure sqlite-export.json exists (from export-sqlite step)
 *   3. Run: pnpm import-postgres
 */

import { PrismaClient } from "@prisma/client";
import * as fs from "fs";
import * as path from "path";

const inputFile = path.join(process.cwd(), "sqlite-export.json");
const newDbUrl = process.env.DATABASE_URL;

if (!newDbUrl || !newDbUrl.startsWith("postgresql://")) {
  console.error("❌ Error: DATABASE_URL must be set to a PostgreSQL connection string");
  process.exit(1);
}

if (!fs.existsSync(inputFile)) {
  console.error(`❌ Error: Export file not found at ${inputFile}`);
  console.error("   Run 'pnpm export-sqlite' first");
  process.exit(1);
}

const postgresPrisma = new PrismaClient({
  datasources: {
    db: {
      url: newDbUrl,
    },
  },
});

async function importData() {
  console.log("📥 Importing JSON data to PostgreSQL...\n");

  try {
    await postgresPrisma.$connect();
    console.log("✅ Connected to PostgreSQL database\n");

    const data = JSON.parse(fs.readFileSync(inputFile, "utf-8"));

    // Check if PostgreSQL is empty
    const permitCount = await postgresPrisma.permit.count();
    if (permitCount > 0) {
      console.log("⚠️  Warning: PostgreSQL database already has data!");
      console.log(`   Found ${permitCount} permits in PostgreSQL`);
      console.log("   This script will add to existing data (may create duplicates)\n");
    }

    // 1. Migrate Contractors
    console.log("📦 Migrating Contractors...");
    let contractorsMigrated = 0;
    for (const contractor of data.contractors) {
      try {
        await postgresPrisma.contractor.upsert({
          where: { licenseNo: contractor.licenseNo },
          create: {
            licenseNo: contractor.licenseNo,
            name: contractor.name,
            mailingAddress: contractor.mailingAddress,
            city: contractor.city,
            county: contractor.county,
            state: contractor.state,
            zipCode: contractor.zipCode,
            phone: contractor.phone,
            businessType: contractor.businessType,
            issueDate: contractor.issueDate ? new Date(contractor.issueDate) : null,
            createdAt: new Date(contractor.createdAt),
            updatedAt: new Date(contractor.updatedAt),
          },
          update: {
            name: contractor.name,
            mailingAddress: contractor.mailingAddress,
            city: contractor.city,
            county: contractor.county,
            state: contractor.state,
            zipCode: contractor.zipCode,
            phone: contractor.phone,
            businessType: contractor.businessType,
            issueDate: contractor.issueDate ? new Date(contractor.issueDate) : null,
            updatedAt: new Date(contractor.updatedAt),
          },
        });

        // Migrate classifications
        for (const classification of contractor.classifications || []) {
          const postgresContractor = await postgresPrisma.contractor.findUnique({
            where: { licenseNo: contractor.licenseNo },
          });
          
          if (postgresContractor) {
            await postgresPrisma.contractorClassification.upsert({
              where: {
                contractorId_classification: {
                  contractorId: postgresContractor.id,
                  classification: classification.classification,
                },
              },
              create: {
                contractorId: postgresContractor.id,
                classification: classification.classification,
              },
              update: {},
            });
          }
        }

        contractorsMigrated++;
      } catch (error: any) {
        console.error(`   ❌ Error migrating contractor ${contractor.licenseNo}:`, error.message);
      }
    }
    console.log(`   ✅ Migrated ${contractorsMigrated}/${data.contractors.length} contractors\n`);

    // 2. Migrate Users
    console.log("👤 Migrating Users...");
    let usersMigrated = 0;
    for (const user of data.users) {
      try {
        await postgresPrisma.user.upsert({
          where: { email: user.email },
          create: {
            id: user.id,
            email: user.email,
            name: user.name,
            emailVerified: user.emailVerified ? new Date(user.emailVerified) : null,
            image: user.image,
            createdAt: new Date(user.createdAt),
            updatedAt: new Date(user.updatedAt),
          },
          update: {
            name: user.name,
            emailVerified: user.emailVerified ? new Date(user.emailVerified) : null,
            image: user.image,
            updatedAt: new Date(user.updatedAt),
          },
        });

        // Migrate accounts
        for (const account of user.accounts || []) {
          await postgresPrisma.account.upsert({
            where: {
              provider_providerAccountId: {
                provider: account.provider,
                providerAccountId: account.providerAccountId,
              },
            },
            create: {
              id: account.id,
              userId: user.id,
              type: account.type,
              provider: account.provider,
              providerAccountId: account.providerAccountId,
              refresh_token: account.refresh_token,
              access_token: account.access_token,
              expires_at: account.expires_at,
              token_type: account.token_type,
              scope: account.scope,
              id_token: account.id_token,
              session_state: account.session_state,
            },
            update: {
              refresh_token: account.refresh_token,
              access_token: account.access_token,
              expires_at: account.expires_at,
              token_type: account.token_type,
              scope: account.scope,
              id_token: account.id_token,
              session_state: account.session_state,
            },
          });
        }

        // Migrate subscription
        if (user.subscription) {
          await postgresPrisma.subscription.upsert({
            where: { userId: user.id },
            create: {
              id: user.subscription.id,
              userId: user.id,
              plan: user.subscription.plan,
              validUntil: user.subscription.validUntil ? new Date(user.subscription.validUntil) : null,
              createdAt: new Date(user.subscription.createdAt),
              updatedAt: new Date(user.subscription.updatedAt),
            },
            update: {
              plan: user.subscription.plan,
              validUntil: user.subscription.validUntil ? new Date(user.subscription.validUntil) : null,
              updatedAt: new Date(user.subscription.updatedAt),
            },
          });
        }

        usersMigrated++;
      } catch (error: any) {
        console.error(`   ❌ Error migrating user ${user.email}:`, error.message);
      }
    }
    console.log(`   ✅ Migrated ${usersMigrated}/${data.users.length} users\n`);

    // 3. Migrate Permits
    console.log("📋 Migrating Permits...");
    let permitsMigrated = 0;
    for (const permit of data.permits) {
      try {
        await postgresPrisma.permit.upsert({
          where: { permitNumber: permit.permitNumber },
          create: {
            id: permit.id,
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
            appliedDate: permit.appliedDate ? new Date(permit.appliedDate) : null,
            appliedDateString: permit.appliedDateString,
            expirationDate: permit.expirationDate ? new Date(permit.expirationDate) : null,
            sourceUrl: permit.sourceUrl,
            scrapedAt: new Date(permit.scrapedAt),
            createdAt: new Date(permit.createdAt),
            updatedAt: new Date(permit.updatedAt),
          },
          update: {
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
            appliedDate: permit.appliedDate ? new Date(permit.appliedDate) : null,
            appliedDateString: permit.appliedDateString,
            expirationDate: permit.expirationDate ? new Date(permit.expirationDate) : null,
            sourceUrl: permit.sourceUrl,
            scrapedAt: new Date(permit.scrapedAt),
            updatedAt: new Date(permit.updatedAt),
          },
        });

        // Migrate permit-contractor links
        for (const link of permit.contractors || []) {
          const postgresPermit = await postgresPrisma.permit.findUnique({
            where: { permitNumber: permit.permitNumber },
          });
          const postgresContractor = await postgresPrisma.contractor.findUnique({
            where: { licenseNo: link.contractor.licenseNo },
          });

          if (postgresPermit && postgresContractor) {
            await postgresPrisma.permitContractor.upsert({
              where: {
                permitId_contractorId: {
                  permitId: postgresPermit.id,
                  contractorId: postgresContractor.id,
                },
              },
              create: {
                permitId: postgresPermit.id,
                contractorId: postgresContractor.id,
                role: link.role,
              },
              update: {
                role: link.role,
              },
            });
          }
        }

        permitsMigrated++;
      } catch (error: any) {
        console.error(`   ❌ Error migrating permit ${permit.permitNumber}:`, error.message);
      }
    }
    console.log(`   ✅ Migrated ${permitsMigrated}/${data.permits.length} permits\n`);

    // Summary
    console.log("📊 Migration Summary:");
    console.log(`   - Contractors: ${contractorsMigrated}/${data.contractors.length}`);
    console.log(`   - Users: ${usersMigrated}/${data.users.length}`);
    console.log(`   - Permits: ${permitsMigrated}/${data.permits.length}`);
    console.log("\n✅ Migration complete!");
  } catch (error) {
    console.error("❌ Import failed:", error);
    throw error;
  } finally {
    await postgresPrisma.$disconnect();
  }
}

importData().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});


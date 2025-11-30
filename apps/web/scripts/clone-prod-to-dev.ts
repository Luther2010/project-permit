/**
 * Clone all data from production database to development database
 * 
 * Usage:
 *   DATABASE_URL=<dev-db-url> PROD_DATABASE_URL=<prod-db-url> pnpm clone-prod-to-dev
 * 
 * This will copy all data from prod to dev:
 * - Contractors (with classifications)
 * - Permits
 * - Permit-Contractor Links
 * - Users (with accounts and subscriptions)
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

async function cloneData() {
  console.log("🔄 Cloning data from production to development database...\n");

  try {
    await devPrisma.$connect();
    await prodPrisma.$connect();
    console.log("✅ Connected to both databases\n");

    // Check if dev DB already has data
    const devPermitCount = await devPrisma.permit.count();
    if (devPermitCount > 0) {
      console.log(`⚠️  Warning: Development database already has ${devPermitCount} permits.`);
      console.log("   This will add to existing data (may create duplicates).\n");
    }

    // 1. Clone Contractors
    console.log("📦 Cloning Contractors...");
    const prodContractors = await prodPrisma.contractor.findMany({
      include: {
        classifications: true,
      },
    });

    let contractorsCloned = 0;
    for (const contractor of prodContractors) {
      try {
        const devContractor = await devPrisma.contractor.upsert({
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
            issueDate: contractor.issueDate,
            createdAt: contractor.createdAt,
            updatedAt: contractor.updatedAt,
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
            issueDate: contractor.issueDate,
            updatedAt: contractor.updatedAt,
          },
        });

        // Clone classifications using the dev contractor's ID
        for (const classification of contractor.classifications) {
          await devPrisma.contractorClassification.upsert({
            where: {
              contractorId_classification: {
                contractorId: devContractor.id,
                classification: classification.classification,
              },
            },
            create: {
              contractorId: devContractor.id,
              classification: classification.classification,
            },
            update: {},
          });
        }

        contractorsCloned++;
        if (contractorsCloned % 1000 === 0) {
          console.log(`   Cloned ${contractorsCloned}/${prodContractors.length} contractors...`);
        }
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`   ❌ Error cloning contractor ${contractor.licenseNo}:`, message);
      }
    }
    console.log(`✅ Cloned ${contractorsCloned}/${prodContractors.length} contractors\n`);

    // 2. Clone Permits
    console.log("📦 Cloning Permits...");
    const prodPermits = await prodPrisma.permit.findMany();
    
    let permitsCloned = 0;
    for (const permit of prodPermits) {
      // Skip permits without a city (can't use composite key)
      if (!permit.city) {
        console.log(`  ⚠️  Skipping permit ${permit.permitNumber}: city is null`);
        continue;
      }

      try {
        await devPrisma.permit.upsert({
          where: {
            permitNumber_city: {
              permitNumber: permit.permitNumber,
              city: permit.city,
            }
          },
          create: {
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
            updatedAt: permit.updatedAt,
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
            appliedDate: permit.appliedDate,
            appliedDateString: permit.appliedDateString,
            expirationDate: permit.expirationDate,
            sourceUrl: permit.sourceUrl,
            scrapedAt: permit.scrapedAt,
            updatedAt: permit.updatedAt,
          },
        });
        permitsCloned++;
        if (permitsCloned % 100 === 0) {
          console.log(`   Cloned ${permitsCloned}/${prodPermits.length} permits...`);
        }
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`   ❌ Error cloning permit ${permit.permitNumber}:`, message);
      }
    }
    console.log(`✅ Cloned ${permitsCloned}/${prodPermits.length} permits\n`);

    // 3. Clone Permit-Contractor Links
    console.log("📦 Cloning Permit-Contractor Links...");
    const prodLinks = await prodPrisma.permitContractor.findMany({
      include: {
        permit: { select: { permitNumber: true, city: true } },
        contractor: { select: { licenseNo: true } },
      },
    });

    let linksCloned = 0;
    for (const link of prodLinks) {
      // Skip if permit has no city
      if (!link.permit.city) {
        console.log(`   ⚠️  Skipping link: Permit ${link.permit.permitNumber} has no city`);
        continue;
      }

      try {
        // Find permit and contractor IDs in dev DB
        const devPermit = await devPrisma.permit.findUnique({
          where: {
            permitNumber_city: {
              permitNumber: link.permit.permitNumber,
              city: link.permit.city,
            }
          },
        });
        const devContractor = await devPrisma.contractor.findUnique({
          where: { licenseNo: link.contractor.licenseNo },
        });

        if (!devPermit || !devContractor) {
          console.log(`   ⚠️  Skipping link: Permit or contractor not found in dev (${link.permit.permitNumber} <-> ${link.contractor.licenseNo})`);
          continue;
        }

        await devPrisma.permitContractor.upsert({
          where: {
            permitId_contractorId: {
              permitId: devPermit.id,
              contractorId: devContractor.id,
            },
          },
          create: {
            permitId: devPermit.id,
            contractorId: devContractor.id,
            role: link.role,
          },
          update: {
            role: link.role,
          },
        });
        linksCloned++;
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`   ❌ Error cloning link:`, message);
      }
    }
    console.log(`✅ Cloned ${linksCloned}/${prodLinks.length} permit-contractor links\n`);

    // 4. Clone Users
    console.log("👤 Cloning Users...");
    const prodUsers = await prodPrisma.user.findMany({
      include: {
        accounts: true,
        subscription: true,
      },
    });

    let usersCloned = 0;
    for (const user of prodUsers) {
      try {
        await devPrisma.user.upsert({
          where: { email: user.email },
          create: {
            id: user.id,
            email: user.email,
            name: user.name,
            emailVerified: user.emailVerified,
            image: user.image,
            createdAt: user.createdAt,
            updatedAt: user.updatedAt,
          },
          update: {
            name: user.name,
            emailVerified: user.emailVerified,
            image: user.image,
            updatedAt: user.updatedAt,
          },
        });

        // Clone accounts
        for (const account of user.accounts) {
          await devPrisma.account.upsert({
            where: {
              provider_providerAccountId: {
                provider: account.provider,
                providerAccountId: account.providerAccountId,
              },
            },
            create: {
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

        // Clone subscription
        if (user.subscription) {
          await devPrisma.subscription.upsert({
            where: { userId: user.id },
            create: {
              userId: user.id,
              plan: user.subscription.plan,
              validUntil: user.subscription.validUntil,
              createdAt: user.subscription.createdAt,
              updatedAt: user.subscription.updatedAt,
            },
            update: {
              plan: user.subscription.plan,
              validUntil: user.subscription.validUntil,
              updatedAt: user.subscription.updatedAt,
            },
          });
        }

        usersCloned++;
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`   ❌ Error cloning user ${user.email}:`, message);
      }
    }
    console.log(`✅ Cloned ${usersCloned}/${prodUsers.length} users\n`);

    // Summary
    console.log("✅ Clone complete!");
    console.log(`   - Contractors: ${contractorsCloned}`);
    console.log(`   - Permits: ${permitsCloned}`);
    console.log(`   - Permit-Contractor Links: ${linksCloned}`);
    console.log(`   - Users: ${usersCloned}`);

  } catch (error: unknown) {
    console.error("❌ Clone failed:", error);
    throw error;
  } finally {
    await devPrisma.$disconnect();
    await prodPrisma.$disconnect();
  }
}

cloneData().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});


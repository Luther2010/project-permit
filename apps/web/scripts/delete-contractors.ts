#!/usr/bin/env tsx

import { prisma } from "../src/lib/db";

async function main() {
  console.log("Deleting all contractors...");
  
  // Delete in order due to foreign key constraints
  // First delete ContractorClassification records
  const deletedClassifications = await prisma.contractorClassification.deleteMany({});
  console.log(`Deleted ${deletedClassifications.count} contractor classifications`);
  
  // Then delete PermitContractor links
  const deletedLinks = await prisma.permitContractor.deleteMany({});
  console.log(`Deleted ${deletedLinks.count} permit-contractor links`);
  
  // Finally delete contractors
  const deletedContractors = await prisma.contractor.deleteMany({});
  console.log(`Deleted ${deletedContractors.count} contractors`);
  
  console.log("✅ All contractors deleted successfully");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });


import { prisma } from "../src/lib/db";
import { City } from "@prisma/client";

/**
 * Delete all permits for a specific city
 * Usage: pnpm tsx scripts/delete-city-permits.ts "Santa Clara"
 */

async function main() {
  const cityNameArg = process.argv[2];
  
  if (!cityNameArg) {
    console.error("Usage: pnpm tsx scripts/delete-city-permits.ts <city-name>");
    console.error("Example: pnpm tsx scripts/delete-city-permits.ts \"Santa Clara\"");
    process.exit(1);
  }

  // Map city name to City enum
  const cityMap: Record<string, City> = {
    "los gatos": City.LOS_GATOS,
    "saratoga": City.SARATOGA,
    "santa clara": City.SANTA_CLARA,
    "cupertino": City.CUPERTINO,
    "palo alto": City.PALO_ALTO,
    "los altos hills": City.LOS_ALTOS_HILLS,
    "sunnyvale": City.SUNNYVALE,
    "san jose": City.SAN_JOSE,
    "campbell": City.CAMPBELL,
    "mountain view": City.MOUNTAIN_VIEW,
    "gilroy": City.GILROY,
    "milpitas": City.MILPITAS,
    "morgan hill": City.MORGAN_HILL,
    "los altos": City.LOS_ALTOS,
  };

  const normalizedCityName = cityNameArg.toLowerCase().trim();
  const cityEnum = cityMap[normalizedCityName];

  if (!cityEnum) {
    console.error(`Error: City "${cityNameArg}" not found.`);
    console.error("Available cities:", Object.keys(cityMap).join(", "));
    process.exit(1);
  }

  console.log(`Deleting permits for ${cityNameArg} (${cityEnum})...`);

  // First, count how many permits exist
  const permitCount = await prisma.permit.count({
    where: { city: cityEnum },
  });

  if (permitCount === 0) {
    console.log("No permits found for this city.");
    return;
  }

  console.log(`Found ${permitCount} permits to delete`);

  // Delete permit-contractor links first (foreign key constraint)
  const deletedLinks = await prisma.permitContractor.deleteMany({
    where: {
      permit: {
        city: cityEnum,
      },
    },
  });
  console.log(`Deleted ${deletedLinks.count} permit-contractor links`);

  // Delete permits
  const deletedPermits = await prisma.permit.deleteMany({
    where: {
      city: cityEnum,
    },
  });

  console.log(`Deleted ${deletedPermits.count} permits`);
  console.log(`✅ ${cityNameArg} permits deleted successfully`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });


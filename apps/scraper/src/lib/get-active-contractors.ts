/**
 * Get contractors associated with permits in a date range
 * Used for targeted scraping by contractor license number
 */

import { prisma } from "./db";
import { City } from "@prisma/client";

export interface ActiveContractor {
  licenseNo: string;
  name: string | null;
  permitCount: number;
}

/**
 * Get all unique contractors that have permits in a date range
 * @param startDate - Start date for the range (inclusive)
 * @param endDate - End date for the range (inclusive)
 * @returns Array of contractors with their license numbers and permit counts
 */
export async function getActiveContractorsByDateRange(
  startDate: Date,
  endDate: Date
): Promise<ActiveContractor[]> {
  console.log(
    `[getActiveContractorsByDateRange] Fetching contractors with permits from ${startDate.toISOString()} to ${endDate.toISOString()}`
  );

  // Query permits in the date range and get their associated contractors
  const permitContractors = await prisma.permitContractor.findMany({
    where: {
      permit: {
        appliedDate: {
          gte: startDate,
          lte: endDate,
        },
      },
    },
    include: {
      contractor: {
        select: {
          licenseNo: true,
          name: true,
        },
      },
    },
    distinct: ["contractorId"],
  });

  // Count permits per contractor for the same period
  const contractorCounts = await prisma.permitContractor.groupBy({
    by: ["contractorId"],
    where: {
      permit: {
        appliedDate: {
          gte: startDate,
          lte: endDate,
        },
      },
    },
    _count: {
      permitId: true,
    },
  });

  // Create a map of contractorId -> permit count
  const countMap = new Map(
    contractorCounts.map((c) => [c.contractorId, c._count.permitId])
  );

  // Combine data
  const activeContractors: ActiveContractor[] = permitContractors.map((pc) => ({
    licenseNo: pc.contractor.licenseNo,
    name: pc.contractor.name,
    permitCount: countMap.get(pc.contractorId) || 0,
  }));

  console.log(
    `[getActiveContractorsByDateRange] Found ${activeContractors.length} active contractors`
  );

  return activeContractors;
}

/**
 * Get all unique contractors that have permits in the last N months
 * @param months - Number of months to look back (default: 12)
 * @returns Array of contractors with their license numbers and permit counts
 * @deprecated Use getActiveContractorsByDateRange instead for more precise control
 */
export async function getActiveContractors(
  months: number = 12
): Promise<ActiveContractor[]> {
  const cutoffDate = new Date();
  cutoffDate.setMonth(cutoffDate.getMonth() - months);
  const endDate = new Date();

  return getActiveContractorsByDateRange(cutoffDate, endDate);
}

/**
 * Map city name string to City enum
 */
function mapCityNameToEnum(cityName: string): City | null {
  const normalized = cityName.trim().toUpperCase().replace(/\s+/g, "_");
  const cityMap: Record<string, City> = {
    "LOS_GATOS": City.LOS_GATOS,
    "SARATOGA": City.SARATOGA,
    "SANTA_CLARA": City.SANTA_CLARA,
    "CUPERTINO": City.CUPERTINO,
    "PALO_ALTO": City.PALO_ALTO,
    "LOS_ALTOS_HILLS": City.LOS_ALTOS_HILLS,
    "SUNNYVALE": City.SUNNYVALE,
    "SAN_JOSE": City.SAN_JOSE,
    "CAMPBELL": City.CAMPBELL,
    "MOUNTAIN_VIEW": City.MOUNTAIN_VIEW,
    "GILROY": City.GILROY,
    "MILPITAS": City.MILPITAS,
    "MORGAN_HILL": City.MORGAN_HILL,
    "LOS_ALTOS": City.LOS_ALTOS,
  };
  return cityMap[normalized] || null;
}

/**
 * Get active contractors filtered by city and date range
 * @param startDate - Start date for the range (inclusive)
 * @param endDate - End date for the range (inclusive)
 * @param cities - Optional array of city name strings to filter by
 * @returns Array of contractors
 */
export async function getActiveContractorsByCityAndDateRange(
  startDate: Date,
  endDate: Date,
  cities?: string[]
): Promise<ActiveContractor[]> {
  const whereClause: any = {
    permit: {
      appliedDate: {
        gte: startDate,
        lte: endDate,
      },
    },
  };

  if (cities && cities.length > 0) {
    // Convert city name strings to City enum values
    const cityEnums = cities
      .map(mapCityNameToEnum)
      .filter((city): city is City => city !== null);
    
    if (cityEnums.length > 0) {
      whereClause.permit.city = { in: cityEnums };
    }
  }

  const permitContractors = await prisma.permitContractor.findMany({
    where: whereClause,
    include: {
      contractor: {
        select: {
          licenseNo: true,
          name: true,
        },
      },
    },
    distinct: ["contractorId"],
  });

  const contractorCounts = await prisma.permitContractor.groupBy({
    by: ["contractorId"],
    where: whereClause,
    _count: {
      permitId: true,
    },
  });

  const countMap = new Map(
    contractorCounts.map((c) => [c.contractorId, c._count.permitId])
  );

  const activeContractors: ActiveContractor[] = permitContractors.map((pc) => ({
    licenseNo: pc.contractor.licenseNo,
    name: pc.contractor.name,
    permitCount: countMap.get(pc.contractorId) || 0,
  }));

  console.log(
    `[getActiveContractorsByCityAndDateRange] Found ${activeContractors.length} active contractors${cities ? ` in cities: ${cities.join(", ")}` : ""} from ${startDate.toISOString()} to ${endDate.toISOString()}`
  );

  return activeContractors;
}

/**
 * Get active contractors filtered by city (if permits are in specific cities)
 * @param months - Number of months to look back
 * @param cities - Optional array of cities to filter by
 * @returns Array of contractors
 * @deprecated Use getActiveContractorsByCityAndDateRange instead for more precise control
 */
export async function getActiveContractorsByCity(
  months: number = 12,
  cities?: string[]
): Promise<ActiveContractor[]> {
  const cutoffDate = new Date();
  cutoffDate.setMonth(cutoffDate.getMonth() - months);
  const endDate = new Date();

  return getActiveContractorsByCityAndDateRange(cutoffDate, endDate, cities);
}


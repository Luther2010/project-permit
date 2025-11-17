/**
 * San Jose City-Specific Classifier
 * 
 * Uses SUBTYPEDESCRIPTION field from San Jose API to directly map to PropertyType
 */

import { PropertyType } from "@prisma/client";
import { PermitData } from "../permit-classification";
import { CitySpecificClassifier, CityClassificationResult } from "../city-specific-classifiers";

export class SanJoseClassifier implements CitySpecificClassifier {
  canHandle(permit: PermitData): boolean {
    if (!permit.city) return false;
    const city = permit.city.toLowerCase().trim();
    return city === "san jose" || city === "san_jose";
  }

  async classifyPropertyType(permit: PermitData): Promise<CityClassificationResult | null> {
    if (!this.canHandle(permit)) {
      return null;
    }

    // San Jose extractor stores SUBTYPEDESCRIPTION in rawExplicitType
    // (passed from rawPropertyType field in the scraper)
    const subtypeDescription = permit.rawExplicitType;

    if (!subtypeDescription) {
      return null;
    }

    const mapped = this.mapSubtypeToPropertyType(subtypeDescription);
    if (mapped) {
      return {
        propertyType: mapped.type,
        permitType: null,
        confidence: 0.95, // High confidence for direct mapping from city-specific data
        reasoning: [`San Jose SUBTYPEDESCRIPTION: "${subtypeDescription}" → ${mapped.type}`],
      };
    }

    return null;
  }

  async classifyPermitType(permit: PermitData): Promise<CityClassificationResult | null> {
    // San Jose doesn't have explicit permit type classification yet
    // Could be added later if needed
    return null;
  }

  /**
   * Map San Jose SUBTYPEDESCRIPTION to PropertyType
   * Based on the 33 unique values we found earlier
   */
  private mapSubtypeToPropertyType(subtype: string): { type: PropertyType } | null {
    const normalized = subtype.trim();

    // Residential subtypes
    const residentialSubtypes = [
      "Single-Family",
      "1 & 2 Family Residential",
      "Apartment",
      "Condo",
      "Townhouse",
      "2nd Unit Added",
      "Duplex",
      "Single Dwelling Unit",
      "Apt/Condo/Townhouse",
      "Manufactured Home",
    ];

    if (residentialSubtypes.some(r => normalized.includes(r) || r.includes(normalized))) {
      return { type: PropertyType.RESIDENTIAL };
    }

    // Commercial subtypes
    const commercialSubtypes = [
      "Retail",
      "Restaurant",
      "Bank",
      "Service Station",
      "Hotel/Motel",
      "Medical/Dental Clinic",
      "Health Club",
      "School/Daycare",
      "Church",
      "Assembly",
      "SRO/Fraternity/Shelter",
      "Commercial/Industrial",
      "Office",
      "Manufacturing",
      "Warehouse/Storage",
      "R & D Lab",
      "Data Center",
      "Recreation Building",
    ];

    if (commercialSubtypes.some(c => normalized.includes(c) || c.includes(normalized))) {
      return { type: PropertyType.COMMERCIAL };
    }

    // Metadata/unknown subtypes
    const unknownSubtypes = [
      "Survey",
      "Temporary Use",
      "Antenna/Cell Site",
      "Closed Public Parking Garage",
      "Undefined",
    ];

    if (unknownSubtypes.some(u => normalized.includes(u) || u.includes(normalized))) {
      return { type: PropertyType.UNKNOWN };
    }

    return null;
  }
}


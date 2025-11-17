/**
 * Gilroy City-Specific Classifier
 * 
 * Maps permit types (stored in title field) to category names, then to PropertyType.
 * Based on explicit mappings from: https://gilroyca-energovweb.tylerhost.net/apps/selfservice#/applicationAssistant
 * 
 * Examples:
 * - "Fire Alarm NFPA 72" => "Building Non Residential" => COMMERCIAL
 * - "Fire Sprinkler - Commercial" => "Building Non Residential" => COMMERCIAL
 */

import { PropertyType } from "@prisma/client";
import { PermitData } from "../permit-classification";
import { CitySpecificClassifier, CityClassificationResult } from "../city-specific-classifiers";

export class GilroyClassifier implements CitySpecificClassifier {
  canHandle(permit: PermitData): boolean {
    if (!permit.city) return false;
    const city = permit.city.toLowerCase().trim();
    return city === "gilroy" || city === "gilroy_ca";
  }

  async classifyPropertyType(permit: PermitData): Promise<CityClassificationResult | null> {
    if (!this.canHandle(permit)) {
      return null;
    }

    // Gilroy stores permit type in the title field (e.g., "Fire Alarm NFPA 72")
    // We need to map permit type to category name, then to PropertyType
    const permitType = permit.title;

    if (!permitType) {
      return null;
    }

    // First, map permit type to category name
    const categoryName = this.mapPermitTypeToCategory(permitType);
    if (!categoryName) {
      return null;
    }

    // Then, map category name to PropertyType
    const mapped = this.mapCategoryToPropertyType(categoryName);
    return {
      propertyType: mapped.type,
      permitType: null,
      confidence: 0.95, // High confidence for direct mapping from city-specific data
      reasoning: [`Gilroy permit type "${permitType}" → category "${categoryName}" → ${mapped.type}`],
    };
  }

  async classifyPermitType(permit: PermitData): Promise<CityClassificationResult | null> {
    // Gilroy doesn't have explicit permit type classification yet
    // Could be added later if needed
    return null;
  }

  /**
   * Map permit type to category name
   * Based on explicit mappings from the Gilroy application assistant page
   */
  private mapPermitTypeToCategory(permitType: string): string | null {
    const normalized = permitType.trim();

    // Check Building Residential permit types FIRST to avoid false matches
    // (e.g., "R - Re-roof" should not match "NR - Re-roof")
    const buildingResidentialTypes = [
      "Fire Sprinkler - Multi-Family",
      "Fire Sprinkler - Single Family Home",
      "Pre-Approved Accessory Dwelling Unit (ADU)",
      "R - Accessory Dwelling Unit",
      "R - Accessory Structure",
      "R - Addition",
      "R - Alteration",
      "R - Alternate Materials and Methods",
      "R - Demolition",
      "R - Electrical Vehicle Charging Station",
      "R - Foundation Only (with or without Underground Utilities)",
      "R - Grading",
      "R - Manufactured/Modular Home",
      "R - Master Plan (Tract SFR, Solar, Fire Sprinklers, Retaining Walls)",
      "R - Multi-Family",
      "R - New Residential - Tract",
      "R - New Single-Family Home - Custom",
      "R - On-site Improvements",
      "R - Re-roof",
      "R - Solar Photovoltaic System",
      "R - Swimming Pool/Spa",
      "R - Water Heater",
      "SolarAPP+",
    ];

    // Use exact match or starts-with match for better precision
    for (const type of buildingResidentialTypes) {
      if (normalized === type || normalized.startsWith(type) || type.startsWith(normalized)) {
        return "Building Residential";
      }
    }

    // Building Non Residential permit types
    const buildingNonResidentialTypes = [
      "Fire Alarm NFPA 72",
      "Fire Sprinkler - Commercial",
      "NR - Accessory Structure",
      "NR - Addition",
      "NR - Alteration",
      "NR - Alternate Materials and Methods",
      "NR - Cellular/Antenna",
      "NR - Demolition",
      "NR - Electrical Vehicle Charging Station",
      "NR - Foundation Only (with or without Underground Utilities)",
      "NR - Grading",
      "NR - New Construction",
      "NR - On-site Improvements",
      "NR - Re-roof",
      "NR - Solar Photovoltaic System",
      "NR - Swimming Pool/Spa",
      "NR - Water Heater",
      "Sign / Art Sculpture",
    ];

    // Use exact match or starts-with match for better precision
    for (const type of buildingNonResidentialTypes) {
      if (normalized === type || normalized.startsWith(type) || type.startsWith(normalized)) {
        return "Building Non Residential";
      }
    }

    // Other categories that don't map to RESIDENTIAL/COMMERCIAL
    // These will return null and fall back to generic classification
    const otherCategories: Record<string, string[]> = {
      "Encroachment": ["Encroachment Permit"],
      "Fire Prevention": [
        "Exhaust Hoods",
        "Fire Hydrant Flow Test",
        "Fire Suppression Systems",
        "Fire Underground NFPA 24",
        "Fireworks Distributor Permit",
        "Hazardous Materials Storage Facility Review",
        "Outside Cooking Events/Food Trucks",
        "Pyrotechnics: Fireworks Display Permit",
        "Safe and Sane Fireworks Booth Sales",
        "Temporary Above Ground Storage Tanks Containing Fuel",
        "Temporary Hazmat Storage",
        "Tents and Temporary Special Event Structures",
      ],
      "Hazardous Materials": [
        "Demolition of Above Ground Storage Tanks",
        "Hazmat Closure",
        "Install of a Hazardous Materials System",
        "Install of Above Ground Storage Tanks",
        "Miscellaneous: Hazardous Materials Repair/Modification",
        "UST Installs",
        "UST Removal/Closure",
        "UST Repair/Modification",
        "UST Temporary Closure",
      ],
      "Pretreatment (Wastewater)": [
        "Car Wash for Nonprofits",
        "Grease Trap/ Sand Oil Interceptor Install",
        "Install of a Wastewater Pretreatment Systems Misc",
        "Swimming Pool/Spa Wastewater Discharge",
      ],
      "Special Events": ["Special Events"],
      "Special Inspection Agency Request": ["Special Inspection Agency Request"],
      "Transportation": [
        "Annual Transportation Permit",
        "Single Trip Transportation Permit",
      ],
    };

    for (const [category, types] of Object.entries(otherCategories)) {
      for (const type of types) {
        if (normalized === type || normalized.includes(type) || type.includes(normalized)) {
          return category;
        }
      }
    }

    return null;
  }

  /**
   * Map category name to PropertyType
   * Only "Building Residential" and "Building Non Residential" map to specific PropertyType
   * Other categories (Encroachment, Fire Prevention, etc.) return UNKNOWN
   */
  private mapCategoryToPropertyType(category: string): { type: PropertyType } {
    const normalized = category.trim().toLowerCase();

    // Building Residential → RESIDENTIAL
    if (normalized === "building residential") {
      return { type: PropertyType.RESIDENTIAL };
    }

    // Building Non Residential → COMMERCIAL
    if (normalized === "building non residential") {
      return { type: PropertyType.COMMERCIAL };
    }

    // Other categories (Encroachment, Fire Prevention, Hazardous Materials, etc.)
    // don't have a clear PropertyType mapping, so return UNKNOWN
    return { type: PropertyType.UNKNOWN };
  }
}


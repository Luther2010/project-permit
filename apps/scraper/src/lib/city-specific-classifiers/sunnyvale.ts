/**
 * Sunnyvale City-Specific Classifier
 * 
 * Maps permit types (stored in title field) to PropertyType.
 * Based on explicit mappings from Sunnyvale permit types.
 * 
 * Examples:
 * - "Minor Building Permit" => RESIDENTIAL
 */

import { PropertyType } from "@prisma/client";
import { PermitData } from "../permit-classification";
import { CitySpecificClassifier, CityClassificationResult } from "../city-specific-classifiers";

export class SunnyvaleClassifier implements CitySpecificClassifier {
  canHandle(permit: PermitData): boolean {
    if (!permit.city) return false;
    const city = permit.city.toLowerCase().trim();
    return city === "sunnyvale" || city === "sunnyvale_ca";
  }

  async classifyPropertyType(permit: PermitData): Promise<CityClassificationResult | null> {
    if (!this.canHandle(permit)) {
      return null;
    }

    // Sunnyvale stores permit type in the title field (e.g., "Minor Building Permit")
    const permitType = permit.title;

    if (!permitType) {
      return null;
    }

    // Map permit type to PropertyType
    const mapped = this.mapPermitTypeToPropertyType(permitType);
    if (mapped) {
      return {
        propertyType: mapped.type,
        permitType: null,
        confidence: 0.95, // High confidence for direct mapping from city-specific data
        reasoning: [`Sunnyvale permit type "${permitType}" → ${mapped.type}`],
      };
    }

    return null;
  }

  async classifyPermitType(permit: PermitData): Promise<CityClassificationResult | null> {
    // Sunnyvale doesn't have explicit permit type classification yet
    // Could be added later if needed
    return null;
  }

  /**
   * Map permit type to PropertyType
   */
  private mapPermitTypeToPropertyType(permitType: string): { type: PropertyType } | null {
    const normalized = permitType.trim();

    // Residential permit types
    const residentialTypes = [
      "Minor Building Permit",
      // Add more residential types as discovered
    ];

    for (const type of residentialTypes) {
      if (normalized === type || normalized.includes(type) || type.includes(normalized)) {
        return { type: PropertyType.RESIDENTIAL };
      }
    }

    // Commercial permit types
    // Add commercial types here as discovered
    const commercialTypes: string[] = [
      // Add commercial permit types here
    ];

    for (const type of commercialTypes) {
      if (normalized === type || normalized.includes(type) || type.includes(normalized)) {
        return { type: PropertyType.COMMERCIAL };
      }
    }

    return null;
  }
}


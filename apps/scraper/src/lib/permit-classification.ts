/**
 * Permit Classification Service
 * 
 * This service handles the classification of permits into PropertyType and PermitType.
 * It's designed to be easily extensible with better ML/AI logic in the future.
 */

import { PropertyType, PermitType } from "@prisma/client";
import { matchContractorFromText } from "./contractor-matching";
import { getCityClassifier } from "./city-specific-classifiers";

export interface PermitData {
  permitNumber: string;
  title?: string;
  description?: string;
  address?: string;
  city?: string;
  value?: number;
  // Raw data from scraper
  rawExplicitType?: string;
  rawPermitType?: string;
  // Raw contractor text extracted from page (e.g., licensed professional block)
  licensedProfessionalText?: string;
}

export interface ClassificationResult {
  propertyType: PropertyType;
  permitType: PermitType | null;
  confidence: number; // 0.0 - 1.0
  reasoning: string[]; // For debugging/transparency
  // Optional contractor association chosen by classifier (temporary heuristic)
  contractorId?: string | null;
}

/**
 * Main classification service
 */
export class PermitClassificationService {
  private propertyTypeClassifier: PropertyTypeClassifier;
  private permitTypeClassifier: PermitTypeClassifier;

  constructor() {
    this.propertyTypeClassifier = new PropertyTypeClassifier();
    this.permitTypeClassifier = new PermitTypeClassifier();
  }

  /**
   * Classify a permit into PropertyType and PermitType
   * 
   * Strategy:
   * 1. If cityClassifier exists, run it first
   * 2. If both propertyType and permitType are determined → done
   * 3. If only propertyType is determined → use generic for permitType only
   * 4. If only permitType is determined → use generic for propertyType only
   * 5. If neither is determined → use generic for both
   * 6. If no cityClassifier exists → use generic for both
   */
  async classify(permit: PermitData): Promise<ClassificationResult> {
    const cityClassifier = getCityClassifier(permit);
    
    let propertyTypeResult: { type: PropertyType; confidence: number; reasoning: string[] } | null = null;
    let permitTypeResult: { type: PermitType | null; confidence: number; reasoning: string[] } | null = null;

    // Try city-specific classifier if it exists
    if (cityClassifier) {
      const cityPropertyResult = await cityClassifier.classifyPropertyType(permit);
      const cityPermitResult = await cityClassifier.classifyPermitType(permit);

      // Check what the city classifier determined
      const hasPropertyType = cityPropertyResult?.propertyType !== null && cityPropertyResult?.propertyType !== undefined;
      const hasPermitType = cityPermitResult?.permitType !== null && cityPermitResult?.permitType !== undefined;

      if (hasPropertyType) {
        propertyTypeResult = {
          type: cityPropertyResult!.propertyType!,
          confidence: cityPropertyResult!.confidence,
          reasoning: cityPropertyResult!.reasoning,
        };
      }

      if (hasPermitType) {
        permitTypeResult = {
          type: cityPermitResult!.permitType!,
          confidence: cityPermitResult!.confidence,
          reasoning: cityPermitResult!.reasoning,
        };
      }

      // If both are determined, we're done
      if (hasPropertyType && hasPermitType) {
        // Both determined by city classifier, skip generic
      } else if (hasPropertyType && !hasPermitType) {
        // Only propertyType determined, use generic for permitType
        permitTypeResult = await this.permitTypeClassifier.classify(permit);
      } else if (!hasPropertyType && hasPermitType) {
        // Only permitType determined, use generic for propertyType
        propertyTypeResult = await this.propertyTypeClassifier.classify(permit);
      } else {
        // Neither determined, use generic for both
        propertyTypeResult = await this.propertyTypeClassifier.classify(permit);
        permitTypeResult = await this.permitTypeClassifier.classify(permit);
      }
    } else {
      // No city-specific classifier, use generic for both
      propertyTypeResult = await this.propertyTypeClassifier.classify(permit);
      permitTypeResult = await this.permitTypeClassifier.classify(permit);
    }

    // Ensure both results are set (should always be the case after the logic above)
    if (!propertyTypeResult) {
      propertyTypeResult = await this.propertyTypeClassifier.classify(permit);
    }
    if (!permitTypeResult) {
      permitTypeResult = await this.permitTypeClassifier.classify(permit);
    }

    // Match contractor from scraped licensedProfessionalText
    let contractorId: string | null = null;
      try {
        if (permit.licensedProfessionalText) {
          const match = await matchContractorFromText(
            permit.licensedProfessionalText,
            permit.city,
            permit.permitNumber
          );
        
        if (match) {
          contractorId = match.contractorId;
          console.log(
            `[Classifier] ${permit.permitNumber}: matched contractorId=${contractorId} ` +
            `(method: ${match.matchMethod}, confidence: ${match.confidence.toFixed(2)})`
          );
        } else {
          console.log(
            `[Classifier] ${permit.permitNumber}: no contractor match found for "${permit.licensedProfessionalText}"`
          );
        }
      }
    } catch (e) {
      console.warn(`[Classifier] ${permit.permitNumber}: contractor matching failed`, e);
      contractorId = null;
    }

    return {
      propertyType: propertyTypeResult.type,
      permitType: permitTypeResult.type,
      confidence: Math.min(propertyTypeResult.confidence, permitTypeResult.confidence),
      reasoning: [
        ...propertyTypeResult.reasoning,
        ...permitTypeResult.reasoning
      ],
      contractorId,
    };
  }
}

/**
 * Generic Property Type Classifier
 * Used as fallback when city-specific classifier doesn't exist or can't classify
 */
class PropertyTypeClassifier {
  async classify(permit: PermitData): Promise<{ type: PropertyType; confidence: number; reasoning: string[] }> {
    const reasoning: string[] = [];
    let confidence = 0;

    // 1. Check explicit type from scraper (medium confidence - 0.5-0.8)
    if (permit.rawExplicitType) {
      const mapped = this.mapExplicitType(permit.rawExplicitType);
      if (mapped) {
        reasoning.push(`Explicit type: ${permit.rawExplicitType} → ${mapped}`);
        return { type: mapped, confidence: 0.7, reasoning };
      }
    }

    // 2. Analyze description/title keywords (medium confidence - 0.5-0.8)
    const text = `${permit.title || ''} ${permit.description || ''}`.toLowerCase();
    
    if (text.includes('residential') || text.includes('single family') || text.includes('home')) {
      reasoning.push('Found residential keywords');
      return { type: PropertyType.RESIDENTIAL, confidence: 0.7, reasoning };
    }
    
    if (text.includes('commercial') || text.includes('tenant') || text.includes('office') || text.includes('industrial')) {
      reasoning.push('Found commercial keywords');
      return { type: PropertyType.COMMERCIAL, confidence: 0.7, reasoning };
    }

    // 3. Address-based inference (low confidence - 0.3-0.5)
    if (permit.address) {
      const addressType = this.inferFromAddress(permit.address);
      if (addressType) {
        reasoning.push(`Address inference: ${addressType}`);
        return { type: addressType, confidence: 0.4, reasoning };
      }
    }

    // 4. Value-based inference (low confidence - 0.3-0.5)
    if (permit.value) {
      const valueType = this.inferFromValue(permit.value);
      if (valueType) {
        reasoning.push(`Value inference: $${permit.value} → ${valueType}`);
        return { type: valueType, confidence: 0.3, reasoning };
      }
    }

    reasoning.push('No clear classification found');
    return { type: PropertyType.UNKNOWN, confidence: 0, reasoning };
  }

  private mapExplicitType(explicitType: string): PropertyType | null {
    const type = explicitType.toLowerCase().trim();
    
    if (type.includes('residential') || type.includes('single family')) {
      return PropertyType.RESIDENTIAL;
    }
    if (type.includes('commercial') || type.includes('tenant') || type.includes('office') || type.includes('industrial')) {
      return PropertyType.COMMERCIAL;
    }
    
    return null;
  }

  private inferFromAddress(address: string): PropertyType | null {
    // Future: integrate with zoning data
    // For now, simple heuristics
    const addr = address.toLowerCase();
    
    if (addr.includes('ave') || addr.includes('st') || addr.includes('rd')) {
      return PropertyType.RESIDENTIAL; // Most streets are residential
    }
    
    return null;
  }

  private inferFromValue(value: number): PropertyType | null {
    if (value > 500000) {
      return PropertyType.COMMERCIAL; // Large projects often commercial
    }
    if (value > 100000) {
      return PropertyType.RESIDENTIAL; // Medium-large residential
    }
    
    return null;
  }
}

/**
 * Permit Type Classifier
 * Determines specific work type: ELECTRICAL, ROOFING, etc.
 */
class PermitTypeClassifier {
  async classify(permit: PermitData): Promise<{ type: PermitType | null; confidence: number; reasoning: string[] }> {
    const reasoning: string[] = [];
    let confidence = 0;

    // 1. Check explicit permit type from scraper
    if (permit.rawPermitType) {
      const mapped = this.mapExplicitPermitType(permit.rawPermitType);
      if (mapped) {
        reasoning.push(`Explicit permit type: ${permit.rawPermitType} → ${mapped}`);
        return { type: mapped, confidence: 0.9, reasoning };
      }
    }

    // 2. Analyze permit number patterns
    const permitNumber = permit.permitNumber.toUpperCase();
    const numberType = this.inferFromPermitNumber(permitNumber);
    if (numberType) {
      reasoning.push(`Permit number pattern: ${permitNumber} → ${numberType}`);
      return { type: numberType, confidence: 0.8, reasoning };
    }

    // 3. Analyze description keywords
    const text = `${permit.title || ''} ${permit.description || ''}`.toLowerCase();
    const keywordType = this.inferFromKeywords(text);
    if (keywordType) {
      reasoning.push(`Keyword analysis: found ${keywordType} keywords`);
      return { type: keywordType, confidence: 0.7, reasoning };
    }

    // 4. Value-based inference
    if (permit.value) {
      const valueType = this.inferFromValue(permit.value);
      if (valueType) {
        reasoning.push(`Value inference: $${permit.value} → ${valueType}`);
        return { type: valueType, confidence: 0.5, reasoning };
      }
    }

    reasoning.push('No clear permit type found');
    return { type: null, confidence: 0, reasoning };
  }

  private mapExplicitPermitType(explicitType: string): PermitType | null {
    const type = explicitType.toLowerCase().trim();
    
    // Building/Construction patterns
    if (type.includes('building') || type.includes('construction')) {
      return PermitType.BUILDING;
    }
    
    // Electrical patterns
    if (type.includes('electrical') || type.includes('electric')) {
      return PermitType.ELECTRICAL;
    }
    
    // Plumbing patterns  
    if (type.includes('plumbing') || type.includes('plumb')) {
      return PermitType.PLUMBING;
    }
    
    // HVAC patterns
    if (type.includes('hvac') || type.includes('mechanical') || type.includes('heating')) {
      return PermitType.HVAC;
    }
    
    // Roofing patterns
    if (type.includes('roof') || type.includes('roofing')) {
      return PermitType.ROOFING;
    }
    
    // Demolition patterns
    if (type.includes('demo') || type.includes('demolition')) {
      return PermitType.DEMOLITION;
    }
    
    // Addition patterns
    if (type.includes('addition') || type.includes('expansion')) {
      return PermitType.ADDITION;
    }
    
    // ADU patterns
    if (type.includes('adu') || type.includes('accessory') || type.includes('granny')) {
      return PermitType.ADU;
    }
    
    return null;
  }

  private inferFromPermitNumber(permitNumber: string): PermitType | null {
    if (permitNumber.startsWith('E')) return PermitType.ELECTRICAL;
    if (permitNumber.startsWith('P')) return PermitType.PLUMBING;
    if (permitNumber.startsWith('B')) return PermitType.BUILDING;
    if (permitNumber.startsWith('R')) return PermitType.ROOFING;
    if (permitNumber.startsWith('H')) return PermitType.HVAC;
    
    return null;
  }

  private inferFromKeywords(text: string): PermitType | null {
    if (text.includes('adu') || text.includes('accessory')) return PermitType.ADU;
    if (text.includes('bathroom')) return PermitType.BATHROOM;
    if (text.includes('kitchen')) return PermitType.KITCHEN;
    if (text.includes('roof')) return PermitType.ROOFING;
    if (text.includes('solar')) return PermitType.SOLAR;
    if (text.includes('pool') || text.includes('hot tub')) return PermitType.POOL_AND_HOT_TUB;
    if (text.includes('remodel') || text.includes('renovation')) return PermitType.REMODEL;
    if (text.includes('addition') || text.includes('expansion')) return PermitType.ADDITION;
    if (text.includes('electrical') || text.includes('electric')) return PermitType.ELECTRICAL;
    if (text.includes('plumbing') || text.includes('plumb')) return PermitType.PLUMBING;
    if (text.includes('hvac') || text.includes('heating') || text.includes('cooling')) return PermitType.HVAC;
    
    return null;
  }

  private inferFromValue(value: number): PermitType | null {
    if (value > 500000) return PermitType.NEW_CONSTRUCTION;
    if (value > 200000) return PermitType.ADDITION;
    if (value > 100000) return PermitType.REMODEL;
    if (value > 50000) return PermitType.BUILDING;
    
    return null;
  }
}

// Export singleton instance
export const permitClassificationService = new PermitClassificationService();

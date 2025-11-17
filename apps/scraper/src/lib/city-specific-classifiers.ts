/**
 * City-Specific Classification Interfaces and Implementations
 * 
 * Each city can implement its own classification logic to leverage
 * city-specific data fields for higher accuracy.
 */

import { PropertyType, PermitType } from "@prisma/client";
import { PermitData } from "./permit-classification";
import { SanJoseClassifier } from "./city-specific-classifiers/san-jose";
import { GilroyClassifier } from "./city-specific-classifiers/gilroy";

/**
 * Result from a city-specific classifier
 */
export interface CityClassificationResult {
  propertyType: PropertyType | null;
  permitType: PermitType | null;
  confidence: number; // 0.0 - 1.0
  reasoning: string[];
}

/**
 * Interface for city-specific classifiers
 */
export interface CitySpecificClassifier {
  /**
   * Check if this classifier can handle the given permit
   */
  canHandle(permit: PermitData): boolean;

  /**
   * Classify property type using city-specific logic
   */
  classifyPropertyType(permit: PermitData): Promise<CityClassificationResult | null>;

  /**
   * Classify permit type using city-specific logic
   */
  classifyPermitType(permit: PermitData): Promise<CityClassificationResult | null>;
}

/**
 * Registry of city-specific classifiers
 */

const cityClassifiers: CitySpecificClassifier[] = [
  new SanJoseClassifier(),
  new GilroyClassifier(),
];

/**
 * Get the appropriate city-specific classifier for a permit
 */
export function getCityClassifier(permit: PermitData): CitySpecificClassifier | null {
  return cityClassifiers.find(classifier => classifier.canHandle(permit)) || null;
}


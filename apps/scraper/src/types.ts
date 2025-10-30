/**
 * Types for the scraping system
 */

export interface CityConfig {
  city: string;
  state: string;
  extractor: string; // Name of the extractor class
  url: string; // Base URL for the permit website
  enabled: boolean; // Whether scraping is enabled for this city
}

export interface PermitData {
  permitNumber: string;
  title?: string;
  description?: string;
  address?: string;
  city: string;
  state: string;
  zipCode?: string;
  permitType?: string;
  status?: string;
  value?: number;
  issuedDate?: Date;
  issuedDateString?: string;
  expirationDate?: Date;
  sourceUrl?: string;
  licensedProfessionalText?: string;
}

export interface ScrapeResult {
  permits: PermitData[];
  success: boolean;
  error?: string;
  scrapedAt: Date;
}


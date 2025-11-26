/**
 * Types for the scraping system
 */

export enum ScraperType {
  DAILY = "DAILY", // Can scrape permits by specific date
  MONTHLY = "MONTHLY", // Data only available on a monthly basis
  ID_BASED = "ID_BASED", // Must search by permit ID/number (cannot search by date)
}

import { City } from "@prisma/client";

export interface CityConfig {
  city: string; // Display name (e.g., "Los Gatos")
  cityEnum: City; // Prisma City enum value
  state: string;
  extractor: string; // Name of the extractor class
  url: string; // Base URL for the permit website
  enabled: boolean; // Whether scraping is enabled for this city
  scraperType: ScraperType; // Type of scraper (DAILY, MONTHLY, etc.)
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
  appliedDate?: Date;
  appliedDateString?: string;
  expirationDate?: Date;
  sourceUrl?: string;
  licensedProfessionalText?: string;
  // Raw property type from scraper (e.g., SUBTYPEDESCRIPTION for San Jose)
  rawPropertyType?: string;
}

export interface ScrapeResult {
  permits: PermitData[];
  success: boolean;
  error?: string;
  scrapedAt: Date;
}


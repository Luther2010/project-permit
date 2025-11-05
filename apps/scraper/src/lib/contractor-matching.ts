/**
 * Contractor Matching Service
 * 
 * Efficiently matches scraped contractor information to the Contractor database.
 * 
 * Strategy:
 * 1. Parse licensedProfessionalText to extract: license number, name, phone, email, address
 * 2. Match using prioritized approach:
 *    - License number (exact match, highest confidence)
 *    - Name (fuzzy matching with normalization)
 *    - Phone (normalized, exact match)
 *    - Address + Name combo (lower confidence)
 * 
 * Performance considerations for 240k contractors:
 * - Use indexed fields (licenseNo, city)
 * - Normalize inputs before matching
 * - Use fuzzy matching sparingly (only when exact match fails)
 * - Cache common patterns
 */

import { prisma } from "./db";
import { getCountyForCity, BAY_AREA_COUNTIES } from "./city-to-county";
import { County } from "@prisma/client";

export interface ParsedContractorInfo {
  licenseNumber?: string;
  name?: string;
  phone?: string;
  email?: string;
  address?: string;
}

export interface ContractorMatch {
  contractorId: string;
  confidence: number; // 0.0 - 1.0
  matchMethod: string; // "license_number", "name", "phone", "name_phone", etc.
}

/**
 * Parse contractor information from scraped text
 */
export function parseContractorText(text: string): ParsedContractorInfo {
  if (!text || !text.trim()) {
    return {};
  }

  const normalized = text.trim();
  const result: ParsedContractorInfo = {};

  // Extract license number (common patterns: "License #123456", "Lic: 123456", "#123456")
  const licensePatterns = [
    /(?:license|lic|#)\s*:?\s*#?\s*(\d{6,8})/i,
    /#\s*(\d{6,8})/,
    /\b(\d{6,8})\b(?![\d\s-]{4,})/, // 6-8 digit number not followed by more digits
  ];

  for (const pattern of licensePatterns) {
    const match = normalized.match(pattern);
    if (match && match[1]) {
      result.licenseNumber = match[1];
      break;
    }
  }

  // Extract phone number (various formats)
  const phonePatterns = [
    /\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/,
    /\d{3}[\s.-]?\d{3}[\s.-]?\d{4}/,
    /\(\d{3}\)\s*\d{3}[\s.-]?\d{4}/,
  ];

  for (const pattern of phonePatterns) {
    const match = normalized.match(pattern);
    if (match) {
      result.phone = normalizePhone(match[0]);
      break;
    }
  }

  // Extract email
  const emailMatch = normalized.match(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/);
  if (emailMatch) {
    result.email = emailMatch[0].toLowerCase();
  }

  // Extract name (everything else, minus license/phone/email)
  // This is a heuristic - name is usually the main text
  let nameText = normalized;
  if (result.licenseNumber) {
    // Remove license number and associated text
    nameText = nameText.replace(/(?:license|lic|#)\s*:?\s*#?\s*\d{6,8}/gi, '').trim();
  }
  if (result.phone) {
    nameText = nameText.replace(/\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/g, '').trim();
  }
  if (result.email) {
    nameText = nameText.replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/gi, '').trim();
  }

  // Clean up name (remove extra whitespace, common prefixes/suffixes)
  nameText = nameText.replace(/\s+/g, ' ').trim();
  
  // Remove common prefixes
  nameText = nameText.replace(/^(contractor|licensed|professional)[:]\s*/i, '').trim();
  
  if (nameText.length > 2) {
    result.name = nameText;
  }

  return result;
}

/**
 * Normalize phone number for matching
 */
function normalizePhone(phone: string): string {
  // Remove all non-digit characters
  const digits = phone.replace(/\D/g, '');
  
  // Handle US phone numbers (10 digits)
  if (digits.length === 10) {
    return digits;
  }
  
  // Handle 11 digits (with country code 1)
  if (digits.length === 11 && digits.startsWith('1')) {
    return digits.substring(1);
  }
  
  return digits;
}

/**
 * Normalize company name for fuzzy matching
 */
function normalizeCompanyName(name: string): string {
  if (!name) return '';
  
  let normalized = name.toUpperCase().trim();
  
  // Remove common business suffixes (case-insensitive)
  const suffixes = [
    /\s+INC\.?$/i,
    /\s+LLC\.?$/i,
    /\s+L\.L\.C\.?$/i,
    /\s+CORP\.?$/i,
    /\s+CORPORATION$/i,
    /\s+LTD\.?$/i,
    /\s+LIMITED$/i,
    /\s+CO\.?$/i,
    /\s+COMPANY$/i,
    /\s+AND\s+ASSOCIATES$/i,
    /\s+&?\s*ASSOCIATES$/i,
    /\s+GROUP$/i,
  ];
  
  for (const suffix of suffixes) {
    normalized = normalized.replace(suffix, '');
  }
  
  // Remove extra whitespace
  normalized = normalized.replace(/\s+/g, ' ').trim();
  
  // Remove special characters (keep letters, numbers, spaces)
  normalized = normalized.replace(/[^A-Z0-9\s]/g, '');
  
  return normalized;
}

/**
 * Calculate string similarity (Levenshtein distance ratio)
 * Returns 0.0 (completely different) to 1.0 (identical)
 */
function stringSimilarity(str1: string, str2: string): number {
  const longer = str1.length > str2.length ? str1 : str2;
  const shorter = str1.length > str2.length ? str2 : str1;
  
  if (longer.length === 0) return 1.0;
  
  const distance = levenshteinDistance(longer, shorter);
  return (longer.length - distance) / longer.length;
}

/**
 * Calculate Levenshtein distance between two strings
 */
function levenshteinDistance(str1: string, str2: string): number {
  const matrix: number[][] = [];
  
  for (let i = 0; i <= str2.length; i++) {
    matrix[i] = [i];
  }
  
  for (let j = 0; j <= str1.length; j++) {
    matrix[0][j] = j;
  }
  
  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,      // insertion
          matrix[i - 1][j] + 1       // deletion
        );
      }
    }
  }
  
  return matrix[str2.length][str1.length];
}

/**
 * Match contractor using parsed information
 * Returns best match with confidence score
 * 
 * @param parsed - Parsed contractor information from text
 * @param permitCity - City where the permit is located (used to infer county for filtering)
 */
export async function matchContractor(
  parsed: ParsedContractorInfo,
  permitCity?: string
): Promise<ContractorMatch | null> {
  // Debug: Log parsed contractor info
  console.log(`[ContractorMatching] Parsed info:`, {
    licenseNumber: parsed.licenseNumber,
    name: parsed.name,
    phone: parsed.phone,
    email: parsed.email,
    permitCity,
  });
  
  // Get county from permit's city (if available)
  const permitCounty = permitCity ? getCountyForCity(permitCity) : undefined;
  if (permitCounty) {
    console.log(`[ContractorMatching] Mapped permit city "${permitCity}" to county: ${permitCounty}`);
  }
  // Strategy 1: Match by license number (highest confidence)
  if (parsed.licenseNumber) {
    const contractor = await prisma.contractor.findUnique({
      where: { licenseNo: parsed.licenseNumber },
      select: { id: true },
    });
    
    if (contractor) {
      console.log(`[ContractorMatching] License number match found: contractorId=${contractor.id}`);
      return {
        contractorId: contractor.id,
        confidence: 0.95,
        matchMethod: 'license_number',
      };
    } else {
      console.log(`[ContractorMatching] No license number match for: ${parsed.licenseNumber}`);
    }
  }

  // Strategy 2: Match by name (exact match)
  if (parsed.name) {
    const normalizedName = normalizeCompanyName(parsed.name);
    
    // Build query - use city index if available, fallback to county
    let whereClause: any = {
      name: normalizedName, // Exact match
    };
    
    if (permitCity) {
      whereClause.city = permitCity.toUpperCase();
      const contractor = await prisma.contractor.findFirst({
        where: whereClause,
        select: { id: true },
      });
      
      if (contractor) {
        console.log(`[ContractorMatching] Name match found in city "${permitCity}": contractorId=${contractor.id}`);
        return {
          contractorId: contractor.id,
          confidence: 0.85,
          matchMethod: 'name',
        };
      }
      
      // Try county if no city match
      if (permitCounty) {
        const contractor = await prisma.contractor.findFirst({
          where: {
            name: normalizedName,
            county: permitCounty as County,
          },
          select: { id: true },
        });
        
        if (contractor) {
          console.log(`[ContractorMatching] Name match found in county "${permitCounty}": contractorId=${contractor.id}`);
          return {
            contractorId: contractor.id,
            confidence: 0.80,
            matchMethod: 'name',
          };
        }
      }
    } else {
      // No city filter - search Bay Area counties
      const contractor = await prisma.contractor.findFirst({
        where: {
          name: normalizedName,
          county: {
            in: BAY_AREA_COUNTIES as County[],
          },
        },
        select: { id: true },
      });
      
      if (contractor) {
        console.log(`[ContractorMatching] Name match found in Bay Area: contractorId=${contractor.id}`);
        return {
          contractorId: contractor.id,
          confidence: 0.75,
          matchMethod: 'name',
        };
      }
    }
    
    console.log(`[ContractorMatching] No exact name match found for: "${normalizedName}"`);
  }

  // Strategy 3: Match by phone number (exact match)
  if (parsed.phone) {
    const normalizedPhone = normalizePhone(parsed.phone);
    
    // Build query - use city index if available, fallback to county
    if (permitCity) {
      // First try exact city match
      const contractor = await prisma.contractor.findFirst({
        where: {
          phone: normalizedPhone,
          city: permitCity.toUpperCase(),
        },
        select: { id: true },
      });
      
      if (contractor) {
        console.log(`[ContractorMatching] Phone match found in city "${permitCity}": contractorId=${contractor.id}`);
        return {
          contractorId: contractor.id,
          confidence: 0.80,
          matchMethod: 'phone',
        };
      }
      
      // Try county if no city match
      if (permitCounty) {
        const contractor = await prisma.contractor.findFirst({
          where: {
            phone: normalizedPhone,
            county: permitCounty as County,
          },
          select: { id: true },
        });
        
        if (contractor) {
          console.log(`[ContractorMatching] Phone match found in county "${permitCounty}": contractorId=${contractor.id}`);
          return {
            contractorId: contractor.id,
            confidence: 0.75,
            matchMethod: 'phone',
          };
        }
      }
    } else {
      // No city filter - search Bay Area counties
      const contractor = await prisma.contractor.findFirst({
        where: {
          phone: normalizedPhone,
          county: {
            in: BAY_AREA_COUNTIES as County[],
          },
        },
        select: { id: true },
      });
      
      if (contractor) {
        console.log(`[ContractorMatching] Phone match found in Bay Area: contractorId=${contractor.id}`);
        return {
          contractorId: contractor.id,
          confidence: 0.70,
          matchMethod: 'phone',
        };
      }
    }
    
    console.log(`[ContractorMatching] No exact phone match found for: "${normalizedPhone}"`);
  }

  // Strategy 4: Match by name + phone combination (if both available, exact match)
  if (parsed.name && parsed.phone) {
    const normalizedName = normalizeCompanyName(parsed.name);
    const normalizedPhone = normalizePhone(parsed.phone);
    
    if (permitCity) {
      // First try exact city match
      const contractor = await prisma.contractor.findFirst({
        where: {
          name: normalizedName,
          phone: normalizedPhone,
          city: permitCity.toUpperCase(),
        },
        select: { id: true },
      });
      
      if (contractor) {
        console.log(`[ContractorMatching] Name+Phone match found in city "${permitCity}": contractorId=${contractor.id}`);
        return {
          contractorId: contractor.id,
          confidence: 0.90, // Higher confidence when both match
          matchMethod: 'name_phone',
        };
      }
      
      // Try county if no city match
      if (permitCounty) {
        const contractor = await prisma.contractor.findFirst({
          where: {
            name: normalizedName,
            phone: normalizedPhone,
            county: permitCounty as County,
          },
          select: { id: true },
        });
        
        if (contractor) {
          console.log(`[ContractorMatching] Name+Phone match found in county "${permitCounty}": contractorId=${contractor.id}`);
          return {
            contractorId: contractor.id,
            confidence: 0.85,
            matchMethod: 'name_phone',
          };
        }
      }
    } else {
      // No city filter - search Bay Area counties
      const contractor = await prisma.contractor.findFirst({
        where: {
          name: normalizedName,
          phone: normalizedPhone,
          county: {
            in: BAY_AREA_COUNTIES as County[],
          },
        },
        select: { id: true },
      });
      
      if (contractor) {
        console.log(`[ContractorMatching] Name+Phone match found in Bay Area: contractorId=${contractor.id}`);
        return {
          contractorId: contractor.id,
          confidence: 0.80,
          matchMethod: 'name_phone',
        };
      }
    }
    
    console.log(`[ContractorMatching] No exact name+phone match found`);
  }

  // No match found
  console.log(`[ContractorMatching] No match found after trying all strategies`);
  return null;
}

/**
 * Match contractor from raw licensedProfessionalText
 * Convenience method that combines parsing and matching
 */
export async function matchContractorFromText(
  text: string | undefined,
  permitCity?: string
): Promise<ContractorMatch | null> {
  if (!text) {
    return null;
  }

  const parsed = parseContractorText(text);
  return await matchContractor(parsed, permitCity);
}


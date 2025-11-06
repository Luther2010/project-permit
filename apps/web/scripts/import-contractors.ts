#!/usr/bin/env tsx

import fs from "node:fs";
import path from "node:path";
import { prisma } from "../src/lib/db";
import { ContractorBusinessType, CSLBClassification, County } from "@prisma/client";

type Row = Record<string, string>;

function parseCsv(content: string): Row[] {
    const rows: Row[] = [];
    const headers: string[] = [];

    let i = 0;
    const len = content.length;
    const current: string[] = [];
    let field = "";
    let inQuotes = false;
    let isHeader = true;

    const pushField = () => {
        current.push(field);
        field = "";
    };

    const pushRow = () => {
        if (isHeader) {
            headers.splice(0, headers.length, ...current.map((h) => h.trim()));
            isHeader = false;
        } else {
            const row: Row = {};
            for (let j = 0; j < headers.length; j++) {
                row[headers[j]] = (current[j] ?? "").trim();
            }
            rows.push(row);
        }
        current.length = 0;
    };

    while (i < len) {
        const char = content[i];
        if (inQuotes) {
            if (char === '"') {
                if (content[i + 1] === '"') {
                    field += '"';
                    i += 2;
                    continue;
                } else {
                    inQuotes = false;
                    i++;
                    continue;
                }
            } else {
                field += char;
                i++;
                continue;
            }
        } else {
            if (char === '"') {
                inQuotes = true;
                i++;
                continue;
            }
            if (char === ",") {
                pushField();
                i++;
                continue;
            }
            if (char === "\n") {
                pushField();
                pushRow();
                i++;
                continue;
            }
            if (char === "\r") {
                i++;
                continue;
            }
            field += char;
            i++;
        }
    }
    // last field/row
    pushField();
    if (current.length > 1 || current[0] !== "") {
        pushRow();
    }
    return rows;
}

function parseDate(value?: string): Date | null {
    if (!value) return null;
    const v = value.trim();
    if (!v) return null;
    const m = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (m) {
        const month = parseInt(m[1], 10) - 1;
        const day = parseInt(m[2], 10);
        const year = parseInt(m[3], 10);
        const d = new Date(year, month, day);
        return isNaN(d.getTime()) ? null : d;
    }
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
}

/**
 * Map CSV county names to County enum values
 */
function mapCountyToEnum(countyName?: string): County | null {
    if (!countyName) return null;
    
    const normalized = countyName.trim().toUpperCase();
    
    // Map common variations
    const countyMap: Record<string, County> = {
        "SANTA CLARA": County.SANTA_CLARA,
        "SAN MATEO": County.SAN_MATEO,
        "ALAMEDA": County.ALAMEDA,
        "SANTA CRUZ": County.SANTA_CRUZ,
        "SAN BENITO": County.SAN_BENITO,
        "MONTEREY": County.MONTEREY,
        "CONTRA COSTA": County.CONTRA_COSTA,
    };
    
    return countyMap[normalized] || null;
}

/**
 * Bay Area counties we want to import
 */
const BAY_AREA_COUNTIES = new Set<County>([
    County.SANTA_CLARA,
    County.SAN_MATEO,
    County.ALAMEDA,
    County.SANTA_CRUZ,
    County.SAN_BENITO,
    County.MONTEREY,
    County.CONTRA_COSTA,
]);

//

async function main() {
    // Default to Downloads/MasterLicenseData.csv if not specified
    const csvPath = process.env.CONTRACTORS_CSV_PATH
        ? path.resolve(process.env.CONTRACTORS_CSV_PATH)
        : path.resolve(process.env.HOME || "", "Downloads/MasterLicenseData.csv");

    if (!fs.existsSync(csvPath)) {
        console.error(`CSV not found at ${csvPath}`);
        console.error(`Set CONTRACTORS_CSV_PATH env var to specify a different path`);
        process.exit(1);
    }
    
    console.log(`Reading CSV from: ${csvPath}`);

    const content = fs.readFileSync(csvPath, "utf8");
    const rows = parseCsv(content);
    if (rows.length === 0) {
        console.log("No contractor rows found.");
        return;
    }

    let created = 0;
    let updated = 0;
    let skipped = 0;

    for (const r of rows) {
        // Filter: only import Bay Area counties
        const countyName = r["County"]?.trim();
        const county = mapCountyToEnum(countyName);
        
        if (!county || !BAY_AREA_COUNTIES.has(county)) {
            skipped++;
            continue;
        }
        const classificationsRaw = (r["Classifications(s)"] ?? "").trim();
        const ALLOWED_CLASS_CODES = new Set<string>([
            "A",
            "B",
            "B2",
            "C2",
            "C4",
            "C5",
            "C6",
            "C7",
            "C8",
            "C9",
            "C10",
            "C11",
            "C12",
            "C13",
            "C15",
            "C16",
            "C17",
            "C20",
            "C21",
            "C22",
            "C23",
            "C27",
            "C28",
            "C29",
            "C31",
            "C32",
            "C33",
            "C34",
            "C35",
            "C36",
            "C38",
            "C39",
            "C42",
            "C43",
            "C45",
            "C46",
            "C47",
            "C49",
            "C50",
            "C51",
            "C53",
            "C54",
            "C55",
            "C57",
            "C60",
            "C61",
            "D12",
            "D16",
            "D28",
            "D29",
            "D35",
            "D49",
            "D52",
            "D60",
            "D65",
        ]);
        const classifications: CSLBClassification[] = [];
        if (classificationsRaw) {
            for (const token of classificationsRaw
                .split("|")
                .map((s) => s.trim())
                .filter(Boolean)) {
                const norm = token.replace(/\s|-/g, "").toUpperCase(); // e.g., "C-10" => "C10", "B-2" => "B2"
                // Skip known certifications not in classifications enum
                if (norm === "HAZ" || norm === "ASB") continue;
                if (ALLOWED_CLASS_CODES.has(norm))
                    classifications.push(norm as CSLBClassification);
            }
        }

        const licenseNo = r["LicenseNo"]?.trim() ?? "";
        if (!licenseNo) continue;

        const data = {
            licenseNo,
            name: r["BusinessName"]?.trim() || null,
            mailingAddress: r["MailingAddress"]?.trim() || null,
            city: r["City"]?.trim() || null,
            county: county,
            state: r["State"]?.trim() || null,
            zipCode: r["ZIPCode"]?.trim() || null,
            phone: r["BusinessPhone"]?.trim() || null,

            businessType: ((): ContractorBusinessType | null => {
                const bt = (r["BusinessType"] || "").trim().toLowerCase();
                if (!bt) return null;
                if (bt.includes("sole"))
                    return ContractorBusinessType.SOLE_OWNER;
                if (bt.includes("corporation"))
                    return ContractorBusinessType.CORPORATION;
                if (bt.includes("partnership"))
                    return ContractorBusinessType.PARTNERSHIP;
                if (bt.includes("limited liability") || bt === "llc")
                    return ContractorBusinessType.LIMITED_LIABILITY;
                return ContractorBusinessType.OTHER;
            })(),

            issueDate: parseDate(r["IssueDate"]) || null,
        } as const;

        const existing = await prisma.contractor.findUnique({
            where: { licenseNo },
            select: { id: true },
        });

        let contractorId: string;
        if (existing) {
            const updatedRow = await prisma.contractor.update({
                where: { licenseNo },
                data,
                select: { id: true },
            });
            contractorId = updatedRow.id;
            updated++;
        } else {
            const createdRow = await prisma.contractor.create({
                data,
                select: { id: true },
            });
            contractorId = createdRow.id;
            created++;
        }

        // Upsert classifications: ensure unique set per contractor
        if (classifications.length) {
            // Delete stale ones not in current set
            await prisma.contractorClassification.deleteMany({
                where: {
                    contractorId,
                    NOT: { classification: { in: classifications } },
                },
            });
            // Upsert current ones
            for (const c of classifications) {
                await prisma.contractorClassification.upsert({
                    where: {
                        contractorId_classification: {
                            contractorId,
                            classification: c,
                        },
                    },
                    update: {},
                    create: { contractorId, classification: c },
                });
            }
        } else {
            // If none provided, remove any existing
            await prisma.contractorClassification.deleteMany({
                where: { contractorId },
            });
        }
    }

    console.log(
        `Imported contractors. Created: ${created}, Updated: ${updated}, Skipped (non-Bay Area): ${skipped}`
    );
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });

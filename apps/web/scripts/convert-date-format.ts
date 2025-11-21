import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * Convert MM/DD/YYYY to YYYY-MM-DD format
 */
function convertToYYYYMMDD(dateStr: string | null): string | null {
    if (!dateStr) return null;
    
    const parts = dateStr.split("/");
    if (parts.length !== 3) {
        // Already in YYYY-MM-DD format or invalid
        if (dateStr.includes("-") && dateStr.length === 10) {
            return dateStr; // Already converted
        }
        return null;
    }
    
    const month = parts[0];
    const day = parts[1];
    const year = parts[2];
    
    // Validate
    const monthNum = parseInt(month, 10);
    const dayNum = parseInt(day, 10);
    const yearNum = parseInt(year, 10);
    
    if (isNaN(monthNum) || isNaN(dayNum) || isNaN(yearNum)) {
        return null;
    }
    
    // Convert to YYYY-MM-DD
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

async function convertAllDates() {
    console.log("🔄 Converting appliedDateString from MM/DD/YYYY to YYYY-MM-DD format...");
    
    try {
        // Get all permits with appliedDateString
        const permits = await prisma.permit.findMany({
            where: {
                appliedDateString: {
                    not: null,
                },
            },
            select: {
                id: true,
                appliedDateString: true,
            },
        });

        console.log(`📊 Found ${permits.length} permits with appliedDateString`);

        let converted = 0;
        let skipped = 0;
        let errors = 0;

        for (const permit of permits) {
            if (!permit.appliedDateString) continue;

            // Check if already in YYYY-MM-DD format
            if (permit.appliedDateString.includes("-") && permit.appliedDateString.length === 10) {
                skipped++;
                continue;
            }

            const convertedDate = convertToYYYYMMDD(permit.appliedDateString);
            
            if (!convertedDate) {
                console.warn(`⚠️  Could not convert date for permit ${permit.id}: ${permit.appliedDateString}`);
                errors++;
                continue;
            }

            await prisma.permit.update({
                where: { id: permit.id },
                data: { appliedDateString: convertedDate },
            });

            converted++;
            
            if (converted % 100 === 0) {
                console.log(`   Converted ${converted} permits...`);
            }
        }

        console.log(`\n✅ Conversion complete!`);
        console.log(`   Converted: ${converted}`);
        console.log(`   Already in YYYY-MM-DD: ${skipped}`);
        console.log(`   Errors: ${errors}`);
    } catch (error) {
        console.error("❌ Error converting dates:", error);
        throw error;
    } finally {
        await prisma.$disconnect();
    }
}

convertAllDates();


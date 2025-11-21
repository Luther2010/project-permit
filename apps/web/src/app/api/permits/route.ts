import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
    try {
        const permits = await prisma.permit.findMany({
            orderBy: {
                appliedDateString: "desc",
            },
        });

        return NextResponse.json({ permits });
    } catch (error) {
        console.error("Error fetching permits:", error);
        return NextResponse.json(
            { error: "Failed to fetch permits" },
            { status: 500 }
        );
    }
}

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const email = searchParams.get("email");

        if (!email) {
            return NextResponse.json(
                { error: "Email is required" },
                { status: 400 }
            );
        }

        const user = await prisma.user.findUnique({
            where: { email },
            include: { accounts: true },
        });

        if (!user) {
            return NextResponse.json({
                exists: false,
                hasOAuthAccounts: false,
                hasPassword: false,
            });
        }

        return NextResponse.json({
            exists: true,
            hasOAuthAccounts: user.accounts.length > 0,
            hasPassword: user.password !== null,
        });
    } catch (error) {
        console.error("Check user error:", error);
        return NextResponse.json(
            { error: "Failed to check user" },
            { status: 500 }
        );
    }
}


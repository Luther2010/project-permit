import { PrismaAdapter } from "@auth/prisma-adapter";
import NextAuth, { type NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import CredentialsProvider from "next-auth/providers/credentials";
import { prisma } from "@/lib/db";
import bcrypt from "bcrypt";

// Extend next-auth types to include id in session
declare module "next-auth" {
    interface Session {
        user: {
            id?: string;
            name?: string | null;
            email?: string | null;
            image?: string | null;
        };
    }
}

export const authOptions: NextAuthOptions = {
    adapter: PrismaAdapter(prisma),
    providers: [
        GoogleProvider({
            clientId: process.env.GOOGLE_CLIENT_ID!,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
        }),
        CredentialsProvider({
            name: "Credentials",
            credentials: {
                email: { label: "Email", type: "email" },
                password: { label: "Password", type: "password" },
            },
            async authorize(credentials) {
                if (!credentials?.email || !credentials?.password) {
                    return null;
                }

                // Find user by email
                const user = await prisma.user.findUnique({
                    where: { email: credentials.email },
                    include: { accounts: true },
                });

                if (!user) {
                    return null; // User doesn't exist
                }

                // Check if user has OAuth accounts (Google sign-in only)
                if (user.accounts.length > 0 && !user.password) {
                    // User exists but signed up with OAuth only
                    // Return null - we'll handle the error message in the UI
                    // by checking the error response
                    return null;
                }

                // Check if user has a password
                if (!user.password) {
                    return null; // User exists but no password set
                }

                // Verify password
                const isValid = await bcrypt.compare(
                    credentials.password,
                    user.password
                );

                if (!isValid) {
                    return null; // Wrong password
                }

                // Return user object (NextAuth will create session)
                return {
                    id: user.id,
                    email: user.email,
                    name: user.name,
                };
            },
        }),
    ],
    pages: {
        signIn: "/", // Use home page as sign-in page
    },
    session: {
        strategy: "jwt" as const, // Use JWT instead of database sessions
        maxAge: 30 * 24 * 60 * 60, // 30 days - keeps users signed in
    },
    callbacks: {
        async signIn() {
            // Return true to allow sign in
            return true;
        },
        async redirect({ url, baseUrl }) {
            // Redirect to home page after sign in/out
            if (url.startsWith("/")) return `${baseUrl}${url}`;
            if (new URL(url).origin === baseUrl) return url;
            return baseUrl;
        },
        async jwt({ token, user }) {
            if (user) {
                token.id = user.id;
            }
            return token;
        },
        async session({ session, token }) {
            if (session.user && token.id) {
                // Verify user still exists in database
                try {
                    const user = await prisma.user.findUnique({
                        where: { id: token.id as string },
                        select: { id: true, email: true, name: true }, // Select fields we need
                    });

                    if (user) {
                        session.user.id = token.id as string;
                        // Update email and name from database (in case they changed)
                        session.user.email = user.email;
                        session.user.name = user.name;
                    } else {
                        // User doesn't exist - clear all user data to invalidate session
                        session.user.id = undefined;
                        session.user.email = null;
                        session.user.name = null;
                    }
                } catch (error) {
                    // If database query fails, clear user data to be safe
                    console.error("Error verifying user in session:", error);
                    session.user.id = undefined;
                    session.user.email = null;
                    session.user.name = null;
                }
            }
            return session;
        },
    },
};

export default NextAuth(authOptions);

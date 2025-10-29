import { createYoga } from "graphql-yoga";
import type { NextRequest } from "next/server";
import { makeExecutableSchema } from "@graphql-tools/schema";
import { typeDefs } from "@/graphql/schema";
import { resolvers } from "@/graphql/resolvers";
import { getToken } from "next-auth/jwt";

const schema = makeExecutableSchema({
    typeDefs,
    resolvers,
});

const yogaApp = createYoga({
    schema,
    graphqlEndpoint: "/api/graphql",
    fetchAPI: {
        Request: Request,
        Response: Response,
    },
    context: async ({ request }: { request: Request }) => {
        // Extract session token from cookies using next-auth/jwt
        const token = await getToken({
            req: request as any,
            secret: process.env.NEXTAUTH_SECRET,
        });

        // Convert token to session-like object
        const session = token
            ? {
                  user: {
                      id: token.sub,
                      name: token.name,
                      email: token.email,
                      image: token.picture,
                  },
              }
            : null;

        return {
            session,
        };
    },
});

export async function GET(request: NextRequest) {
    return yogaApp.fetch(request);
}

export async function POST(request: NextRequest) {
    return yogaApp.fetch(request);
}

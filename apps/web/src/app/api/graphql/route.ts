import { createYoga } from "graphql-yoga";
import type { NextRequest } from "next/server";
import { makeExecutableSchema } from "@graphql-tools/schema";
import { typeDefs } from "@/graphql/schema";
import { resolvers } from "@/graphql/resolvers";

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
});

export async function GET(request: NextRequest) {
    return yogaApp.fetch(request);
}

export async function POST(request: NextRequest) {
    return yogaApp.fetch(request);
}

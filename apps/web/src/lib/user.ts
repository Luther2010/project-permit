import { graphqlFetch } from "./graphql-client";

export interface User {
    id: string;
    email: string;
    name: string | null;
    isPremium: boolean;
}

/**
 * Fetch current user info including premium status
 */
export async function getMe(): Promise<User | null> {
    const query = `
        query GetMe {
            me {
                id
                email
                name
                isPremium
            }
        }
    `;

    try {
        const data = await graphqlFetch(query, {});
        return data.me || null;
    } catch (error) {
        console.error("Error fetching user info:", error);
        return null;
    }
}


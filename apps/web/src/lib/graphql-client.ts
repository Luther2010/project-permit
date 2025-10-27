export async function graphqlFetch(
    query: string,
    variables?: Record<string, unknown>
) {
    const response = await fetch(
        `${process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000"}/api/graphql`,
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                query,
                variables,
            }),
        }
    );

    if (!response.ok) {
        throw new Error(`GraphQL error: ${response.statusText}`);
    }

    const result = await response.json();

    if (result.errors) {
        throw new Error(result.errors[0].message);
    }

    return result.data;
}

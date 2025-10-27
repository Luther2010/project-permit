# GraphQL API

GraphQL endpoint available at `/api/graphql`

## Queries

### Get All Permits

```graphql
query {
    permits {
        id
        permitNumber
        title
        description
        city
        state
        permitType
        status
        value
        issuedDate
    }
}
```

### Get Single Permit

```graphql
query {
    permit(id: "clxxx...") {
        id
        permitNumber
        title
        description
        city
        state
    }
}
```

### Search Permits

```graphql
query {
    searchPermits(query: "residential") {
        id
        permitNumber
        title
        city
    }
}
```

## Testing with GraphiQL

Navigate to http://localhost:3000/api/graphql to use the built-in GraphiQL playground.

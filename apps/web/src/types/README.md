# Managing Enums Across Prisma and GraphQL

## Current Approach: Keep Schemas in Sync

We define enums in both Prisma and GraphQL schema files. **⚠️ IMPORTANT: They must be kept in sync manually.**

### When Adding a New Enum Value:

1. Add to **Prisma schema** first (`prisma/schema.prisma`)
2. Add to **GraphQL schema** (`src/graphql/schema.ts`)
3. Run migration: `pnpm prisma migrate dev`
4. Regenerate Prisma client: `pnpm prisma generate`
5. Update seed script if needed
6. Test GraphQL query returns the new value correctly

### Why Duplication?

Prisma enums enforce type safety at the database/ORM level, while GraphQL enums enforce it at the API layer. Both are compile-time checkpoints that catch different errors.

### Future Improvement

For larger projects, consider using GraphQL Nexus with Prisma plugin, which auto-generates types from your Prisma schema.

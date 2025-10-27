export const typeDefs = `
  enum PermitType {
    BUILDING
    ELECTRICAL
    PLUMBING
    MECHANICAL
    ROOFING
    DEMOLITION
    OTHER
  }

  type Permit {
    id: String!
    permitNumber: String!
    title: String
    description: String
    address: String
    city: String
    state: String
    zipCode: String
    permitType: PermitType
    status: String
    value: Float
    issuedDate: String
    expirationDate: String
    sourceUrl: String
    scrapedAt: String!
    createdAt: String!
    updatedAt: String!
  }

  type Query {
    permits: [Permit!]!
    permit(id: String!): Permit
    permitByNumber(permitNumber: String!): Permit
    searchPermits(query: String): [Permit!]!
  }

`;

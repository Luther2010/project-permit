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

  enum PermitStatus {
    DRAFT
    SUBMITTED
    IN_REVIEW
    APPROVED
    ISSUED
    EXPIRED
    REVOKED
    CANCELLED
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
    status: PermitStatus
    value: Float
    issuedDate: String
    issuedDateString: String
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

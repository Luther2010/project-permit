export const typeDefs = `
  enum PropertyType {
    RESIDENTIAL
    COMMERCIAL
    INDUSTRIAL
    OFFICE
    AGRICULTURAL
    RECREATIONAL
    VACANT_LAND
    MISCELLANEOUS
    EXEMPT
  }

  enum PermitType {
    ADDITION
    ADU
    BATHROOM
    BATTERY
    BUILDING
    DEMOLITION
    ELECTRIC_METER
    ELECTRICAL
    EV_CHARGER
    FIRE_SPRINKLER
    GAS
    GENERATOR
    GRADING
    HEAT_PUMP
    HVAC
    KITCHEN
    MECHANICAL
    NEW_CONSTRUCTION
    PLUMBING
    POOL_AND_HOT_TUB
    REMODEL
    ROOFING
    SOLAR
    WATER_HEATER
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

  enum SubscriptionPlan {
    FREEMIUM
    PREMIUM
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
    propertyType: PropertyType
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

  type PermitConnection {
    permits: [Permit!]!
    totalCount: Int!
    page: Int!
    pageSize: Int!
    hasNextPage: Boolean!
    hasPreviousPage: Boolean!
    isPremium: Boolean!
  }

  enum SortOrder {
    ASC
    DESC
  }

  enum PermitSortField {
    PERMIT_TYPE
    PROPERTY_TYPE
    CITY
    VALUE
    ISSUED_DATE
    STATUS
  }

  type Query {
    permits(
      query: String
      propertyType: PropertyType
      propertyTypes: [PropertyType!]
      permitType: PermitType
      permitTypes: [PermitType!]
      city: String
      minValue: Float
      maxValue: Float
      minIssuedDate: String
      maxIssuedDate: String
      page: Int
      pageSize: Int
      sortBy: PermitSortField
      sortOrder: SortOrder
    ): PermitConnection!
    permit(id: String!): Permit
    permitByNumber(permitNumber: String!): Permit
  }

`;

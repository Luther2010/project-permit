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
    UNKNOWN
    IN_REVIEW
    ISSUED
    INACTIVE
  }

  enum City {
    LOS_GATOS
    SARATOGA
    SANTA_CLARA
    CUPERTINO
    PALO_ALTO
    LOS_ALTOS_HILLS
    SUNNYVALE
    SAN_JOSE
    CAMPBELL
    MOUNTAIN_VIEW
    GILROY
    MILPITAS
    MORGAN_HILL
    LOS_ALTOS
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
    city: City
    state: String
    zipCode: String
    propertyType: PropertyType
    permitType: PermitType
    status: PermitStatus
    value: Float
    appliedDate: String
    appliedDateString: String
    expirationDate: String
    sourceUrl: String
    scrapedAt: String!
    createdAt: String!
    updatedAt: String!
    contractors: [PermitContractorLink!]!
  }

  type PermitConnection {
    permits: [Permit!]!
    totalCount: Int!
    page: Int!
    pageSize: Int!
    hasNextPage: Boolean!
    hasPreviousPage: Boolean!
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
    APPLIED_DATE
    STATUS
  }

  type User {
    id: String!
    email: String!
    name: String
    isPremium: Boolean!
  }

  type Query {
    permits(
      query: String
      propertyType: PropertyType
      propertyTypes: [PropertyType!]
      permitType: PermitType
      permitTypes: [PermitType!]
      statuses: [PermitStatus!]
      cities: [City!]
      hasContractor: Boolean
      minValue: Float
      maxValue: Float
      minAppliedDate: String
      maxAppliedDate: String
      page: Int
      pageSize: Int
      sortBy: PermitSortField
      sortOrder: SortOrder
    ): PermitConnection!
    permit(id: String!): Permit
    permitByNumber(permitNumber: String!): Permit
    me: User
  }

  type ContractorClassification {
    classification: CSLBClassification!
  }

  enum CSLBClassification {
    A
    B
    B2
    C2
    C4
    C5
    C6
    C7
    C8
    C9
    C10
    C11
    C12
    C13
    C15
    C16
    C17
    C20
    C21
    C22
    C23
    C27
    C28
    C29
    C31
    C32
    C33
    C34
    C35
    C36
    C38
    C39
    C42
    C43
    C45
    C46
    C47
    C49
    C50
    C51
    C53
    C54
    C55
    C57
    C60
    C61
    D12
    D16
    D28
    D29
    D35
    D49
    D52
    D60
    D65
  }

  enum ContractorBusinessType {
    SOLE_OWNER
    CORPORATION
    PARTNERSHIP
    LIMITED_LIABILITY
    OTHER
  }

  type Contractor {
    id: String!
    licenseNo: String!
    name: String
    mailingAddress: String
    city: String
    state: String
    zipCode: String
    phone: String
    businessType: ContractorBusinessType
    classifications: [ContractorClassification!]!
  }

  type PermitContractorLink {
    role: String
    contractor: Contractor!
  }
`;

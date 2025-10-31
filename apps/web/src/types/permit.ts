import type { PermitType, PermitStatus, PropertyType } from "@prisma/client";

export interface ContractorClassification {
    classification: string;
}

export interface Contractor {
    id: string;
    licenseNo: string;
    name: string | null;
    mailingAddress: string | null;
    city: string | null;
    state: string | null;
    zipCode: string | null;
    phone: string | null;
    businessType: string | null;
    classifications: ContractorClassification[];
}

export interface PermitContractorLink {
    role: string | null;
    contractor: Contractor;
}

export interface Permit {
    id: string;
    permitNumber: string;
    title: string | null;
    description: string | null;
    address: string | null;
    city: string | null;
    state: string | null;
    zipCode: string | null;
    propertyType: PropertyType | null;
    permitType: PermitType | null;
    status: PermitStatus | null;
    value: number | null;
    appliedDate: string | null;
    appliedDateString: string | null;
    contractors?: PermitContractorLink[];
}

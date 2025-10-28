import type { PermitType, PermitStatus } from "@prisma/client";

export interface Permit {
    id: string;
    permitNumber: string;
    title: string | null;
    description: string | null;
    address: string | null;
    city: string | null;
    state: string | null;
    zipCode: string | null;
    permitType: PermitType | null;
    status: PermitStatus | null;
    value: number | null;
    issuedDate: string | null;
    issuedDateString: string | null;
}

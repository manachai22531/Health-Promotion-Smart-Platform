export type EntityId = string;
export type IsoDate = string;
export type IsoDateTime = string;
export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export interface AuditedEntity {
  id: EntityId;
  createdAt?: IsoDateTime;
  updatedAt?: IsoDateTime;
  revision?: number;
}

export interface Patient extends AuditedEntity {
  patientId?: string | number | null;
  hn?: string;
  hnOld?: string;
  identificationNumber?: string;
  passportNumber?: string;
  title?: string;
  firstName: string;
  lastName: string;
  prefixEN?: string;
  firstNameEN?: string;
  lastNameEN?: string;
  birthDate?: IsoDate;
  gender?: string;
  phoneNumber?: string;
  email?: string;
  address?: string;
  nationality?: string;
}

export interface Visit extends AuditedEntity {
  visitUID: string;
  hn: string;
  visitDate?: IsoDateTime;
  location?: string;
  doctorNumber?: string;
  status?: string;
  items?: JsonValue[];
  packages?: JsonValue[];
}

export interface EMR extends AuditedEntity {
  hn: string;
  visitUID: string;
  patient?: Partial<Patient>;
  lineItems?: JsonValue[];
  diagnoses?: JsonValue[];
  unstructured?: JsonValue;
  raw?: JsonValue;
}

export interface HealthPackage extends AuditedEntity {
  code: string;
  name: string;
  category?: string;
  subcategory?: string;
  price?: number | null;
  usageCondition?: string;
  active?: boolean;
  sourceData?: JsonValue;
}

export interface Booking extends AuditedEntity {
  patientId?: EntityId;
  hn?: string;
  projectId?: EntityId;
  appointmentDate?: IsoDateTime;
  locationCode?: string;
  doctorCode?: string;
  status?: string;
  note?: string;
}

export interface Project extends AuditedEntity {
  companyId?: EntityId;
  name: string;
  startDate?: IsoDate;
  endDate?: IsoDate;
  screeningYear?: string;
  note?: string;
  active?: boolean;
}

export interface Permission {
  key: string;
  name?: string;
  description?: string;
  enabled?: boolean;
}

export interface Role extends AuditedEntity {
  name: string;
  description?: string;
  permissions: Array<Permission | string>;
  active?: boolean;
}

export interface User extends AuditedEntity {
  username: string;
  displayName?: string;
  email?: string;
  roleId?: EntityId;
  role?: Role;
  active?: boolean;
  lastLoginAt?: IsoDateTime;
}

/** Existing JSON state shape; legacy field names remain unchanged on purpose. */
export interface LegacyPatientRecord extends Record<string, unknown> {
  key?: string;
  id?: string;
  companyId?: string;
  hn?: string;
  title?: string;
  first?: string;
  last?: string;
  birth?: string;
  sex?: string;
  code?: string;
  packageName?: string;
  visitedAt?: IsoDateTime | null;
}

export interface LegacyPackageRecord extends Record<string, unknown> {
  id?: string;
  code?: string;
  packagecode?: string;
  name?: string;
  packagename?: string;
  price?: number | string;
}

export interface LegacyCompanyRecord extends Record<string, unknown> {
  id?: string;
  name?: string;
  year?: string;
}

export interface AppState extends Record<string, unknown> {
  _revision?: number;
  at?: IsoDateTime;
  records?: LegacyPatientRecord[];
  packages?: LegacyPackageRecord[];
  companies?: LegacyCompanyRecord[];
  users?: User[];
  roles?: Role[];
}

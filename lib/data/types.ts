/**
 * Pet10x — Domain types (single source of truth for data shapes).
 *
 * This is the staging ground for the Supabase schema (Phase 1). It mirrors the
 * data shapes the UI uses today so the app renders identically, with light
 * forward-looking additions (extra roles, `ownerId`, `EntitlementSource`).
 *
 * Conventions:
 * - Keep this file platform-agnostic (no React, no lucide, no next/* imports) so
 *   it can move into `packages/core` and be shared by web + mobile + Edge Functions.
 * - IDs are numeric today to match existing component state (`useState<number>`,
 *   `Set<number>`). Phase 1 migrates these to DB uuid strings behind the hooks.
 * - Icons are stored as string `iconKey`s and resolved to components in the view.
 */

/* ------------------------------------------------------------------ */
/* Enums / unions                                                      */
/* ------------------------------------------------------------------ */

export type Species = "dog" | "cat" | "bird" | "small_mammal" | "fish" | "reptile" | "other"
export type PetStatus = "home" | "away" | "at-vet" | "vacation"
export type VaccinationStatus = "current" | "expiring" | "expired"
export type DocumentStatus = "Valid" | "Expiring" | "Approved" | "Active" | "Expired"
export type ResidentStatus = "compliant" | "non-compliant" | "pending"
export type ApprovalStatus = "pending" | "approved" | "denied"
export type AccommodationType = "ESA" | "Service Animal"
export type IncidentType = "noise" | "aggressive" | "off-leash" | "waste" | "damage" | "other"
export type LostFoundType = "lost" | "found"

export type ViolationStage =
  | "investigation"
  | "pending-review"
  | "verbal-warning"
  | "written-warning"
  | "fine-issued"
export type ViolationTab = "active" | "warnings" | "fines" | "resolved"

export type NotificationCategory = "compliance" | "incident" | "building"
export type NotificationSeverity = "warning" | "error" | "info" | "success"

/**
 * Roles — the current app only uses `pet-owner` and `building-manager` (hyphenated).
 * `super-admin` and `business` are reserved for later phases. Phase 1 maps these to
 * the DB enum `user_role` (pet_owner | building_manager | super_admin | business).
 */
export type UserRole = "pet-owner" | "building-manager" | "super-admin" | "business"

/** Premium entitlement source — forward-looking, unused until Phase 2. */
export type EntitlementSource =
  | "individual_stripe"
  | "individual_iap"
  | "building_sponsored"
  | "complimentary"

/* ------------------------------------------------------------------ */
/* Identity                                                            */
/* ------------------------------------------------------------------ */

export interface AppUser {
  id: string
  name: string
  email: string
  avatar: string
  unit: string
  building: string
  role: UserRole
  roleLabel: string
  description: string
  memberSince: string
  plan: string
  petCount: number
}

export interface GuestSession {
  buildingCode: string
  buildingName: string
}

/* ------------------------------------------------------------------ */
/* Pets                                                                */
/* ------------------------------------------------------------------ */

export type PetDocumentIconKey =
  | "license"
  | "vaccination"
  | "registration"
  | "microchip"
  | "insurance"

export interface Vaccination {
  name: string
  date: string
  expiry: string
  status: VaccinationStatus
}

export interface EmergencyContact {
  role: string
  name: string
  phone: string
}

export interface PetDocument {
  name: string
  status: DocumentStatus
  expiry: string
  iconKey: PetDocumentIconKey
}

export interface PetActivityEntry {
  type: "compliance" | "status" | "document"
  text: string
  time: string
}

export interface PetMedicalInfo {
  conditions: string
  medications: string
  allergies: string
  behavioralNotes: string
  vetClinic: string
  vetName: string
  vetDistance: string
}

export type CareKind = "meal" | "medication" | "water" | "walk" | "grooming" | "other"

/** A recurring daily care task (checked off in the Care tracker). */
export interface CareTask {
  id: string
  label: string
  detail?: string
  time: string
  kind: CareKind
}

export interface FeedingMeal {
  id: string
  name: string
  time: string
  portion: string
  food: string
}

export interface Medication {
  id: string
  name: string
  dosage: string
  frequency: string
  nextDue: string
  reminder: boolean
}

/* ---- Care logging (food / medicine / treat trackers) ---- */

export type CareEntryKind = "food" | "medicine" | "treat" | "water" | "walk" | "weight" | "potty" | "other"

export interface CareEntry {
  id: string
  petId: string
  kind: CareEntryKind
  label?: string
  amount?: number | null
  unit?: string | null
  note?: string | null
  loggedAt: string
}

export interface CareTarget {
  kind: CareEntryKind
  targetAmount?: number | null
  unit?: string | null
}

export interface Pet {
  id: string
  ownerId: string
  name: string
  species: Species
  breed: string
  status: PetStatus
  image: string
  compliance: number
  /* Rich profile fields — present on full records, omitted on summary projections. */
  dob?: string
  age?: string
  gender?: string
  weight?: string
  color?: string
  microchip?: string
  neutered?: boolean
  medical?: PetMedicalInfo
  vaccinations?: Vaccination[]
  emergencyContacts?: EmergencyContact[]
  documents?: PetDocument[]
  activity?: PetActivityEntry[]
  careRoutine?: CareTask[]
  feeding?: FeedingMeal[]
  medications?: Medication[]
}

/* ------------------------------------------------------------------ */
/* Community                                                           */
/* ------------------------------------------------------------------ */

export interface CommunityPost {
  id: number
  author: string
  avatar: string
  unit: string
  time: string
  category: string
  content: string
  image?: string
  likes: number
  comments: number
  liked: boolean
}

export interface LostFoundItem {
  id: number
  type: LostFoundType
  petName: string
  species: Species
  breed: string
  color: string
  lastSeen: string
  time: string
  image: string
  reward?: string
  status: "active" | "resolved"
}

export interface CommunityEvent {
  id: number
  title: string
  date: string
  time: string
  location: string
  attendees: number
  maxAttendees: number
  category: string
}

/* ------------------------------------------------------------------ */
/* Services                                                            */
/* ------------------------------------------------------------------ */

export interface ServiceProvider {
  id: number
  name: string
  category: string
  rating: number
  reviews: number
  distance: string
  image: string
  priceRange: string
  isOpen: boolean
  featured?: boolean
  tags?: string[]
  nextAvailable?: string | null
}

/* ------------------------------------------------------------------ */
/* Notifications / alerts                                              */
/* ------------------------------------------------------------------ */

export type NotificationIconKey =
  | "syringe"
  | "alert"
  | "file"
  | "check"
  | "calendar"
  | "shield"

export interface AppNotification {
  id: number
  category: NotificationCategory
  severity: NotificationSeverity
  title: string
  body: string
  time: string
  read: boolean
  actionLabel?: string
  iconKey: NotificationIconKey
}

/** Lighter "recent activity" alerts shown on the owner home screen. */
export interface HomeAlert {
  id: number
  type: "warning" | "info" | "success"
  title: string
  body: string
  time: string
}

/* ------------------------------------------------------------------ */
/* Manager: residents, approvals, violations                          */
/* ------------------------------------------------------------------ */

export interface ResidentPet {
  name: string
  species: Species
  breed: string
  weight: string
  compliant: boolean
}

export interface ResidentViolationSummary {
  type: string
  date: string
  stage: string
}

export interface ResidentBilling {
  outstanding: number
  lastPayment: string
}

export interface Resident {
  id: number
  unit: string
  floor: number
  resident: string
  status: ResidentStatus
  pets: ResidentPet[]
  billing: ResidentBilling
  violations: ResidentViolationSummary[]
}

export interface RegistrationDocuments {
  vaccination: boolean
  license: boolean
  insurance: boolean
}

export interface Registration {
  id: number
  unit: string
  resident: string
  species: Species
  name: string
  breed: string
  weight: string
  age: string
  submitted: string
  status: ApprovalStatus
  flags: string[]
  documents: RegistrationDocuments
}

export interface AccommodationDocuments {
  letterFromProvider: boolean
  providerLicense: boolean
  animalDescription: boolean
  vaccination: boolean
}

export interface AccommodationRequest {
  id: number
  unit: string
  resident: string
  type: AccommodationType
  animal: string
  submitted: string
  status: ApprovalStatus
  documents: AccommodationDocuments
  legalNote: string
}

export interface DocumentReviewItem {
  id: number
  unit: string
  resident: string
  pet: string
  type: string
  expiring: string
  status: "expiring" | "current"
}

export interface ViolationHistoryStep {
  stage: string
  date: string
}

export interface Violation {
  id: number
  unit: string
  resident: string
  pet: string
  type: string
  date: string
  stage: ViolationStage
  stageLabel: string
  amount: number
  paid: boolean
  history: ViolationHistoryStep[]
  tab: ViolationTab
}

export interface ResolvedViolation {
  id: number
  unit: string
  type: string
  resolved: string
  outcome: string
}

/* ------------------------------------------------------------------ */
/* Manager: dashboard                                                  */
/* ------------------------------------------------------------------ */

export interface UrgentItem {
  id: number
  title: string
  body: string
  severity: "critical" | "high"
  time: string
}

export type ManagerActivityIconKey = "approval" | "gavel" | "file" | "alert"

export interface ManagerActivityEntry {
  id: number
  action: string
  detail: string
  time: string
  iconKey: ManagerActivityIconKey
}

/* ------------------------------------------------------------------ */
/* Buildings                                                           */
/* ------------------------------------------------------------------ */

export interface BuildingStats {
  /** Owner-facing building compliance (home screen hero). */
  ownerComplianceScore: number
  /** Manager-facing building compliance (dashboard hero). */
  buildingComplianceScore: number
  totalPets: number
  dogs: number
  cats: number
  esa: number
  serviceAnimals: number
  largeBreedExemptions: number
  riskScore: number
  openIncidents: number
  upcomingEvents: number
  nonCompliantUnits: number
  registered: number
  activeViolations: number
  pendingApprovals: number
}

export interface Building {
  id: number
  name: string
  address: string
  code: string
  stats: BuildingStats
}

/* Emergency directory — the token-gated public surface. */

export interface EmergencyPet {
  name: string
  species: Species
  notes: string
  emergency: string
}

export interface EmergencyUnit {
  unit: string
  pets: EmergencyPet[]
}

export interface EmergencyFloor {
  floor: number
  units: EmergencyUnit[]
}

export interface EmergencyBuildingDirectory {
  name: string
  address: string
  totalPets: number
  dogs: number
  cats: number
  floors: EmergencyFloor[]
}

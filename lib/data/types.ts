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

import type { Database } from "@/lib/supabase/database.types"

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

/**
 * The enforcement ladder, taken from the database enum rather than restated.
 *
 * This used to be five hand-written hyphenated labels with a lookup table
 * translating the DB's underscored ones into them. The translation is what
 * made the drift possible: when Phase 2 replaced the enum, the map still held
 * the old labels, the compiler was happy, and two of the six real stages
 * silently resolved to `undefined`. There is nothing for the app vocabulary to
 * add over the database's — `fine_1` is already the clearest name for that
 * rung — so the alias is the type now, and regenerating `database.types.ts`
 * after any future enum change breaks the build instead of the runtime.
 *
 * A type-only import, so this file stays platform-agnostic as its header asks.
 */
export type ViolationStage = Database["public"]["Enums"]["violation_stage_v2"]

/**
 * `disputed` is scaffolding for Phase 5 (AD-7): cases with an appeal awaiting a
 * manager's decision are routed here so they are not buried under the fine they
 * dispute. The tab's contents are built in that phase.
 */
export type ViolationTab = "active" | "warnings" | "fines" | "disputed" | "resolved"

export type NotificationCategory = "compliance" | "incident" | "building" | "assistant" | "care"
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
  onboarded: boolean
  isSuperAdmin: boolean
  isSuspended: boolean
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
  vetPhone?: string
  vetDistance?: string
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

/** Mirrors the `care_entry_kind` enum. `play`/`outing` exist because "walk"
 *  is a dog's word — a cat has playtime and time outdoors. */
export type CareEntryKind =
  | "food"
  | "medicine"
  | "treat"
  | "water"
  | "walk"
  | "play"
  | "outing"
  | "weight"
  | "potty"
  | "other"

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

/**
 * A single care goal. Several may share a `kind` — two medications, three
 * treat types — which is why this carries an id and a label rather than being
 * keyed by kind alone.
 */
export interface CareTarget {
  id: string
  petId: string
  kind: CareEntryKind
  label: string
  targetAmount?: number | null
  unit?: string | null
  /** 'day' | 'week' — a weekly walk goal is as reasonable as a daily one. */
  period: "day" | "week"
  sortOrder: number
  isActive: boolean
}

/* ---- Pet documents / vaccinations / contacts (live, from child tables) ---- */

export type PetDocKind =
  | "vaccination"
  | "municipal_license"
  | "liability_insurance"
  | "building_registration"
  | "microchip_registration"
  | "esa_letter"
  | "other"

export interface PetDoc {
  id: string
  petId: string
  kind: PetDocKind
  name: string | null
  status: string
  storagePath: string | null
  expiresOn: string | null
  verifiedAt: string | null
}

export interface PetVaccinationRecord {
  id: string
  petId: string
  name: string
  givenOn: string | null
  expiresOn: string | null
  status: string
}

export interface PetContact {
  id: string
  petId: string
  role: string
  name: string
  phone: string
  sortOrder: number | null
}

/* ---- Building membership (resident links) ---- */

export type ResidentLinkStatus = "pending" | "approved" | "denied" | "revoked" | "left"

export interface BuildingLink {
  linkId: string
  buildingId: string
  buildingName: string
  status: ResidentLinkStatus
  unit: string | null
  requestedAt: string
  /**
   * The building's own address. A linked resident's address IS this plus their
   * unit, so it is read from here rather than retyped — otherwise a manager
   * correcting it changes nothing on the resident's side.
   */
  buildingAddress: string | null
  buildingCity: string | null
  buildingRegion: string | null
  buildingPostalCode: string | null
}

export interface ResidentLinkRow {
  linkId: string
  profileId: string
  buildingId: string | null
  status: ResidentLinkStatus
  unit: string | null
  requestedAt: string
  residentName: string
  residentEmail: string | null
  residentPhone: string | null
  /** When a manager last asked for missing details. Null = never asked. */
  infoRequestedAt: string | null
}

export interface ManagerPet {
  id: string
  ownerId: string
  buildingId: string | null
  name: string
  species: Species
  breed: string
  compliancePct: number
  missing: string[]
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
  /** small | medium | large | xlarge. Advisory — never blocks registration. */
  sizeBand?: string
  /** Height at the shoulder, cm. */
  heightCm?: number
  /** Several apply at once: harnessed AND muzzled is normal. */
  restraints?: string[]
  dietType?: string
  dietNotes?: string
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
  id: string
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
  | "sparkles"

export interface AppNotification {
  id: string
  category: NotificationCategory
  severity: NotificationSeverity
  title: string
  body: string
  time: string
  read: boolean
  actionLabel?: string
  /**
   * `notifications.action_target` — a `screen` or `screen:id` key for
   * `app/app/page.tsx`'s router, resolved through `resolveActionTarget`.
   *
   * A label without a resolvable target renders NO button. The column has been
   * written by five migrations and two API routes since June and was read by
   * nothing until Phase 3; the button beside the label called
   * `toast.success(actionLabel)` and went nowhere.
   */
  actionTarget?: string
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
  id: string
  buildingId: string | null
  unit: string
  resident: string
  species: Species
  name: string
  breed: string
  weight: string
  age: string
  submitted: string
  /** Raw ISO created_at — used for queue urgency/aging. */
  createdAt: string
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
  id: string
  buildingId: string | null
  unit: string
  resident: string
  type: AccommodationType
  animal: string
  submitted: string
  /** Raw ISO created_at — used for queue urgency/aging. */
  createdAt: string
  status: ApprovalStatus
  documents: AccommodationDocuments
  legalNote: string
}

export interface DocumentReviewItem {
  id: string
  buildingId: string | null
  unit: string
  resident: string
  pet: string
  type: string
  expiring: string
  /** Raw ISO expires_on — used for queue urgency/aging. */
  expiresOn: string | null
  status: "expiring" | "current"
}

export interface ViolationHistoryStep {
  stage: string
  date: string
}

export interface Violation {
  id: string
  buildingId: string | null
  unit: string
  resident: string
  pet: string
  type: string
  date: string
  stage: ViolationStage
  stageLabel: string
  /** Every fine on the case, whatever its status. This is "issued", not "owed". */
  amount: number
  /**
   * The part of `amount` still owed — computed by `summariseFines`, which is
   * also what `useOutstandingFines` filters on, so the manager's screen and the
   * strata overview cannot disagree. `amount - outstanding` is what has been
   * paid, waived, remitted or written off.
   */
  outstanding: number
  /** The part of `outstanding` under appeal (`fines.status = 'disputed'`). */
  disputed: number
  /**
   * True when at least one fine reads `issued` — the exact predicate
   * `manager_remind_fine` applies. Gates "Send Reminder", so the button renders
   * only where the RPC will act.
   */
  chaseable: boolean
  /** Every fine on the case reads `paid`. Narrower than `outstanding === 0`. */
  paid: boolean
  history: ViolationHistoryStep[]
  tab: ViolationTab
}

export interface ResolvedViolation {
  id: string
  buildingId: string | null
  unit: string
  type: string
  resolved: string
  outcome: string
}

/* ------------------------------------------------------------------ */
/* Manager: dashboard                                                  */
/* ------------------------------------------------------------------ */

export interface UrgentItem {
  id: string
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

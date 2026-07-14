/**
 * Pet10x — Data-access seam (hooks).
 *
 * Pets, care, building links, residents, businesses and admin all read LIVE
 * Supabase data (see ./live, ./business, ./admin). The remaining domains below
 * (community, events, notifications, the manager violation/approval queues and
 * the emergency directory) don't have a write path wired yet, so they return
 * EMPTY data — screens render honest empty states instead of placeholder/mock
 * content. Each becomes a Supabase query when its feature is built.
 */

import type {
  AccommodationRequest,
  Building,
  CommunityEvent,
  DocumentReviewItem,
  EmergencyBuildingDirectory,
  HomeAlert,
  LostFoundItem,
  ManagerActivityEntry,
  Registration,
  Resident,
  ResolvedViolation,
  ServiceProvider,
  UrgentItem,
  Violation,
} from "./types"

/** The result shape every data hook returns (mirrors React Query). */
export interface QueryResult<T> {
  data: T
  isLoading: boolean
  error: Error | null
}

function resolved<T>(data: T): QueryResult<T> {
  return { data, isLoading: false, error: null }
}

const EMPTY_BUILDING: Building = {
  id: 0,
  name: "",
  address: "",
  code: "",
  stats: {
    ownerComplianceScore: 0,
    buildingComplianceScore: 0,
    totalPets: 0,
    dogs: 0,
    cats: 0,
    esa: 0,
    serviceAnimals: 0,
    largeBreedExemptions: 0,
    riskScore: 0,
    openIncidents: 0,
    upcomingEvents: 0,
    nonCompliantUnits: 0,
    registered: 0,
    activeViolations: 0,
    pendingApprovals: 0,
  },
}

const EMPTY_DIRECTORY: EmergencyBuildingDirectory = {
  name: "",
  address: "",
  totalPets: 0,
  dogs: 0,
  cats: 0,
  floors: [],
}

/* Pets + care live in ./live · businesses in ./business · admin in ./admin. */

/* ----------------------------- Community -------------------------- */
/* useCommunityPosts is now LIVE — see ./live. */

export function useLostFound(): QueryResult<LostFoundItem[]> {
  return resolved([])
}

export function useEvents(): QueryResult<CommunityEvent[]> {
  return resolved([])
}

/* ----------------------------- Services --------------------------- */
/* The real services directory lives in ./business (useNearbyBusinesses). */

export function useServiceProviders(): QueryResult<ServiceProvider[]> {
  return resolved([])
}

/* --------------------------- Notifications ------------------------ */
/* useNotifications is now LIVE — see ./live. */

export function useHomeAlerts(): QueryResult<HomeAlert[]> {
  return resolved([])
}

/* ------------------------- Manager: residents --------------------- */
/* The real resident queue lives in ./live (useBuildingResidents). */

export function useResidents(): QueryResult<Resident[]> {
  return resolved([])
}

/* ------------------------- Manager: approvals --------------------- */

/* These are now backed by real rows — see `./manager-queues`. They were stubs
 * returning [] while the screens displayed invented counts. */
export { useRegistrationsLive as useRegistrations } from "./manager-queues"
export { useAccommodationsLive as useAccommodations } from "./manager-queues"
export { useDocumentsReviewLive as useDocumentsReview } from "./manager-queues"

/* ------------------------- Manager: violations -------------------- */

export { useViolationsLive as useViolations } from "./manager-queues"
export { useResolvedViolationsLive as useResolvedViolations } from "./manager-queues"

/* ------------------------- Manager: dashboard --------------------- */

export function useUrgentItems(): QueryResult<UrgentItem[]> {
  return resolved([])
}

export function useManagerActivity(): QueryResult<ManagerActivityEntry[]> {
  return resolved([])
}

/* ----------------------------- Buildings -------------------------- */
/* Real managed-building metrics are computed in the dashboard from
 * useBuildingResidents + useBuildingPets; this stays empty. */

export function useBuilding(): QueryResult<Building> {
  return resolved(EMPTY_BUILDING)
}

export function useEmergencyDirectory(_code?: string): QueryResult<EmergencyBuildingDirectory> {
  return resolved(EMPTY_DIRECTORY)
}

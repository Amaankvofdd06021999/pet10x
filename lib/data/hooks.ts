/**
 * Pet10x — Data-access seam (hooks).
 *
 * Screens read all data through these hooks instead of importing mock arrays
 * directly. Today each hook returns the consolidated mock data instantly.
 *
 * PHASE 1 SWAP: each hook body becomes a Supabase query wrapped in React Query
 * (`useQuery`), returning the same `{ data, isLoading, error }` shape — so the
 * screens consuming these hooks do not need to change. This is the single seam
 * between the UI and the backend.
 */

import {
  ACCOMMODATIONS,
  BUILDINGS,
  COMMUNITY_POSTS,
  DOCUMENTS_REVIEW,
  EMERGENCY_DIRECTORY,
  EVENTS,
  HOME_RECENT_ALERTS,
  LOST_FOUND,
  MANAGER_RECENT_ACTIVITY,
  NOTIFICATIONS,
  PETS,
  REGISTRATIONS,
  RESIDENTS,
  RESOLVED_VIOLATIONS,
  SERVICE_PROVIDERS,
  URGENT_ITEMS,
  VIOLATIONS,
} from "./mock-data"
import type {
  AccommodationRequest,
  AppNotification,
  Building,
  CommunityEvent,
  CommunityPost,
  DocumentReviewItem,
  EmergencyBuildingDirectory,
  HomeAlert,
  LostFoundItem,
  ManagerActivityEntry,
  Pet,
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

/** Wrap a synchronous mock value in the query-result shape. */
function resolved<T>(data: T): QueryResult<T> {
  return { data, isLoading: false, error: null }
}

/* ------------------------------- Pets ----------------------------- */

export function usePets(): QueryResult<Pet[]> {
  return resolved(PETS)
}

/** A single pet by id — defaults to the owner's primary pet (Max). */
export function usePet(id = 1): QueryResult<Pet | undefined> {
  return resolved(PETS.find((p) => p.id === id))
}

/* ----------------------------- Community -------------------------- */

export function useCommunityPosts(): QueryResult<CommunityPost[]> {
  return resolved(COMMUNITY_POSTS)
}

export function useLostFound(): QueryResult<LostFoundItem[]> {
  return resolved(LOST_FOUND)
}

export function useEvents(): QueryResult<CommunityEvent[]> {
  return resolved(EVENTS)
}

/* ----------------------------- Services --------------------------- */

export function useServiceProviders(): QueryResult<ServiceProvider[]> {
  return resolved(SERVICE_PROVIDERS)
}

/* --------------------------- Notifications ------------------------ */

export function useNotifications(): QueryResult<AppNotification[]> {
  return resolved(NOTIFICATIONS)
}

export function useHomeAlerts(): QueryResult<HomeAlert[]> {
  return resolved(HOME_RECENT_ALERTS)
}

/* ------------------------- Manager: residents --------------------- */

export function useResidents(): QueryResult<Resident[]> {
  return resolved(RESIDENTS)
}

/* ------------------------- Manager: approvals --------------------- */

export function useRegistrations(): QueryResult<Registration[]> {
  return resolved(REGISTRATIONS)
}

export function useAccommodations(): QueryResult<AccommodationRequest[]> {
  return resolved(ACCOMMODATIONS)
}

export function useDocumentsReview(): QueryResult<DocumentReviewItem[]> {
  return resolved(DOCUMENTS_REVIEW)
}

/* ------------------------- Manager: violations -------------------- */

export function useViolations(): QueryResult<Violation[]> {
  return resolved(VIOLATIONS)
}

export function useResolvedViolations(): QueryResult<ResolvedViolation[]> {
  return resolved(RESOLVED_VIOLATIONS)
}

/* ------------------------- Manager: dashboard --------------------- */

export function useUrgentItems(): QueryResult<UrgentItem[]> {
  return resolved(URGENT_ITEMS)
}

export function useManagerActivity(): QueryResult<ManagerActivityEntry[]> {
  return resolved(MANAGER_RECENT_ACTIVITY)
}

/* ----------------------------- Buildings -------------------------- */

/** The current/primary building (multi-building support arrives in Phase 3). */
export function useBuilding(): QueryResult<Building> {
  return resolved(BUILDINGS[0])
}

/**
 * The emergency pet directory for a building. The `code`/token is ignored in the
 * mock; Phase 4 resolves it from `emergency_access_tokens` with server-enforced
 * expiry.
 */
export function useEmergencyDirectory(_code?: string): QueryResult<EmergencyBuildingDirectory> {
  return resolved(EMERGENCY_DIRECTORY)
}

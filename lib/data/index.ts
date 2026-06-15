/**
 * Pet10x — Data layer public surface.
 *
 * Import everything data-related from `@/lib/data`:
 *   import { usePets, type Pet } from "@/lib/data"
 *
 * - `./types`     — domain types (the shape of every entity)
 * - `./hooks`     — the data-access seam screens consume (mock now, Supabase later)
 * - `./mock-data` — raw seed data (also used directly by auth + as the Phase-1 seed)
 */

export * from "./types"
export * from "./hooks"
export * from "./live"
export {
  MOCK_USERS,
  VALID_BUILDING_CODES,
  resolveBuildingCode,
  DEMO_ROLES,
  type DemoRole,
} from "./mock-data"

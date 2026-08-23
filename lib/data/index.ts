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
export * from "./care-schedule"
export * from "./selected-pet"
export * from "./completeness"
export * from "./breeds"
/* Phase 6. Both are PURE (no "use client", no Supabase import) so they are
 * reachable from vitest's `environment: "node"`; the hooks and mutations that
 * use them live in `./building-rules-live`, which is deliberately NOT
 * re-exported here — importing this barrel from a server component must not
 * drag a browser client in. */
export * from "./building-rules"
export * from "./fine-schedule"
export {
  MOCK_USERS,
  VALID_BUILDING_CODES,
  resolveBuildingCode,
  DEMO_ROLES,
  type DemoRole,
} from "./mock-data"

"use client"

/**
 * Pet10x — accommodation requests against the live database.
 *
 * The impure half of `accommodations.ts`: React hooks and four RPC wrappers.
 * Nothing here holds a rule — vitest runs `environment: "node"` with no DOM and
 * no session, so every decision lives in the pure module and is tested there.
 *
 * RLS IS THE FLOOR, THE QUERY IS THE FILTER. `useAccommodationsLive` filters
 * drafts out explicitly even though `accom_select` now excludes them for a
 * manager as well. Both are correct and both are wanted: a screen that relies
 * on a policy to scope its query is a screen that shows the wrong thing the day
 * the policy is widened, and `event_rsvps` is this database's worked example of
 * the quieter failure in the other direction — two seeded rows read as one, to
 * every actor, with no error anywhere.
 */

import { useCallback, useEffect, useState } from "react"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import type { LiveResult } from "./live"
import type { Database } from "@/lib/supabase/database.types"
import {
  type AccommodationDocumentRow,
  type AccommodationStatus,
  type AccommodationType,
  type DocKind,
} from "./accommodations"

/** One request as the screens read it. `legalNote` is manager-authored guidance. */
export interface AccommodationRequestView {
  id: string
  buildingId: string
  residentId: string
  residentName: string
  unit: string
  petId: string | null
  petName: string | null
  type: AccommodationType
  status: AccommodationStatus
  animalDesc: string | null
  /** Manager-authored counsel. RLS lets the resident read it; the resident's screen does not render it. */
  legalNote: string | null
  decisionNote: string | null
  createdAt: string
  submittedAt: string | null
  decidedAt: string | null
  withdrawnAt: string | null
}

const SELECT = `id, building_id, resident_id, unit_id, pet_id, type, status, animal_desc,
                legal_note, decision_note, created_at, submitted_at, decided_at, withdrawn_at,
                resident:profiles!accommodation_requests_resident_id_fkey ( full_name ),
                unit:units ( unit_number ),
                pet:pets ( name )`

type RawRow = {
  id: string
  building_id: string
  resident_id: string
  unit_id: string | null
  pet_id: string | null
  type: AccommodationType
  status: AccommodationStatus
  animal_desc: string | null
  legal_note: string | null
  decision_note: string | null
  created_at: string
  submitted_at: string | null
  decided_at: string | null
  withdrawn_at: string | null
  resident: { full_name: string | null } | { full_name: string | null }[] | null
  unit: { unit_number: string } | { unit_number: string }[] | null
  pet: { name: string } | { name: string }[] | null
}

/** PostgREST returns an embedded one-to-one as an object or a single-element array depending on the hint. */
const first = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? (v[0] ?? null) : v)

function mapRequest(r: RawRow): AccommodationRequestView {
  return {
    id: r.id,
    buildingId: r.building_id,
    residentId: r.resident_id,
    residentName: first(r.resident)?.full_name ?? "Unknown",
    unit: first(r.unit)?.unit_number ?? "—",
    petId: r.pet_id,
    petName: first(r.pet)?.name ?? null,
    type: r.type,
    status: r.status,
    animalDesc: r.animal_desc,
    legalNote: r.legal_note,
    decisionNote: r.decision_note,
    createdAt: r.created_at,
    submittedAt: r.submitted_at,
    decidedAt: r.decided_at,
    withdrawnAt: r.withdrawn_at,
  }
}

/** The signed-in resident's own requests, DRAFTS INCLUDED — they are theirs. */
export function useMyAccommodations(): LiveResult<AccommodationRequestView[]> {
  const [data, setData] = useState<AccommodationRequestView[]>([])
  const [isLoading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    const supabase = getSupabaseBrowserClient()
    if (!supabase) {
      setLoading(false)
      return
    }
    setLoading(true)
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      setData([])
      setLoading(false)
      return
    }
    const { data: rows, error: err } = await supabase
      .from("accommodation_requests")
      .select(SELECT)
      .eq("resident_id", user.id)
      .order("created_at", { ascending: false })
    if (err) {
      setError(err.message)
      setData([])
      setLoading(false)
      return
    }
    setData(((rows ?? []) as unknown as RawRow[]).map(mapRequest))
    setError(null)
    setLoading(false)
  }, [])

  useEffect(() => {
    void refetch()
  }, [refetch])
  return { data, isLoading, error, refetch }
}

/**
 * Every request in the manager's queue — everything the policies show them,
 * minus drafts.
 *
 * `.neq("status", "draft")` is the query filter over the policy floor. Note it
 * does NOT filter to `pending` only: a withdrawn or decided request is still
 * shown, greyed, because a request that vanishes from the queue the moment it
 * is withdrawn leaves the manager unable to tell "handled" from "never
 * existed".
 */
export function useAccommodationsLive(): LiveResult<AccommodationRequestView[]> {
  const [data, setData] = useState<AccommodationRequestView[]>([])
  const [isLoading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    const supabase = getSupabaseBrowserClient()
    if (!supabase) {
      setLoading(false)
      return
    }
    setLoading(true)
    const { data: rows, error: err } = await supabase
      .from("accommodation_requests")
      .select(SELECT)
      .neq("status", "draft")
      .order("submitted_at", { ascending: false, nullsFirst: false })
    if (err) {
      setError(err.message)
      setData([])
      setLoading(false)
      return
    }
    setData(((rows ?? []) as unknown as RawRow[]).map(mapRequest))
    setError(null)
    setLoading(false)
  }, [])

  useEffect(() => {
    void refetch()
  }, [refetch])
  return { data, isLoading, error, refetch }
}

const DOC_SELECT =
  "id, request_id, kind, storage_path, verified, status, label, mime_type, size_bytes, uploaded_at, verified_at, review_note, purged_at"

type RawDoc = {
  id: string
  request_id: string
  kind: DocKind
  storage_path: string | null
  verified: boolean
  status: string
  label: string | null
  mime_type: string | null
  size_bytes: number | null
  uploaded_at: string
  verified_at: string | null
  review_note: string | null
  purged_at: string | null
}

function mapDoc(d: RawDoc): AccommodationDocumentRow {
  return {
    id: d.id,
    kind: d.kind,
    storagePath: d.storage_path,
    verified: d.verified,
    status: d.status,
    label: d.label,
    mimeType: d.mime_type,
    sizeBytes: d.size_bytes,
    uploadedAt: d.uploaded_at,
    verifiedAt: d.verified_at,
    reviewNote: d.review_note,
    purgedAt: d.purged_at,
  }
}

/**
 * The documents attached to one request.
 *
 * `requestId` may be undefined while a screen is still resolving its subject,
 * and while it is, this queries NOTHING rather than fetching every document the
 * policies would return and filtering in memory.
 */
export function useAccommodationDocuments(requestId: string | undefined): LiveResult<AccommodationDocumentRow[]> {
  const [data, setData] = useState<AccommodationDocumentRow[]>([])
  const [isLoading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    const supabase = getSupabaseBrowserClient()
    if (!supabase || !requestId) {
      setData([])
      setLoading(false)
      return
    }
    setLoading(true)
    const { data: rows, error: err } = await supabase
      .from("accommodation_documents")
      .select(DOC_SELECT)
      .eq("request_id", requestId)
      .order("uploaded_at", { ascending: true })
    if (err) {
      setError(err.message)
      setData([])
      setLoading(false)
      return
    }
    setData(((rows ?? []) as unknown as RawDoc[]).map(mapDoc))
    setError(null)
    setLoading(false)
  }, [requestId])

  useEffect(() => {
    void refetch()
  }, [refetch])
  return { data, isLoading, error, refetch }
}

/* ----------------------------- the four RPCs ----------------------------- */

function transportError(e: { message: string; hint?: string | null } | null): string | null {
  if (!e) return null
  const hint = e.hint?.trim()
  return hint ? `${e.message} ${hint}` : e.message
}

/**
 * Every structured `error` code the five RPCs return, mapped to a sentence.
 *
 * A `Record` and not a switch with a default, so a code added to any of them
 * later is a compile error here rather than a silent fall through to
 * "Something went wrong".
 */
const ERROR_SENTENCE: Record<string, string> = {
  forbidden: "That isn't yours to change.",
  not_found: "That request no longer exists.",
  illegal_transition: "That request has already moved on. Reload and look again.",
  checklist_incomplete: "Something required is still missing.",
  description_required: "Describe the animal and why you need it before sending this.",
  note_required: "A denial needs a reason. It is what defends the decision.",
  verdict_required: "Choose Verify or Reject.",
  request_closed: "That request has already been decided.",
  bad_path: "That file couldn't be attached. Try uploading it again.",
}

function sentenceFor(code: string | undefined): string {
  return (code && ERROR_SENTENCE[code]) || "That didn't go through. Try again."
}

export interface RpcOutcome {
  ok: boolean
  error: string | null
  /** `checklist_incomplete` names what is missing, so the form can say which. */
  missing?: string[]
  /** `manager_decide_accommodation` reports whether it also approved the pet. */
  petRegistrationApproved?: boolean
}

export async function submitAccommodationRequest(id: string): Promise<RpcOutcome> {
  const supabase = getSupabaseBrowserClient()
  if (!supabase) return { ok: false, error: "Not configured." }
  const { data, error } = await supabase.rpc("submit_accommodation_request", { p_request: id })
  if (error) return { ok: false, error: transportError(error) }
  const r = data as unknown as { ok: boolean; error?: string; missing?: string[] }
  if (!r.ok) return { ok: false, error: sentenceFor(r.error), missing: r.missing }
  return { ok: true, error: null }
}

export async function withdrawAccommodationRequest(id: string, reason?: string): Promise<RpcOutcome> {
  const supabase = getSupabaseBrowserClient()
  if (!supabase) return { ok: false, error: "Not configured." }
  const { data, error } = await supabase.rpc("withdraw_accommodation_request", {
    p_request: id,
    // `p_reason` has a SQL default, so `undefined` lets it apply; `null` would
    // also work but undefined keeps the default where it is written.
    p_reason: reason ?? undefined,
  })
  if (error) return { ok: false, error: transportError(error) }
  const r = data as unknown as { ok: boolean; error?: string }
  if (!r.ok) return { ok: false, error: sentenceFor(r.error) }
  return { ok: true, error: null }
}

export async function decideAccommodation(
  id: string,
  outcome: "approved" | "denied" | "info_requested",
  note?: string,
): Promise<RpcOutcome> {
  const supabase = getSupabaseBrowserClient()
  if (!supabase) return { ok: false, error: "Not configured." }
  const { data, error } = await supabase.rpc("manager_decide_accommodation", {
    p_request: id,
    p_outcome: outcome,
    p_note: note ?? undefined,
  })
  if (error) return { ok: false, error: transportError(error) }
  const r = data as unknown as { ok: boolean; error?: string; pet_registration_approved?: boolean }
  if (!r.ok) return { ok: false, error: sentenceFor(r.error) }
  return { ok: true, error: null, petRegistrationApproved: r.pet_registration_approved ?? false }
}

export async function verifyAccommodationDocument(
  documentId: string,
  verified: boolean,
  note?: string,
): Promise<RpcOutcome> {
  const supabase = getSupabaseBrowserClient()
  if (!supabase) return { ok: false, error: "Not configured." }
  const { data, error } = await supabase.rpc("manager_verify_accommodation_document", {
    p_document: documentId,
    p_verified: verified,
    p_note: note ?? undefined,
  })
  if (error) return { ok: false, error: transportError(error) }
  const r = data as unknown as { ok: boolean; error?: string }
  if (!r.ok) return { ok: false, error: sentenceFor(r.error) }
  return { ok: true, error: null }
}

/**
 * Open a draft for this resident in this building.
 *
 * THE DRAFT IS CREATED BEFORE ANY DOCUMENT IS UPLOADED, AND THAT IS LOAD-BEARING.
 * The `accommodation-docs` storage policies key on the REQUEST ID (path segment
 * 2), so a request row has to exist before a document can attach to it. Do not
 * "simplify" this into an insert at submit time — every upload would break, and
 * the failure would be a 403 from storage with no obvious cause.
 *
 * `status: "draft"` is explicit because the column DEFAULTS to 'pending' and
 * `accom_resident_insert` requires 'draft'. Omitting it is refused by RLS
 * rather than silently filed.
 */
export async function createAccommodationDraft(
  buildingId: string,
  type: AccommodationType,
): Promise<{ id: string | null; error: string | null }> {
  const supabase = getSupabaseBrowserClient()
  if (!supabase) return { id: null, error: "Not configured." }
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { id: null, error: "Sign in first." }

  const { data, error } = await supabase
    .from("accommodation_requests")
    .insert({ building_id: buildingId, resident_id: user.id, type, status: "draft" })
    .select("id")
    .single()
  if (error) return { id: null, error: transportError(error) }
  return { id: data.id, error: null }
}

/**
 * Amend a draft (or a request a manager has asked more about).
 *
 * Only the resident's own columns, only while it is theirs to correct. Both
 * halves are enforced by `accom_resident_update` and again by
 * `accommodation_requests_freeze`; this signature simply cannot express
 * anything else.
 */
export async function updateAccommodationDraft(
  id: string,
  patch: { type?: AccommodationType; animalDesc?: string; petId?: string | null; unitId?: string | null },
): Promise<{ error: string | null }> {
  const supabase = getSupabaseBrowserClient()
  if (!supabase) return { error: "Not configured." }
  // Typed against the generated Update shape rather than Record<string,
  // unknown>, so a column this function has no business writing — `status`,
  // `decided_by` — is a compile error here and not merely a policy refusal at
  // runtime.
  const row: Database["public"]["Tables"]["accommodation_requests"]["Update"] = {}
  if (patch.type !== undefined) row.type = patch.type
  if (patch.animalDesc !== undefined) row.animal_desc = patch.animalDesc
  if (patch.petId !== undefined) row.pet_id = patch.petId
  if (patch.unitId !== undefined) row.unit_id = patch.unitId
  if (Object.keys(row).length === 0) return { error: null }

  const { error, count } = await supabase
    .from("accommodation_requests")
    .update(row, { count: "exact" })
    .eq("id", id)
  if (error) return { error: transportError(error) }
  // RLS filters rather than raises. Zero rows means the window closed — the
  // request was submitted or decided while this form was open — and reporting
  // success would leave the resident believing an edit landed that did not.
  if (!count) return { error: "That request can no longer be edited." }
  return { error: null }
}

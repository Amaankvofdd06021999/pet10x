/**
 * Pet10x — accommodation requests: the pure rules.
 *
 * WHAT THIS FILE REPLACES. `lib/data/manager-queues.ts:207-212` built a
 * manager's documentation checklist out of four booleans, two of which were
 * LITERAL `true`:
 *
 *     documents: {
 *       letterFromProvider: true,          // <- a literal
 *       providerLicense: r.type === "service_animal",
 *       animalDescription: !!r.animal_desc,
 *       vaccination: true,                 // <- a literal
 *     }
 *
 * So every manager saw green ticks for documents nobody had uploaded — and
 * nobody COULD have uploaded, because until this phase nothing in the product
 * ever wrote an `accommodation_documents` row. `checklistFor` below is where
 * those four booleans die.
 *
 * `animalDescription` was never a document. It is `animal_desc` on the request,
 * so it becomes a checklist item sourced from the request rather than from the
 * documents table — visibly, rather than by pretending it is a file.
 *
 * Pure on purpose: vitest here is `environment: "node"` with no jsdom, so this
 * module is the only part of the phase a test can reach.
 */

export type AccommodationType = "esa" | "service_animal"

export type AccommodationStatus =
  | "draft"
  | "pending"
  | "approved"
  | "denied"
  | "info_requested"
  | "withdrawn"

/** The `doc_kind` labels this phase uses. The enum has eight; these four apply. */
export type DocKind = "esa_letter" | "provider_license" | "vaccination" | "other"

/**
 * What a request of each type MUST carry before it may be submitted.
 *
 * MIRRORS `public.accommodation_required_kinds(accommodation_type)` in
 * 20260827000003_accommodation_rpcs.sql, which is what actually refuses a
 * submit. Change both together — this half decides what the form says is
 * missing, that half decides what the database will accept, and a disagreement
 * shows up as a Submit button that is enabled and then refused.
 */
export const REQUIRED_KINDS: Record<AccommodationType, readonly DocKind[]> = {
  esa: ["esa_letter"],
  service_animal: ["provider_license"],
}

/** Kinds a resident may attach but is never required to. */
export const OPTIONAL_KINDS: Record<AccommodationType, readonly DocKind[]> = {
  esa: ["vaccination", "other"],
  service_animal: ["esa_letter", "vaccination", "other"],
}

/**
 * One label set, phrased so it is TRUE ON BOTH SURFACES.
 *
 * These were "Letter from your provider" and read correctly on the resident's
 * form and wrongly on the manager's checklist, where "your provider" is not the
 * reader's provider at all. A shared string that is only true for one of its
 * two audiences is a small lie told to the other one every time it renders.
 */
export const DOC_KIND_LABEL: Record<DocKind, string> = {
  esa_letter: "Provider's letter",
  provider_license: "Provider's licence",
  vaccination: "Vaccination record",
  other: "Other supporting document",
}

export const ACCOMMODATION_TYPE_LABEL: Record<AccommodationType, string> = {
  esa: "Emotional support animal",
  service_animal: "Service animal",
}

export const STATUS_LABEL: Record<AccommodationStatus, string> = {
  draft: "Not sent yet",
  pending: "Awaiting review",
  approved: "Approved",
  denied: "Denied",
  info_requested: "More information needed",
  withdrawn: "Withdrawn",
}

/** The three states in which a request is still open. Stated, not derived from "not terminal". */
export const OPEN_STATUSES: readonly AccommodationStatus[] = ["draft", "pending", "info_requested"]
export const TERMINAL_STATUSES: readonly AccommodationStatus[] = ["approved", "denied", "withdrawn"]

export interface AccommodationRequestRow {
  id: string
  type: AccommodationType
  status: AccommodationStatus
  animalDesc: string | null
  decidedAt: string | null
  withdrawnAt: string | null
}

export interface AccommodationDocumentRow {
  id: string
  kind: DocKind
  storagePath: string | null
  verified: boolean
  /** The `doc_status` the row carries. Only 'rejected' is read here. */
  status: string
  label: string | null
  mimeType: string | null
  sizeBytes: number | null
  uploadedAt: string | null
  verifiedAt: string | null
  reviewNote: string | null
  purgedAt: string | null
}

export type ChecklistState = "missing" | "provided" | "verified" | "rejected"

export interface ChecklistItem {
  kind: DocKind | "animal_desc"
  label: string
  required: boolean
  state: ChecklistState
  documentId?: string
}

/**
 * Text is present when it holds a non-whitespace character.
 *
 * `trim() === ""` would be right in JavaScript, where trim() is Unicode-aware —
 * but the DATABASE half of this rule is `~ '\S'` (public.text_present), and
 * writing the same positive grammar on both sides is what stops the two from
 * drifting into disagreeing about what "blank" means. Phase 6 shipped a
 * `btrim` check that passed on E'\n\n\t\n'.
 */
export function present(value: string | null | undefined): boolean {
  return /\S/.test(value ?? "")
}

/**
 * The checklist a manager works and a resident fills, derived from what exists.
 *
 * Required kinds first, then optional kinds the resident actually attached,
 * then `animal_desc`. A kind with no row is `missing` — the ABSENCE of a row is
 * the fact, never a row that says 'missing'. A row whose file has been purged
 * by retention reads `missing` too: the record survives, the letter does not,
 * and a manager must not be shown an Open control for bytes that are gone.
 */
export function checklistFor(
  request: Pick<AccommodationRequestRow, "type" | "animalDesc">,
  documents: readonly AccommodationDocumentRow[],
): ChecklistItem[] {
  const byKind = new Map<DocKind, AccommodationDocumentRow>()
  for (const d of documents) byKind.set(d.kind, d)

  const required = REQUIRED_KINDS[request.type] ?? []
  const optional = OPTIONAL_KINDS[request.type] ?? []

  const items: ChecklistItem[] = []
  for (const kind of required) {
    items.push(itemFor(kind, true, byKind.get(kind)))
  }
  for (const kind of optional) {
    const doc = byKind.get(kind)
    // An optional kind is only shown once it exists. Listing every optional
    // kind as "missing" would put four red crosses in front of a manager for
    // things nobody was ever asked for.
    if (doc) items.push(itemFor(kind, false, doc))
  }

  items.push({
    kind: "animal_desc",
    label: "Description of the animal and the need",
    required: true,
    // Not a document, and not pretended to be one. It is on the request.
    state: present(request.animalDesc) ? "provided" : "missing",
  })
  return items
}

function itemFor(kind: DocKind, required: boolean, doc: AccommodationDocumentRow | undefined): ChecklistItem {
  if (!doc || !doc.storagePath) {
    return { kind, label: DOC_KIND_LABEL[kind], required, state: "missing" }
  }
  const state: ChecklistState = doc.verified ? "verified" : doc.status === "rejected" ? "rejected" : "provided"
  return { kind, label: DOC_KIND_LABEL[kind], required, state, documentId: doc.id }
}

/** The required items still not satisfied, as sentences a form can show. */
export function missingRequired(items: readonly ChecklistItem[]): string[] {
  return items.filter((i) => i.required && (i.state === "missing" || i.state === "rejected")).map((i) => i.label)
}

/** True when every required item is verified — what an Approve control waits for. */
export function allRequiredVerified(items: readonly ChecklistItem[]): boolean {
  return items.every((i) => !i.required || i.kind === "animal_desc" || i.state === "verified")
}

export type Actor = "resident" | "manager"

/**
 * Where a request may go next, for this actor.
 *
 * MIRRORS THE LADDER ENFORCED IN THE DATABASE — the three RPCs in
 * 20260827000003 and `accommodation_requests_freeze` in 20260827000002. This
 * function decides which BUTTONS render; it is not the control, and a
 * disagreement here shows up as a button that returns `illegal_transition`
 * rather than as an unauthorised write.
 *
 * Both terminal states return `[]` for both actors. A new request is a new row.
 */
export function legalMoves(status: AccommodationStatus, actor: Actor): AccommodationStatus[] {
  if (actor === "resident") {
    switch (status) {
      case "draft":
        return ["pending", "withdrawn"]
      case "pending":
        return ["withdrawn"]
      case "info_requested":
        return ["pending", "withdrawn"]
      default:
        return []
    }
  }
  switch (status) {
    case "pending":
    case "info_requested":
      return ["approved", "denied", "info_requested"]
    default:
      return []
  }
}

/**
 * How long a decided request's documents are kept.
 *
 * A BC Human Rights Code complaint may be filed up to ONE YEAR after the
 * alleged contravention, and the supporting letter is the complainant's own
 * evidence — deleting it the moment you deny someone is exactly wrong. Keeping
 * it forever is also wrong. 400 days is thirteen months from the terminal
 * timestamp, one month past the filing limit.
 *
 * It applies to EVERY terminal state including `approved`: the entitlement
 * lives on the request row and on the pet, not in the PDF.
 */
export const RETENTION_DAYS = 400
export const MS_PER_DAY = 24 * 60 * 60 * 1000

/**
 * When this request's documents become removable, or null while it is open.
 *
 * `decided_at` for a decision, `withdrawn_at` for a withdrawal. A request still
 * open has no deadline at all — not a far-future one — so a caller cannot
 * accidentally compare against a date and conclude "not yet" for a request
 * whose clock has never started.
 */
export function retentionDeadline(
  request: Pick<AccommodationRequestRow, "status" | "decidedAt" | "withdrawnAt">,
): Date | null {
  if (!TERMINAL_STATUSES.includes(request.status)) return null
  const stamp = request.decidedAt ?? request.withdrawnAt
  if (!stamp) return null
  const at = Date.parse(stamp)
  if (!Number.isFinite(at)) return null
  return new Date(at + RETENTION_DAYS * MS_PER_DAY)
}

/** A human size for a file, shown before a manager opens it. */
export function fileSize(bytes: number | null | undefined): string {
  if (typeof bytes !== "number" || !Number.isFinite(bytes) || bytes <= 0) return "—"
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

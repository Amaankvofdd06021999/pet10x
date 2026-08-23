"use client"

/**
 * Pet10x — the resident asks their building to accommodate an assistance animal.
 *
 * Until this screen existed there was no intake form anywhere in the product,
 * so the manager's accommodation queue could only ever be filled by hand in
 * SQL, and `accommodation_documents` held zero rows because nothing had ever
 * written one.
 *
 * WHAT THIS SCREEN DELIBERATELY DOES NOT HAVE:
 *
 *   * No dropdown of conditions, no diagnosis field, no impairment picker.
 *     `animal_desc` is free text in the resident's own words, and the label
 *     says plainly who will read it. A structured clinical column invites a
 *     report, and a report is how `emergency_directory` ended up returning
 *     `p.conditions` while its own header said medical history was withheld.
 *   * It NEVER renders `legal_note`. RLS admits that column to the resident —
 *     `accom_select` matches on `resident_id = auth.uid()` and reads the whole
 *     row — and the seeded notes read like manager-only counsel ("Seek legal
 *     advice before denying"). Putting that in front of the applicant is not
 *     the product. This is a UI decision about a column the policy exposes,
 *     stated here so nobody later "fixes" the omission.
 */

import { useEffect, useMemo, useRef, useState } from "react"
import { IOSNavBar } from "@/components/ios-nav-bar"
import { NavBackButton } from "@/components/nav-back-button"
import { toast } from "sonner"
import { useMyBuildingLink, usePets } from "@/lib/data"
import { shortDate } from "@/lib/dates"
import {
  useMyAccommodations,
  useAccommodationDocuments,
  createAccommodationDraft,
  updateAccommodationDraft,
  submitAccommodationRequest,
  withdrawAccommodationRequest,
  type AccommodationRequestView,
} from "@/lib/data/accommodations-live"
import { uploadAccommodationDoc, removeAccommodationDoc } from "@/lib/data/accommodation-docs"
import {
  checklistFor,
  missingRequired,
  fileSize,
  DOC_KIND_LABEL,
  ACCOMMODATION_TYPE_LABEL,
  STATUS_LABEL,
  REQUIRED_KINDS,
  OPTIONAL_KINDS,
  type AccommodationType,
  type DocKind,
} from "@/lib/data/accommodations"
import { Accessibility, Building2, Heart, Loader2, Paperclip, Shield, Trash2 } from "lucide-react"

/** What an `<input type="file">` will offer. Mirrors the bucket's allow-list. */
const ACCEPT = "application/pdf,image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif"

export function AccommodationRequestScreen({
  onBack,
  onNavigate,
}: {
  onBack: () => void
  onNavigate?: (screen: string) => void
}) {
  const { data: link, isLoading: linkLoading } = useMyBuildingLink()
  const { data: requests, isLoading, refetch } = useMyAccommodations()
  const [editing, setEditing] = useState<string | null>(null)

  const approvedLink = link && link.status === "approved" ? link : null
  const openDraft = requests.find((r) => r.id === editing) ?? null

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <IOSNavBar
        title="Accommodation Requests"
        largeTitle={false}
        leftAction={<NavBackButton onClick={onBack} />}
      />

      <main className="ios-scroll flex-1 px-4 pb-32 pt-4">
        {linkLoading || isLoading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : !approvedLink ? (
          /* A resident with no approved link gets the affordance that actually
             helps, not a form that would be refused by `accom_resident_insert`
             (which requires `is_resident_of(building_id)` — an APPROVED link
             and a non-suspended profile). */
          <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
              <Building2 className="h-6 w-6 text-primary" />
            </div>
            <h3 className="mt-4 text-[15px] font-semibold text-foreground">Join your building first</h3>
            <p className="mx-auto mt-1 max-w-[22rem] break-words text-[13px] leading-relaxed text-muted-foreground">
              An accommodation request goes to the managers of the building you live in, so your membership has
              to be approved before you can file one.
            </p>
            <button
              onClick={() => onNavigate?.("link-building")}
              className="mt-4 rounded-xl bg-primary px-4 py-2.5 text-[14px] font-semibold text-primary-foreground"
            >
              Link my building
            </button>
          </div>
        ) : openDraft ? (
          <RequestEditor
            request={openDraft}
            onClose={() => {
              setEditing(null)
              refetch()
            }}
            refetchRequests={refetch}
          />
        ) : (
          <RequestList
            requests={requests}
            buildingId={approvedLink.buildingId}
            buildingName={approvedLink.buildingName}
            onOpen={setEditing}
            refetch={refetch}
          />
        )}
      </main>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* The list, and starting a new one                                    */
/* ------------------------------------------------------------------ */

function RequestList({
  requests,
  buildingId,
  buildingName,
  onOpen,
  refetch,
}: {
  requests: AccommodationRequestView[]
  buildingId: string
  buildingName: string
  onOpen: (id: string) => void
  refetch: () => void
}) {
  const [creating, setCreating] = useState(false)

  async function startRequest(type: AccommodationType) {
    setCreating(true)
    /* THE DRAFT ROW IS CREATED HERE, BEFORE ANY DOCUMENT EXISTS, AND THAT IS
       LOAD-BEARING. The `accommodation-docs` storage policies key on the
       REQUEST ID (path segment 2), so a request row must exist before a
       document can attach to it. Do not "simplify" this into an insert at
       submit time — every upload would fail, with a 403 from storage and no
       obvious cause. */
    const { id, error } = await createAccommodationDraft(buildingId, type)
    setCreating(false)
    if (error || !id) {
      toast.error("Couldn't start that request", { description: error ?? undefined })
      return
    }
    refetch()
    onOpen(id)
  }

  return (
    <div className="flex flex-col gap-4">
      <section>
        <h2 className="mb-2 text-[13px] font-semibold uppercase tracking-wide text-muted-foreground">
          Your requests
        </h2>
        {requests.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border bg-card p-5 text-center text-[13px] text-muted-foreground">
            You haven&apos;t asked {buildingName} for an accommodation yet.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {requests.map((r) => (
              <button
                key={r.id}
                onClick={() => onOpen(r.id)}
                className="w-full rounded-xl card-raised p-3 text-left active:bg-muted/50"
              >
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-accent/10">
                    {r.type === "esa" ? (
                      <Heart className="h-5 w-5 text-accent" />
                    ) : (
                      <Shield className="h-5 w-5 text-accent" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="break-words text-[14px] font-semibold text-foreground">
                      {ACCOMMODATION_TYPE_LABEL[r.type]}
                    </p>
                    <p className="break-words text-[12px] text-muted-foreground">
                      {STATUS_LABEL[r.status]}
                      {r.submittedAt ? ` · sent ${shortDate(r.submittedAt)}` : ""}
                      {r.petName ? ` · ${r.petName}` : ""}
                    </p>
                    {r.decisionNote && (
                      <p className="mt-1 whitespace-pre-wrap break-words text-[12px] text-foreground">
                        {r.decisionNote}
                      </p>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-[13px] font-semibold uppercase tracking-wide text-muted-foreground">
          New request
        </h2>
        <div className="flex flex-col gap-2">
          <TypeButton
            disabled={creating}
            icon={<Heart className="h-5 w-5 text-accent" />}
            title="Emotional support animal"
            subtitle="You will be asked for a letter from your provider."
            onClick={() => void startRequest("esa")}
          />
          <TypeButton
            disabled={creating}
            icon={<Shield className="h-5 w-5 text-accent" />}
            title="Service animal"
            subtitle="You will be asked for the provider's licence."
            onClick={() => void startRequest("service_animal")}
          />
        </div>
      </section>
    </div>
  )
}

function TypeButton({
  icon,
  title,
  subtitle,
  onClick,
  disabled,
}: {
  icon: React.ReactNode
  title: string
  subtitle: string
  onClick: () => void
  disabled: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex w-full items-start gap-3 rounded-xl card-raised p-3 text-left active:bg-muted/50 disabled:opacity-60"
    >
      <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-accent/10">{icon}</div>
      <div className="min-w-0">
        <p className="break-words text-[14px] font-semibold text-foreground">{title}</p>
        <p className="break-words text-[12px] text-muted-foreground">{subtitle}</p>
      </div>
    </button>
  )
}

/* ------------------------------------------------------------------ */
/* One request                                                         */
/* ------------------------------------------------------------------ */

function RequestEditor({
  request,
  onClose,
  refetchRequests,
}: {
  request: AccommodationRequestView
  onClose: () => void
  refetchRequests: () => void
}) {
  const { data: pets } = usePets()
  const { data: documents, refetch: refetchDocs } = useAccommodationDocuments(request.id)
  const [desc, setDesc] = useState(request.animalDesc ?? "")
  const [petId, setPetId] = useState<string | null>(request.petId)
  const [busy, setBusy] = useState(false)
  const savedRef = useRef({ desc: request.animalDesc ?? "", petId: request.petId })

  const editable = request.status === "draft" || request.status === "info_requested"
  const items = useMemo(
    () => checklistFor({ type: request.type, animalDesc: desc }, documents),
    [request.type, desc, documents],
  )
  const missing = missingRequired(items)

  // Persist the text field on the way out of it, not on every keystroke.
  useEffect(() => {
    if (!editable) return
    const t = setTimeout(async () => {
      if (desc === savedRef.current.desc && petId === savedRef.current.petId) return
      const { error } = await updateAccommodationDraft(request.id, { animalDesc: desc, petId })
      if (error) {
        toast.error("That change didn't save", { description: error })
        return
      }
      savedRef.current = { desc, petId }
    }, 700)
    return () => clearTimeout(t)
  }, [desc, petId, editable, request.id])

  async function submit() {
    setBusy(true)
    // Flush any pending edit first: the debounce above may not have fired, and
    // submitting a description the database has never seen is how a form
    // reports `description_required` for text the resident is looking at.
    if (desc !== savedRef.current.desc || petId !== savedRef.current.petId) {
      const { error } = await updateAccommodationDraft(request.id, { animalDesc: desc, petId })
      if (error) {
        setBusy(false)
        toast.error("That change didn't save", { description: error })
        return
      }
      savedRef.current = { desc, petId }
    }
    const res = await submitAccommodationRequest(request.id)
    setBusy(false)
    if (!res.ok) {
      toast.error("Couldn't send that request", {
        description: res.missing?.length
          ? `Still needed: ${res.missing.map((k) => DOC_KIND_LABEL[k as DocKind] ?? k).join(", ")}.`
          : (res.error ?? undefined),
      })
      return
    }
    toast.success("Request sent", { description: "Your building manager will review it." })
    refetchRequests()
    onClose()
  }

  async function withdraw() {
    setBusy(true)
    const res = await withdrawAccommodationRequest(request.id)
    setBusy(false)
    if (!res.ok) {
      toast.error("Couldn't withdraw that request", { description: res.error ?? undefined })
      return
    }
    toast("Request withdrawn")
    refetchRequests()
    onClose()
  }

  const kinds: DocKind[] = [...REQUIRED_KINDS[request.type], ...OPTIONAL_KINDS[request.type]]

  return (
    <div className="flex flex-col gap-4">
      <button onClick={onClose} className="self-start text-[14px] font-semibold text-primary">
        All requests
      </button>

      <div className="rounded-xl card-raised p-3">
        <div className="flex items-center gap-2">
          <Accessibility className="h-4 w-4 flex-shrink-0 text-accent" />
          <p className="break-words text-[14px] font-semibold text-foreground">
            {ACCOMMODATION_TYPE_LABEL[request.type]}
          </p>
        </div>
        <p className="mt-0.5 break-words text-[12px] text-muted-foreground">
          {STATUS_LABEL[request.status]}
          {request.submittedAt ? ` · sent ${shortDate(request.submittedAt)}` : ""}
        </p>
        {request.decisionNote && (
          <p className="mt-2 whitespace-pre-wrap break-words rounded-lg bg-muted/50 p-2 text-[12px] text-foreground">
            {request.decisionNote}
          </p>
        )}
      </div>

      <section>
        <label htmlFor="accom-animal-desc" className="mb-1 block text-[13px] font-semibold text-foreground">
          Describe the animal and why you need it
        </label>
        <p className="mb-1.5 break-words text-[12px] text-muted-foreground">
          Your building manager will read this. Write it in your own words — there is no form to fill in and
          nothing you have to name.
        </p>
        <textarea
          id="accom-animal-desc"
          value={desc}
          disabled={!editable}
          onChange={(e) => setDesc(e.target.value)}
          rows={5}
          className="w-full rounded-xl border border-border bg-card p-3 text-[14px] text-foreground disabled:opacity-70"
        />
      </section>

      <section>
        <label htmlFor="accom-pet" className="mb-1 block text-[13px] font-semibold text-foreground">
          Which animal? (optional)
        </label>
        <p className="mb-1.5 break-words text-[12px] text-muted-foreground">
          An animal you have not registered yet is exactly what a request may be about, so this can be left
          blank.
        </p>
        <select
          id="accom-pet"
          value={petId ?? ""}
          disabled={!editable}
          onChange={(e) => setPetId(e.target.value || null)}
          className="w-full rounded-xl border border-border bg-card p-3 text-[14px] text-foreground disabled:opacity-70"
        >
          <option value="">Not one of my registered pets</option>
          {pets.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </section>

      <section>
        <h2 className="mb-2 text-[13px] font-semibold uppercase tracking-wide text-muted-foreground">Documents</h2>
        <div className="flex flex-col gap-2">
          {kinds.map((kind) => (
            <DocumentRow
              key={kind}
              requestId={request.id}
              kind={kind}
              required={REQUIRED_KINDS[request.type].includes(kind)}
              doc={documents.find((d) => d.kind === kind) ?? null}
              editable={editable || request.status === "pending"}
              onChanged={refetchDocs}
            />
          ))}
        </div>
      </section>

      {editable && (
        <section className="flex flex-col gap-2">
          {missing.length > 0 && (
            /* A plain sentence naming what is still missing, never a silent
               no-op on a disabled button. */
            <p className="break-words text-[12px] text-muted-foreground">
              Still needed before you can send this: {missing.join(", ")}.
            </p>
          )}
          <button
            onClick={() => void submit()}
            disabled={busy || missing.length > 0}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3 text-[15px] font-semibold text-primary-foreground disabled:opacity-60"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            Send to my building
          </button>
        </section>
      )}

      {(editable || request.status === "pending") && (
        <button
          onClick={() => void withdraw()}
          disabled={busy}
          className="w-full rounded-xl bg-muted py-3 text-[15px] font-semibold text-foreground disabled:opacity-60"
        >
          Withdraw this request
        </button>
      )}
    </div>
  )
}

function DocumentRow({
  requestId,
  kind,
  required,
  doc,
  editable,
  onChanged,
}: {
  requestId: string
  kind: DocKind
  required: boolean
  doc: { id: string; label: string | null; sizeBytes: number | null; verified: boolean; status: string } | null
  editable: boolean
  onChanged: () => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const inputId = `accom-file-${kind}`

  async function pick(file: File | undefined) {
    if (!file) return
    setBusy(true)
    const { error } = await uploadAccommodationDoc(requestId, kind, file)
    setBusy(false)
    if (inputRef.current) inputRef.current.value = ""
    if (error) {
      toast.error("That file didn't attach", { description: error })
      return
    }
    toast.success(`${DOC_KIND_LABEL[kind]} attached`)
    onChanged()
  }

  async function remove() {
    if (!doc) return
    setBusy(true)
    const { error } = await removeAccommodationDoc(doc.id)
    setBusy(false)
    if (error) {
      toast.error("Couldn't remove that", { description: error })
      return
    }
    toast("Removed")
    onChanged()
  }

  return (
    <div className="rounded-xl card-raised p-3">
      <div className="flex items-start gap-3">
        <Paperclip className="mt-0.5 h-4 w-4 flex-shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <p className="break-words text-[13px] font-semibold text-foreground">
            {DOC_KIND_LABEL[kind]}
            {required ? "" : " (optional)"}
          </p>
          {doc ? (
            <p className="break-words text-[12px] text-muted-foreground">
              {doc.label ?? "Attached"} &middot; {fileSize(doc.sizeBytes)}
              {doc.verified ? " · verified" : doc.status === "rejected" ? " · rejected" : ""}
            </p>
          ) : (
            <p className="text-[12px] text-muted-foreground">Nothing attached yet</p>
          )}
        </div>
        {doc && editable && (
          <button
            onClick={() => void remove()}
            disabled={busy}
            aria-label={`Remove ${DOC_KIND_LABEL[kind]}`}
            className="flex-shrink-0 rounded-lg p-1.5 text-destructive active:bg-muted disabled:opacity-60"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>
      {editable && (
        <div className="mt-2">
          {/* The label's `htmlFor` and the input's `id` must match exactly.
              Phase 5 shipped an id containing a space, which binds to nothing
              and leaves a control with no accessible name. */}
          <label
            htmlFor={inputId}
            className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-muted px-3 py-1.5 text-[12px] font-semibold text-foreground"
          >
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {doc ? "Replace file" : "Choose a file"}
          </label>
          <input
            ref={inputRef}
            id={inputId}
            type="file"
            accept={ACCEPT}
            disabled={busy}
            onChange={(e) => void pick(e.target.files?.[0])}
            className="sr-only"
          />
        </div>
      )}
    </div>
  )
}

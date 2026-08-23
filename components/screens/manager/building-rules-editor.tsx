"use client"

/**
 * Where a manager writes the building's house rules.
 *
 * ONE COMPONENT, TWO MOUNTS — the in-app manager's Settings sheet and the
 * strata portal's per-building bylaws panel. Built once for the same reason the
 * fine-schedule editor is: this project's original bug was a near-duplicate
 * pair of bylaw editors drifting apart.
 *
 * WHAT THIS IS NOT: it is not the compliance toggles. Those are six booleans in
 * `buildings.pet_rules` that a MACHINE checks, and they sit in the bylaws
 * surface above this one. These are STATEMENTS — a category, a title, a body a
 * person wrote — and nothing scores them. AD-9. The two never interleave, here
 * or on the resident's screen.
 *
 * PLAIN TEXT, NOT MARKDOWN. The body is stored and rendered verbatim with
 * `whitespace-pre-wrap`, so `#`, `*`, `s. 3(4)` and the manager's own blank
 * lines survive exactly. A renderer is a rewriter, and rewriting is the one
 * thing this phase must not do. Bodies are React text children, so they are
 * escaped by construction, and no raw-HTML injection API is used in this file
 * or its resident counterpart.
 */

import { useMemo, useState } from "react"
import { toast } from "sonner"
import {
  useManagerBuildingRules,
  useApprovedResidentCount,
  saveBuildingRule,
  publishBuildingRule,
} from "@/lib/data/building-rules-live"
import {
  CATEGORY_ORDER,
  CATEGORY_LABEL,
  groupByCategory,
  legacyNoteDraft,
  type BuildingRule,
  type BuildingRuleCategory,
} from "@/lib/data/building-rules"
import { Loader2, Plus, ArrowUp, ArrowDown, Eye, EyeOff, Pencil, X, FileText } from "lucide-react"

const TITLE_MAX = 120
const BODY_MAX = 8000

interface Draft {
  id: string | null
  category: BuildingRuleCategory
  title: string
  body: string
}

const BLANK: Draft = { id: null, category: "parking", title: "", body: "" }

export function BuildingRulesEditor({
  buildingId,
  buildingName,
  /** The building's `pet_rules` jsonb, read only to offer the legacy-note copy. */
  petRules,
}: {
  buildingId: string
  buildingName?: string
  petRules?: unknown
}) {
  const { data: rules, isLoading, error, refetch } = useManagerBuildingRules(buildingId)
  /* `null` when it could not be established. The checkbox then says what it
     does without claiming a number — see useApprovedResidentCount. */
  const residentCount = useApprovedResidentCount(buildingId)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  /* Default ON, because publishing an amendment residents are not told about is
     a silent edit — the thing Decision 4 exists to prevent. Turned off for a
     typo fix, so nine people are not notified twice about one comma. */
  const [notify, setNotify] = useState(true)

  const groups = useMemo(() => groupByCategory(rules), [rules])
  const publishedCount = rules.filter((r) => r.isPublished).length

  const legacy = legacyNoteDraft(petRules)
  const offerLegacy = legacy !== null && publishedCount === 0 && draft === null

  const titleOver = draft ? draft.title.length > TITLE_MAX : false
  const bodyOver = draft ? draft.body.length > BODY_MAX : false
  const draftEmpty = draft ? draft.title.trim() === "" || draft.body.trim() === "" : true

  async function save() {
    if (!draft) return
    setSaving(true)
    const { error: err } = await saveBuildingRule({
      id: draft.id,
      buildingId,
      category: draft.category,
      title: draft.title,
      // VERBATIM. No trim here — `manager_save_building_rule` trims only the
      // outermost whitespace, and trimming again in two places is two chances
      // to disagree about what the manager wrote.
      body: draft.body,
    })
    setSaving(false)
    if (err) return toast.error("Couldn't save the rule", { description: err })
    toast.success(draft.id ? "Rule updated" : "Draft saved", {
      description: draft.id ? undefined : "It isn't visible to residents until you publish it.",
    })
    setDraft(null)
    refetch()
  }

  async function setPublished(rule: BuildingRule, published: boolean) {
    setBusyId(rule.id)
    // Unpublishing never notifies: telling residents "the rules were updated"
    // when a notice was taken DOWN points them at something they cannot read.
    const { error: err, notified } = await publishBuildingRule(rule.id, published, published && notify)
    setBusyId(null)
    if (err) return toast.error(published ? "Couldn't publish" : "Couldn't unpublish", { description: err })
    if (published) {
      toast.success("Rule published", {
        description:
          notified > 0
            ? `${notified} resident${notified === 1 ? "" : "s"} notified.`
            : "No notification sent.",
      })
    } else {
      toast.success("Rule unpublished", { description: "Residents no longer see it. Nobody was notified." })
    }
    refetch()
  }

  async function move(rule: BuildingRule, delta: number) {
    const siblings = groups.find((g) => g.category === rule.category)?.rules ?? []
    const index = siblings.findIndex((r) => r.id === rule.id)
    const swap = siblings[index + delta]
    if (!swap) return
    setBusyId(rule.id)
    /* Both rows are rewritten, because two rules can share a sort_order — every
       rule created without an explicit one gets max+1 within its category, but
       a manager reordering in two tabs can still collide. Writing both ends of
       the swap makes the result independent of what they were before. */
    const a = await saveBuildingRule({
      id: rule.id,
      buildingId,
      category: rule.category,
      title: rule.title,
      body: rule.body,
      sortOrder: index + delta,
    })
    const b = await saveBuildingRule({
      id: swap.id,
      buildingId,
      category: swap.category,
      title: swap.title,
      body: swap.body,
      sortOrder: index,
    })
    setBusyId(null)
    const err = a.error ?? b.error
    if (err) return toast.error("Couldn't reorder", { description: err })
    refetch()
  }

  return (
    <div className="space-y-3">
      {isLoading ? (
        <div className="flex justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : error ? (
        <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-[12.5px] text-destructive">
          {error}
        </p>
      ) : (
        <>
          {/* The legacy note offer. It writes nothing on its own: it fills the
              composer, and the manager edits and publishes deliberately. The
              original keys are untouched — no automatic migration, no silent
              display of prose nobody chose to publish. */}
          {offerLegacy && (
            <div className="rounded-xl border border-info/30 bg-info/5 p-3">
              <div className="mb-1 flex items-center gap-2">
                <FileText className="h-4 w-4 flex-shrink-0 text-info" />
                <p className="text-[13px] font-semibold text-foreground">There is note text stored with the bylaws</p>
              </div>
              <p className="mb-2 text-[12px] leading-relaxed text-muted-foreground">
                This building keeps some written notes inside its compliance settings, where no resident screen shows
                them. Copy them into a rule you can edit and publish?
              </p>
              <button
                onClick={() =>
                  setDraft({ id: null, category: "other", title: "House rules", body: legacy as string })
                }
                className="rounded-lg bg-info px-3 py-1.5 text-[12.5px] font-semibold text-info-foreground"
              >
                Copy into a draft
              </button>
            </div>
          )}

          {draft ? (
            <Composer
              draft={draft}
              onChange={setDraft}
              onCancel={() => setDraft(null)}
              onSave={save}
              saving={saving}
              blocked={draftEmpty || titleOver || bodyOver}
              titleOver={titleOver}
              bodyOver={bodyOver}
            />
          ) : (
            <button
              onClick={() => setDraft(BLANK)}
              className="flex items-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-[13px] font-semibold text-primary-foreground"
            >
              <Plus className="h-4 w-4" /> New house rule
            </button>
          )}

          {groups.length === 0 && draft === null && (
            <p className="rounded-lg bg-muted/50 px-3 py-3 text-[12.5px] text-muted-foreground">
              No house rules yet{buildingName ? ` for ${buildingName}` : ""}. Residents see an honest empty state
              until you publish one.
            </p>
          )}

          {groups.map((group) => (
            <div key={group.category}>
              <h5 className="mb-1.5 px-0.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {group.label}
              </h5>
              <div className="space-y-2">
                {group.rules.map((rule, i) => (
                  <RuleCard
                    key={rule.id}
                    rule={rule}
                    busy={busyId === rule.id}
                    canMoveUp={i > 0}
                    canMoveDown={i < group.rules.length - 1}
                    onEdit={() =>
                      setDraft({ id: rule.id, category: rule.category, title: rule.title, body: rule.body })
                    }
                    onPublish={() => setPublished(rule, true)}
                    onUnpublish={() => setPublished(rule, false)}
                    onMove={(d) => move(rule, d)}
                  />
                ))}
              </div>
            </div>
          ))}

          {rules.length > 0 && (
            <label className="flex items-start gap-2 rounded-lg bg-muted/50 px-3 py-2">
              <input
                type="checkbox"
                checked={notify}
                onChange={(e) => setNotify(e.target.checked)}
                className="mt-0.5 h-4 w-4 flex-shrink-0 accent-primary"
              />
              <span className="text-[12.5px] leading-relaxed text-foreground">
                Notify residents when I publish
                {typeof residentCount === "number" && (
                  <span className="text-muted-foreground">
                    {" "}
                    &mdash; {residentCount} resident{residentCount === 1 ? "" : "s"} would be told
                  </span>
                )}
              </span>
            </label>
          )}
        </>
      )}
    </div>
  )
}

function Composer({
  draft,
  onChange,
  onCancel,
  onSave,
  saving,
  blocked,
  titleOver,
  bodyOver,
}: {
  draft: Draft
  onChange: (d: Draft) => void
  onCancel: () => void
  onSave: () => void
  saving: boolean
  blocked: boolean
  titleOver: boolean
  bodyOver: boolean
}) {
  return (
    <div className="rounded-xl border border-border p-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[13px] font-semibold text-foreground">{draft.id ? "Edit rule" : "New rule"}</p>
        <button onClick={onCancel} className="rounded-lg p-1 text-muted-foreground" aria-label="Cancel">
          <X className="h-4 w-4" />
        </button>
      </div>

      <label className="mb-1 block text-[11.5px] font-semibold text-muted-foreground" htmlFor="rule-category">
        Category
      </label>
      <select
        id="rule-category"
        value={draft.category}
        onChange={(e) => onChange({ ...draft, category: e.target.value as BuildingRuleCategory })}
        className="mb-2.5 w-full rounded-lg border border-border bg-background px-3 py-2 text-[13px] text-foreground focus:border-info focus:outline-none"
      >
        {CATEGORY_ORDER.map((c) => (
          <option key={c} value={c}>
            {CATEGORY_LABEL[c]}
          </option>
        ))}
      </select>

      <div className="mb-1 flex items-baseline justify-between">
        <label className="text-[11.5px] font-semibold text-muted-foreground" htmlFor="rule-title">
          Title
        </label>
        <span className={`text-[11px] ${titleOver ? "text-destructive" : "text-muted-foreground"}`}>
          {draft.title.length}/{TITLE_MAX}
        </span>
      </div>
      <input
        id="rule-title"
        value={draft.title}
        onChange={(e) => onChange({ ...draft, title: e.target.value })}
        placeholder="Visitor parking"
        className={`mb-2.5 w-full rounded-lg border bg-background px-3 py-2 text-[13px] text-foreground focus:outline-none ${
          titleOver ? "border-destructive" : "border-border focus:border-info"
        }`}
      />

      <div className="mb-1 flex items-baseline justify-between">
        <label className="text-[11.5px] font-semibold text-muted-foreground" htmlFor="rule-body">
          Rule text
        </label>
        <span className={`text-[11px] ${bodyOver ? "text-destructive" : "text-muted-foreground"}`}>
          {draft.body.length}/{BODY_MAX}
        </span>
      </div>
      {/* No trim, no normalise, on the way in or out. The manager's line breaks
          and blank lines ARE the content; only the outermost whitespace is
          trimmed, once, by the RPC. */}
      <textarea
        id="rule-body"
        value={draft.body}
        onChange={(e) => onChange({ ...draft, body: e.target.value })}
        rows={8}
        placeholder={"Residents may park in visitor stalls for up to 4 hours.\n\nOvernight parking requires a permit from the office."}
        className={`w-full rounded-lg border bg-background px-3 py-2 font-sans text-[13px] leading-relaxed text-foreground focus:outline-none ${
          bodyOver ? "border-destructive" : "border-border focus:border-info"
        }`}
      />
      <p className="mt-1 text-[11.5px] text-muted-foreground">
        Plain text. Residents see exactly this, line breaks and all &mdash; no formatting is applied.
      </p>

      {draft.body.trim() !== "" && (
        <div className="mt-2.5 rounded-lg bg-muted/50 p-3">
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            What a resident will see
          </p>
          <p className="text-[13.5px] font-semibold text-foreground">{draft.title || "Untitled"}</p>
          {/* The SAME rendering the resident screen uses. If this and that ever
              differ, the preview is a lie about the thing it is previewing. */}
          <p className="mt-1 whitespace-pre-wrap text-[13px] leading-relaxed text-foreground">{draft.body}</p>
        </div>
      )}

      <button
        onClick={onSave}
        disabled={saving || blocked}
        className="mt-3 flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2 text-[13px] font-semibold text-primary-foreground disabled:opacity-50"
      >
        {saving && <Loader2 className="h-4 w-4 animate-spin" />}
        {draft.id ? "Save changes" : "Save draft"}
      </button>
      {!draft.id && (
        <p className="mt-1.5 text-[11.5px] text-muted-foreground">
          Saving does not publish. Residents see nothing until you press Publish.
        </p>
      )}
    </div>
  )
}

function RuleCard({
  rule,
  busy,
  canMoveUp,
  canMoveDown,
  onEdit,
  onPublish,
  onUnpublish,
  onMove,
}: {
  rule: BuildingRule
  busy: boolean
  canMoveUp: boolean
  canMoveDown: boolean
  onEdit: () => void
  onPublish: () => void
  onUnpublish: () => void
  onMove: (delta: number) => void
}) {
  return (
    <div className="rounded-xl border border-border p-3">
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 flex-1 text-[13.5px] font-semibold text-foreground">{rule.title}</p>
        <span
          className={`flex-shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-semibold ${
            rule.isPublished ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"
          }`}
        >
          {rule.isPublished ? "Published" : "Draft"}
        </span>
      </div>
      {/* The entire body, `whitespace-pre-wrap`, shortened by nothing — the
          same rendering the resident screen uses. A collapsed bylaw is a bylaw
          nobody read, and "show more" is a cut with a nicer name. */}
      <p className="mt-1 whitespace-pre-wrap text-[12.5px] leading-relaxed text-muted-foreground">{rule.body}</p>

      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        <SmallButton onClick={onEdit} disabled={busy} icon={Pencil} label="Edit" />
        {rule.isPublished ? (
          <SmallButton onClick={onUnpublish} disabled={busy} icon={EyeOff} label="Unpublish" />
        ) : (
          <SmallButton onClick={onPublish} disabled={busy} icon={Eye} label="Publish" primary />
        )}
        {rule.isPublished && <SmallButton onClick={onPublish} disabled={busy} icon={Eye} label="Re-publish" />}
        <SmallButton onClick={() => onMove(-1)} disabled={busy || !canMoveUp} icon={ArrowUp} label="Up" />
        <SmallButton onClick={() => onMove(1)} disabled={busy || !canMoveDown} icon={ArrowDown} label="Down" />
        {busy && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
      </div>
      {/* There is deliberately no Delete. A published rule is a statement
          residents were notified of; making it vanish without a trace is not an
          edit. `building_rules` has no manager DELETE policy at all. */}
    </div>
  )
}

function SmallButton({
  onClick,
  disabled,
  icon: Icon,
  label,
  primary,
}: {
  onClick: () => void
  disabled?: boolean
  icon: typeof Eye
  label: string
  primary?: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex items-center gap-1 rounded-lg px-2 py-1 text-[12px] font-semibold disabled:opacity-40 ${
        primary ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"
      }`}
    >
      <Icon className="h-3.5 w-3.5" /> {label}
    </button>
  )
}

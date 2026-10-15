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
import { Loader2, Plus, ArrowUp, ArrowDown, Eye, EyeOff, Pencil, X, FileText, ExternalLink } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { NativeSelect } from "@/components/ui/select"
import { LoadError } from "@/components/ui/load-error"

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
  /** Routes to the REAL resident screen. See the button near the bottom. */
  onNavigate,
}: {
  buildingId: string
  buildingName?: string
  petRules?: unknown
  onNavigate?: (screen: string) => void
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
        <LoadError message={error} />
      ) : (
        <>
          {/* The legacy note offer. It writes nothing on its own: it fills the
              composer, and the manager edits and publishes deliberately. The
              original keys are untouched — no automatic migration, no silent
              display of prose nobody chose to publish. */}
          {offerLegacy && (
            <div className="rounded-xl border border-info bg-info-soft p-3">
              <div className="mb-1 flex items-center gap-2">
                <FileText className="h-4 w-4 flex-shrink-0 text-info" />
                <p className="text-meta font-semibold text-foreground">There is note text stored with the bylaws</p>
              </div>
              <p className="mb-2 text-caption leading-relaxed text-muted-foreground">
                This building keeps some written notes inside its compliance settings, where no resident screen shows
                them. Copy them into a rule you can edit and publish?
              </p>
              <Button
                size="sm"
                onClick={() =>
                  setDraft({ id: null, category: "other", title: "House rules", body: legacy as string })
                }
              >
                Copy into a draft
              </Button>
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
            <Button size="sm" className="self-start" onClick={() => setDraft(BLANK)}>
              <Plus className="h-4 w-4" /> New house rule
            </Button>
          )}

          {/* THE ONLY WAY A MANAGER REACHES THE RESIDENT SCREEN.
              `navigation.ts` registers `building-rules` for BOTH surfaces so a
              manager can check what their residents actually see — but the only
              callers of `onNavigate("building-rules")` were `home-screen` and
              `profile-screen`, both resident-only. Registered and reachable are
              different things, and without this the manager surface had no door.
              It belongs here rather than in the settings menu because this is
              where the claim is made: the composer above renders a PREVIEW, and
              a preview is an assertion about another screen. This is how the
              assertion gets checked against the thing itself. */}
          {onNavigate && (
            <Button variant="secondary" size="sm" className="self-start" onClick={() => onNavigate("building-rules")}>
              <ExternalLink className="h-4 w-4" /> Open the resident screen
            </Button>
          )}

          {groups.length === 0 && draft === null && (
            <p className="rounded-lg bg-muted px-3 py-3 text-caption text-muted-foreground">
              No house rules yet{buildingName ? ` for ${buildingName}` : ""}. Residents see an honest empty state
              until you publish one.
            </p>
          )}

          {groups.map((group) => (
            <div key={group.category}>
              <h5 className="mb-1.5 px-0.5 text-caption font-semibold uppercase tracking-wide text-muted-foreground">
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
            <label className="flex items-start gap-2 rounded-lg bg-muted px-3 py-2">
              <input
                type="checkbox"
                checked={notify}
                onChange={(e) => setNotify(e.target.checked)}
                className="mt-0.5 h-4 w-4 flex-shrink-0 accent-primary"
              />
              <span className="text-caption leading-relaxed text-foreground">
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
        <p className="text-meta font-semibold text-foreground">{draft.id ? "Edit rule" : "New rule"}</p>
        <Button variant="quiet" size="icon-sm" onClick={onCancel} aria-label="Cancel">
          <X className="h-4 w-4" />
        </Button>
      </div>

      <label className="mb-1 block text-caption font-semibold text-muted-foreground" htmlFor="rule-category">
        Category
      </label>
      <NativeSelect
        id="rule-category"
        value={draft.category}
        onChange={(e) => onChange({ ...draft, category: e.target.value as BuildingRuleCategory })}
        className="mb-2.5"
      >
        {CATEGORY_ORDER.map((c) => (
          <option key={c} value={c}>
            {CATEGORY_LABEL[c]}
          </option>
        ))}
      </NativeSelect>

      <div className="mb-1 flex items-baseline justify-between">
        <label className="text-caption font-semibold text-muted-foreground" htmlFor="rule-title">
          Title
        </label>
        <span className={`text-caption ${titleOver ? "font-semibold text-foreground" : "text-muted-foreground"}`}>
          {draft.title.length}/{TITLE_MAX}
        </span>
      </div>
      <Input
        id="rule-title"
        value={draft.title}
        onChange={(e) => onChange({ ...draft, title: e.target.value })}
        placeholder="Visitor parking"
        aria-invalid={titleOver ? true : undefined}
        className="mb-2.5"
      />

      <div className="mb-1 flex items-baseline justify-between">
        <label className="text-caption font-semibold text-muted-foreground" htmlFor="rule-body">
          Rule text
        </label>
        <span className={`text-caption ${bodyOver ? "font-semibold text-foreground" : "text-muted-foreground"}`}>
          {draft.body.length}/{BODY_MAX}
        </span>
      </div>
      {/* No trim, no normalise, on the way in or out. The manager's line breaks
          and blank lines ARE the content; only the outermost whitespace is
          trimmed, once, by the RPC. */}
      <Textarea
        id="rule-body"
        value={draft.body}
        onChange={(e) => onChange({ ...draft, body: e.target.value })}
        rows={8}
        placeholder={"Residents may park in visitor stalls for up to 4 hours.\n\nOvernight parking requires a permit from the office."}
        aria-invalid={bodyOver ? true : undefined}
        className="leading-relaxed"
      />
      <p className="mt-1 text-caption text-muted-foreground">
        Plain text. Residents see exactly this, line breaks and all &mdash; no formatting is applied.
      </p>

      {draft.body.trim() !== "" && (
        <div className="mt-2.5 rounded-lg bg-muted p-3">
          <p className="mb-1 text-caption font-semibold uppercase tracking-wide text-muted-foreground">
            What a resident will see
          </p>
          <p className="break-words text-meta font-semibold text-foreground">{draft.title || "Untitled"}</p>
          {/* The SAME rendering the resident screen uses. If this and that ever
              differ, the preview is a lie about the thing it is previewing. */}
          <p className="mt-1 whitespace-pre-wrap break-words text-meta leading-relaxed text-foreground">{draft.body}</p>
        </div>
      )}

      <Button className="mt-3" size="sm" onClick={onSave} disabled={blocked} loading={saving}>
        {draft.id ? "Save changes" : "Save draft"}
      </Button>
      {!draft.id && (
        <p className="mt-1.5 text-caption text-muted-foreground">
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
        <p className="min-w-0 flex-1 break-words text-meta font-semibold text-foreground">{rule.title}</p>
        <Badge variant={rule.isPublished ? "success" : "neutral"} className="flex-shrink-0">
          {rule.isPublished ? "Published" : "Draft"}
        </Badge>
      </div>
      {/* The entire body, `whitespace-pre-wrap`, shortened by nothing — the
          same rendering the resident screen uses. A collapsed bylaw is a bylaw
          nobody read, and "show more" is a cut with a nicer name. */}
      <p className="mt-1 whitespace-pre-wrap break-words text-caption leading-relaxed text-muted-foreground">{rule.body}</p>

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
    <Button size="sm" variant={primary ? "primary" : "secondary"} onClick={onClick} disabled={disabled}>
      <Icon className="h-3.5 w-3.5" /> {label}
    </Button>
  )
}

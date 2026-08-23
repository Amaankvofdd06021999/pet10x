"use client"

/**
 * Pet10x — the rules of your building, as your building wrote them.
 *
 * THIS IS THE PHASE'S WHOLE POINT. A manager types a parking rule; a resident
 * opens their account and reads exactly that text. Nothing between the two
 * rewrites it, cuts it short, or serves a stale copy without saying so.
 *
 * WHAT THIS REPLACES. The Home quick action fired
 * `toast("Building pet rules", { description: "One dog or one cat · leashed in
 * common areas." })` — ONE HARDCODED STRING, identical for all six buildings,
 * and measurably WRONG for the flagship one: Maple Court Residences' own
 * `pet_rules` records `max_pets_per_unit: 2`, so a resident was told their
 * building allows one pet when its record allows two. The Profile row of the
 * same name promised the feature was on its way. Phase 3 disabled both rather
 * than keep lying; this screen is what they now open.
 *
 * ---------------------------------------------------------------------------
 * TWO SECTIONS, NEVER INTERLEAVED (AD-9)
 *
 *   REQUIREMENTS PET10X CHECKS — the `buildings.pet_rules` booleans and numeric
 *   limits. A machine checks these; they feed `computeCompliance` and the
 *   resident's compliance status. Real, always present, and labelled as
 *   machine-checked.
 *
 *   HOUSE RULES FROM YOUR BUILDING MANAGER — `building_rules` rows. A person
 *   wrote these; nothing scores them. Labelled with their authorship and the
 *   date they were last updated.
 *
 * A rule body must never render as if it were a checked requirement, and a
 * requirement must never render as if a manager wrote it this week. That is why
 * the two carry different headings, different framing sentences and different
 * visual weight, and why neither list can ever contain the other's items.
 *
 * ---------------------------------------------------------------------------
 * THE WHOLE BODY, ALWAYS. NO CLAMP. NO "READ MORE".
 *
 * A card renders its entire body. A collapsed bylaw is a bylaw a resident did
 * not read, and a "show more" link is a cut with a friendlier name. The screen
 * scrolls; that is what screens do.
 *
 * The three Tailwind utilities that would shorten a body are absent from this
 * file, and that absence is checked MECHANICALLY by a grep in the phase report.
 * Which is why this comment does not name them: a comment that spells out the
 * strings the grep looks for makes the grep match forever and quietly retires
 * the check. If you need the list, it is in `groupByCategory`'s neighbours in
 * the phase plan, or read the grep itself.
 *
 * PLAIN TEXT, RENDERED VERBATIM. `whitespace-pre-wrap` keeps the manager's own
 * line breaks and blank lines. No markdown renderer — a renderer is a rewriter:
 * it eats `#` and `*`, collapses single newlines, and mangles `s. 3(4)`. Bodies
 * are React TEXT CHILDREN, so they are escaped by construction, and no
 * raw-HTML injection API is used anywhere in this file.
 *
 * WHEN NOTHING IS PUBLISHED: one honest sentence. Never inherited defaults,
 * never placeholder rules, never an illustration pretending the gap is a
 * feature. Inventing platform-default house rules and rendering them as THIS
 * BUILDING'S rules fabricates a statement nobody made, which is worse than
 * blank. The requirements section above it is still full of true things, so the
 * screen is never empty.
 */

import { useMemo, useState } from "react"
import { IOSNavBar } from "@/components/ios-nav-bar"
import { NavBackButton } from "@/components/nav-back-button"
import { useAuth } from "@/lib/auth-context"
import { useMyBuildingLink } from "@/lib/data/live"
import { useMyBuildingRules, useBuildingPetRules } from "@/lib/data/building-rules-live"
import {
  CATEGORY_LABEL,
  groupByCategory,
  readRequirements,
  relativeUpdated,
  type BuildingRuleCategory,
} from "@/lib/data/building-rules"
import { Building2, CheckCircle2, FileText, Loader2, ShieldCheck } from "lucide-react"

export function BuildingRulesScreen({
  onBack,
  onNavigate,
}: {
  onBack: () => void
  onNavigate?: (screen: string) => void
}) {
  const { data: link, isLoading: linkLoading } = useMyBuildingLink()
  const { viewAs, activeBuildingId, managedBuildings, isLoading: authLoading } = useAuth()

  /* Only an APPROVED link gets a building. A pending or left link means the
     person is not (yet) a resident, and `is_resident_of` — which every read
     below sits behind — would return false anyway. Deciding it here means the
     screen offers the link flow instead of rendering two empty sections. */
  const residentBuilding =
    link?.status === "approved" ? { id: link.buildingId, name: link.buildingName } : null

  /* A MANAGER IS NOT A RESIDENT OF THE BUILDING THEY MANAGE. `navigation.ts`
     registers this screen for BOTH surfaces precisely so a manager can open the
     real thing and check the claim their editor's preview makes — but resolving
     the subject from `my_building_link` alone made that impossible: measured,
     manager@pet10x.com holds no resident link at all, so the screen offered
     them a "Link my building" button instead of their own building's rules.

     Read from the persona grants rather than through `useManagerBuilding`:
     `activeBuildingId` is already validated against `my_personas().managed_buildings`
     when it is set, and `managedBuildings` carries the name, so this costs no
     round-trip on a screen every resident also opens. */
  const managedBuilding = managedBuildings.find((b) => b.id === activeBuildingId) ?? null

  /* Which one wins when a viewer holds both — someone who manages one building
     and lives in another — is decided by the persona they are CURRENTLY acting
     as, not by which resolved first. `viewAs` is the same central value the tab
     bar and sidebar read; letting this screen invent its own precedence is how
     a surface drifts out of sync with the persona. */
  const actingAsManager = viewAs === "building-manager" || viewAs === "strata-manager"
  const building = actingAsManager
    ? (managedBuilding ?? residentBuilding)
    : (residentBuilding ?? managedBuilding)
  const buildingId = building?.id

  const { data: rules, isLoading: rulesLoading } = useMyBuildingRules(buildingId)
  const { data: petRules, isLoading: petRulesLoading } = useBuildingPetRules(buildingId)

  const [filter, setFilter] = useState<BuildingRuleCategory | "all">("all")

  const groups = useMemo(() => groupByCategory(rules), [rules])
  const requirements = useMemo(() => readRequirements(petRules), [petRules])
  const shown = filter === "all" ? groups : groups.filter((g) => g.category === filter)

  /* `authLoading` is in here because the manager's building comes from the
     persona grants, which arrive after the link does. Without it a manager
     renders the "you aren't linked to a building" card for a frame and then
     replaces it with their rules. */
  const loading =
    authLoading || linkLoading || (buildingId !== undefined && (rulesLoading || petRulesLoading))

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <IOSNavBar
        title={building?.name ?? "Building Rules"}
        largeTitle={false}
        leftAction={<NavBackButton onClick={onBack} />}
      />

      {/* pb-24 clears the fixed IOSTabBar (h-16 + safe area). A control that
          renders under it is a defect this project has shipped once already. */}
      <main className="ios-scroll flex-1 px-4 pb-24 pt-4">
        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : !buildingId ? (
          <NoBuilding onNavigate={onNavigate} pending={link?.status === "pending"} />
        ) : (
          <>
            {/* SECTION 1 — machine-checked. */}
            <section className="mb-5">
              <div className="mb-1.5 flex items-center gap-2 px-0.5">
                <ShieldCheck className="h-4 w-4 flex-shrink-0 text-success" />
                <h2 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Requirements Pet10x checks
                </h2>
              </div>
              <div className="rounded-2xl card-raised p-4">
                <p className="mb-2.5 text-[12px] leading-relaxed text-muted-foreground">
                  These affect your pet&apos;s compliance status. Pet10x checks them against your pet&apos;s records
                  automatically.
                </p>
                {requirements.length === 0 ? (
                  <p className="text-[13px] text-muted-foreground">
                    Your building has not set any pet requirements, so nothing here affects your compliance status.
                  </p>
                ) : (
                  <ul className="space-y-1.5">
                    {requirements.map((r) => (
                      <li key={r.key} className="flex items-start gap-2">
                        <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-success" />
                        <span className="text-[13.5px] leading-relaxed text-foreground">{r.label}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>

            {/* SECTION 2 — authored. */}
            <section>
              <div className="mb-1.5 flex items-center gap-2 px-0.5">
                <FileText className="h-4 w-4 flex-shrink-0 text-info" />
                <h2 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  House rules from your building manager
                </h2>
              </div>

              {groups.length === 0 ? (
                <div className="rounded-2xl card-raised p-4">
                  {/* One sentence. No fake content, no illustration, and no
                      promise of a feature later — the gap is stated as a fact
                      about this building, which is what it is. */}
                  <p className="text-[13.5px] leading-relaxed text-muted-foreground">
                    Your building manager hasn&apos;t published house rules here yet.
                  </p>
                </div>
              ) : (
                <>
                  {groups.length > 1 && (
                    <div className="mb-2.5 flex flex-wrap gap-1.5">
                      <Chip label="All" active={filter === "all"} onClick={() => setFilter("all")} />
                      {/* Only categories that HAVE rules get a chip — a filter
                          that returns nothing is a filter that lies about what
                          is here. */}
                      {groups.map((g) => (
                        <Chip
                          key={g.category}
                          label={g.label}
                          active={filter === g.category}
                          onClick={() => setFilter(g.category)}
                        />
                      ))}
                    </div>
                  )}

                  <div className="space-y-3">
                    {shown.map((group) => (
                      <div key={group.category}>
                        <h3 className="mb-1.5 px-0.5 text-[12px] font-semibold text-foreground">{group.label}</h3>
                        <div className="space-y-2">
                          {group.rules.map((r) => (
                            <article key={r.id} className="rounded-2xl card-raised p-4">
                              <div className="mb-1 flex items-start justify-between gap-2">
                                <h4 className="min-w-0 flex-1 break-words text-[15px] font-semibold text-foreground">
                                  {r.title}
                                </h4>
                                <span className="flex-shrink-0 rounded-full bg-info/10 px-2 py-0.5 text-[10.5px] font-semibold text-info">
                                  {CATEGORY_LABEL[r.category]}
                                </span>
                              </div>
                              {/* THE LINE THIS PHASE EXISTS FOR. The entire
                                  body, whitespace-pre-wrap, escaped by React,
                                  shortened by nothing.

                                  `break-words` is a WRAPPING utility, never a
                                  shortening one — no character is lost, the
                                  line simply turns. Without it
                                  `whitespace-pre-wrap` wraps at spaces ONLY, so
                                  one unbroken token — a long reference number,
                                  a URL, a `--------` divider a manager typed —
                                  runs straight off the card and pushes the
                                  whole page sideways at 375px. The body still
                                  renders in full; only the layout changes. */}
                              <p className="whitespace-pre-wrap break-words text-[14px] leading-relaxed text-foreground">
                                {r.body}
                              </p>
                              <p className="mt-2 text-[11px] text-muted-foreground">
                                Published by your building manager &middot; {relativeUpdated(r.updatedAt)}
                              </p>
                            </article>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </section>
          </>
        )}
      </main>
    </div>
  )
}

function Chip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-full border px-3 py-1 text-[12px] font-semibold transition-colors ${
        active ? "border-info bg-info/10 text-info" : "border-border text-foreground"
      }`}
    >
      {label}
    </button>
  )
}

/**
 * Someone with no approved building link. They are not a resident of anywhere,
 * so there are no rules to show and no honest way to guess which building's
 * rules they meant. The link flow is the answer, not an empty rules screen.
 */
function NoBuilding({ onNavigate, pending }: { onNavigate?: (screen: string) => void; pending?: boolean }) {
  return (
    <div className="rounded-2xl card-raised p-6 text-center">
      <span className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-info/10">
        <Building2 className="h-6 w-6 text-info" />
      </span>
      <h2 className="mb-1 text-[15px] font-semibold text-foreground">
        {pending ? "Your building request is still pending" : "You aren't linked to a building yet"}
      </h2>
      <p className="mb-4 text-[13px] leading-relaxed text-muted-foreground">
        {pending
          ? "Once your building manager approves your request, their house rules and requirements will appear here."
          : "House rules are written by your building manager. Link your building with its code to read them."}
      </p>
      {!pending && (
        <button
          onClick={() => onNavigate?.("link-building")}
          className="rounded-xl bg-primary px-4 py-2 text-[14px] font-semibold text-primary-foreground"
        >
          Link my building
        </button>
      )}
    </div>
  )
}

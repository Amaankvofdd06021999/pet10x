"use client"

import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { updateMyBuildingRules } from "@/lib/data/manager"
import { useComplianceInputs, type PetComplianceInput } from "@/lib/data/portfolio"
import type { PetRules } from "@/lib/data/admin"
import { useStrata } from "./portal-context"
import { BuildingBylawsEditor, RULE_TOGGLES, impactOf } from "./bylaws-editor"
import { SectionCard, Spinner, LoadError } from "./strata-ui"
import { ChevronDown, Save, Layers, Loader2, AlertTriangle, Trash2 } from "lucide-react"

interface Template {
  name: string
  rules: PetRules
}
const STORE_KEY = "pet10x.strata.bylaw_templates"

export function BylawsScreen() {
  const { buildings, isLoading, error, refetch } = useStrata()
  const { data: inputs, isLoading: inputsLoading, refetch: refetchInputs } = useComplianceInputs()
  const [openId, setOpenId] = useState<string | null>(null)
  const [templates, setTemplates] = useState<Template[]>([])

  // Templates are stored client-side (they're a manager convenience, not shared state).
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORE_KEY)
      if (raw) setTemplates(JSON.parse(raw) as Template[])
    } catch {
      /* ignore malformed store */
    }
  }, [])
  function persist(next: Template[]) {
    setTemplates(next)
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(next))
    } catch {
      /* ignore quota */
    }
  }

  const petsByBuilding = useMemo(() => {
    const m = new Map<string, PetComplianceInput[]>()
    for (const p of inputs) {
      if (!p.buildingId) continue
      const arr = m.get(p.buildingId) ?? []
      arr.push(p)
      m.set(p.buildingId, arr)
    }
    return m
  }, [inputs])

  if (isLoading || inputsLoading) return <Spinner />
  if (error) return <LoadError message={error} onRetry={refetch} />

  return (
    <div className="space-y-4">
      <BulkApply
        buildings={buildings}
        templates={templates}
        petsByBuilding={petsByBuilding}
        onSaveTemplate={(t) => persist([...templates.filter((x) => x.name !== t.name), t])}
        onDeleteTemplate={(name) => persist(templates.filter((x) => x.name !== name))}
        onApplied={() => {
          refetch()
          refetchInputs()
        }}
      />

      <SectionCard title="Per-building bylaws">
        <div className="space-y-2">
          {buildings.map((b) => {
            const open = openId === b.id
            return (
              <div key={b.id} className="rounded-xl border border-border">
                <button
                  onClick={() => setOpenId(open ? null : b.id)}
                  className="flex w-full items-center gap-3 p-3 text-left"
                >
                  <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-info/10">
                    <Layers className="h-4 w-4 text-info" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] font-semibold text-foreground">{b.name}</p>
                    <p className="text-[11.5px] text-muted-foreground">
                      {RULE_TOGGLES.filter((r) => b.rules?.[r.key]).length} rules active · {petsByBuilding.get(b.id)?.length ?? 0} pets
                    </p>
                  </div>
                  <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
                </button>
                {open && (
                  <div className="border-t border-border p-3">
                    <BuildingBylawsEditor
                      building={b}
                      pets={petsByBuilding.get(b.id) ?? []}
                      onSaved={() => {
                        refetch()
                        refetchInputs()
                      }}
                    />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </SectionCard>
    </div>
  )
}

function BulkApply({
  buildings,
  templates,
  petsByBuilding,
  onSaveTemplate,
  onDeleteTemplate,
  onApplied,
}: {
  buildings: ReturnType<typeof useStrata>["buildings"]
  templates: Template[]
  petsByBuilding: Map<string, PetComplianceInput[]>
  onSaveTemplate: (t: Template) => void
  onDeleteTemplate: (name: string) => void
  onApplied: () => void
}) {
  const [templateName, setTemplateName] = useState("")
  const [sourceId, setSourceId] = useState<string>("")
  const [selectedTemplate, setSelectedTemplate] = useState<string>("")
  const [targets, setTargets] = useState<Set<string>>(new Set())
  const [applying, setApplying] = useState(false)

  const template = templates.find((t) => t.name === selectedTemplate) ?? null

  const impact = useMemo(() => {
    if (!template) return { breaks: 0, heals: 0, buildings: 0 }
    let breaks = 0
    let heals = 0
    for (const id of targets) {
      const b = buildings.find((x) => x.id === id)
      if (!b) continue
      const r = impactOf(petsByBuilding.get(id) ?? [], b.rules ?? {}, template.rules)
      breaks += r.breaks
      heals += r.heals
    }
    return { breaks, heals, buildings: targets.size }
  }, [template, targets, buildings, petsByBuilding])

  function saveTemplate() {
    const src = buildings.find((b) => b.id === sourceId)
    if (!templateName.trim() || !src) return toast.error("Name the template and pick a source building.")
    onSaveTemplate({ name: templateName.trim(), rules: src.rules ?? {} })
    toast.success(`Template “${templateName.trim()}” saved from ${src.name}`)
    setTemplateName("")
  }

  async function apply() {
    if (!template || targets.size === 0) return
    setApplying(true)
    const ids = [...targets]
    const results = await Promise.allSettled(ids.map((id) => updateMyBuildingRules(id, template.rules)))
    setApplying(false)
    const ok = results.filter((r) => r.status === "fulfilled" && !r.value.error).length
    const failed = ids.length - ok
    if (ok) toast.success(`Applied “${template.name}” to ${ok} building${ok === 1 ? "" : "s"}`)
    if (failed) toast.error(`${failed} building${failed === 1 ? "" : "s"} failed`)
    setTargets(new Set())
    onApplied()
  }

  return (
    <SectionCard title="Templates & bulk apply">
      {/* Save a template */}
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          value={templateName}
          onChange={(e) => setTemplateName(e.target.value)}
          placeholder="Template name (e.g. Coastline Standard 2026)"
          className="min-w-0 flex-1 rounded-lg border border-border bg-background px-3 py-2 text-[13px] focus:border-info focus:outline-none"
        />
        <select
          value={sourceId}
          onChange={(e) => setSourceId(e.target.value)}
          className="rounded-lg border border-border bg-background px-3 py-2 text-[13px] text-foreground focus:border-info focus:outline-none"
        >
          <option value="">Copy rules from…</option>
          {buildings.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
        <button
          onClick={saveTemplate}
          className="flex items-center justify-center gap-1.5 rounded-lg bg-muted px-3 py-2 text-[13px] font-semibold text-foreground"
        >
          <Save className="h-4 w-4" /> Save
        </button>
      </div>

      {templates.length > 0 && (
        <div className="mt-4 border-t border-border pt-4">
          <p className="mb-2 text-[11.5px] font-semibold uppercase tracking-wide text-muted-foreground">Apply a template</p>
          <div className="flex flex-wrap gap-1.5">
            {templates.map((t) => (
              <span
                key={t.name}
                className={`flex items-center gap-1 rounded-full border px-2.5 py-1 text-[12px] ${
                  selectedTemplate === t.name ? "border-info bg-info/10 text-info" : "border-border text-foreground"
                }`}
              >
                <button onClick={() => setSelectedTemplate(selectedTemplate === t.name ? "" : t.name)} className="font-semibold">
                  {t.name}
                </button>
                <button onClick={() => onDeleteTemplate(t.name)} title="Delete template">
                  <Trash2 className="h-3 w-3 text-muted-foreground" />
                </button>
              </span>
            ))}
          </div>

          {template && (
            <div className="mt-3 space-y-3">
              <div>
                <p className="mb-1.5 text-[12px] text-muted-foreground">Apply to:</p>
                <div className="flex flex-wrap gap-1.5">
                  {buildings.map((b) => {
                    const on = targets.has(b.id)
                    return (
                      <button
                        key={b.id}
                        onClick={() =>
                          setTargets((prev) => {
                            const next = new Set(prev)
                            if (next.has(b.id)) next.delete(b.id)
                            else next.add(b.id)
                            return next
                          })
                        }
                        className={`rounded-lg border px-2.5 py-1.5 text-[12px] font-medium transition-colors ${
                          on ? "border-info bg-info/10 text-info" : "border-border text-foreground hover:bg-muted"
                        }`}
                      >
                        {b.name}
                      </button>
                    )
                  })}
                </div>
              </div>

              {targets.size > 0 && (
                <div
                  className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-[12.5px] ${
                    impact.breaks > 0 ? "border-warning/40 bg-warning/10" : "border-border bg-muted/40"
                  }`}
                >
                  {impact.breaks > 0 && <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-warning" />}
                  <span className="text-foreground">
                    Applying to {impact.buildings} building{impact.buildings === 1 ? "" : "s"}:{" "}
                    <strong>{impact.breaks}</strong> pet{impact.breaks === 1 ? "" : "s"} become non-compliant
                    {impact.heals > 0 ? `, ${impact.heals} brought into compliance` : ""}.
                  </span>
                </div>
              )}

              <button
                onClick={apply}
                disabled={applying || targets.size === 0}
                className="flex items-center gap-2 rounded-xl bg-info px-4 py-2 text-[13px] font-semibold text-info-foreground disabled:opacity-50"
              >
                {applying && <Loader2 className="h-4 w-4 animate-spin" />}
                Apply to {targets.size} building{targets.size === 1 ? "" : "s"}
              </button>
            </div>
          )}
        </div>
      )}
    </SectionCard>
  )
}

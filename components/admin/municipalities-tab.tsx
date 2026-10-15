"use client"

import { useCallback, useEffect, useState } from "react"
import { Loader2, Plus } from "lucide-react"
import { toast } from "sonner"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { validateMunicipalityForm, type MunicipalityFormField } from "@/lib/data/municipality-form"

interface Municipality {
  id: string
  name: string
  region: string | null
  postal_prefixes: string[]
  animal_control_phone: string | null
  animal_control_url: string | null
  is_active: boolean
}

interface FormState {
  id: string | null
  name: string
  region: string
  prefixes: string
  phone: string
  url: string
  active: boolean
}

const EMPTY: FormState = { id: null, name: "", region: "", prefixes: "", phone: "", url: "", active: true }

const INPUT =
  "w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-[14px] font-normal text-foreground focus:border-primary focus:outline-none"

/**
 * Admin console › Municipalities. A municipality's postal prefixes decide
 * which city a report matches, and until now they could only be changed with
 * SQL. Writes go through the browser client under `municipalities_admin_write`.
 */
export function MunicipalitiesTab() {
  const [rows, setRows] = useState<Municipality[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [form, setForm] = useState<FormState | null>(null)
  const [errors, setErrors] = useState<Partial<Record<MunicipalityFormField, string>>>({})
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  // Set when saving would deactivate a municipality that buildings use.
  const [confirm, setConfirm] = useState<{ count: number } | null>(null)

  const load = useCallback(async () => {
    const supabase = getSupabaseBrowserClient()
    if (!supabase) return
    const { data, error } = await supabase
      .from("municipalities")
      .select("id, name, region, postal_prefixes, animal_control_phone, animal_control_url, is_active")
      .order("name")
    if (error) {
      console.error("[admin-municipalities] load failed", error)
      setLoadError("Couldn't load municipalities. Try again.")
    } else {
      setRows(data ?? [])
      setLoadError(null)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const edit = (m: Municipality) => {
    setErrors({})
    setSaveError(null)
    setForm({
      id: m.id,
      name: m.name,
      region: m.region ?? "",
      prefixes: m.postal_prefixes.join(", "),
      phone: m.animal_control_phone ?? "",
      url: m.animal_control_url ?? "",
      active: m.is_active,
    })
  }

  const write = async (f: FormState): Promise<{ error: string | null }> => {
    const supabase = getSupabaseBrowserClient()
    if (!supabase) return { error: "Not configured." }
    const v = validateMunicipalityForm(f)
    if (!v.ok) return { error: "Fix the highlighted fields." }
    const payload = {
      name: v.value.name,
      region: v.value.region,
      postal_prefixes: v.value.postalPrefixes,
      animal_control_phone: v.value.phone,
      animal_control_url: v.value.url,
      is_active: f.active,
    }
    const { error } = f.id
      ? await supabase.from("municipalities").update(payload).eq("id", f.id)
      : await supabase.from("municipalities").insert(payload)
    if (error) {
      console.error("[admin-municipalities] save failed", error)
      // lower(name), lower(region) is unique.
      return {
        error:
          error.code === "23505"
            ? "A municipality with this name and region already exists."
            : "Couldn't save the municipality. Try again.",
      }
    }
    await load()
    setForm(null)
    toast.success(f.id ? "Municipality saved" : "Municipality added")
    return { error: null }
  }

  const submit = async () => {
    if (!form) return
    const v = validateMunicipalityForm(form)
    if (!v.ok) {
      setErrors(v.errors)
      return
    }
    setErrors({})
    setSaveError(null)
    setSaving(true)
    const was = rows.find((r) => r.id === form.id)
    if (form.id && was?.is_active && !form.active) {
      // Allowed, but say how many buildings it affects first.
      const supabase = getSupabaseBrowserClient()
      const { count, error } = supabase
        ? await supabase.from("buildings").select("id", { count: "exact", head: true }).eq("municipality_id", form.id)
        : { count: null, error: { message: "Not configured." } }
      setSaving(false)
      if (error) {
        setSaveError("Couldn't check which buildings use this municipality. Try again.")
        return
      }
      if ((count ?? 0) > 0) {
        setConfirm({ count: count ?? 0 })
        return
      }
      setSaving(true)
    }
    const r = await write(form)
    setSaving(false)
    if (r.error) setSaveError(r.error)
  }

  const field = (key: MunicipalityFormField, label: string, opts: { hint?: string; type?: string } = {}) => {
    const formKey = key === "prefixes" ? "prefixes" : key
    const err = errors[key]
    return (
      <label className="block text-[13px] font-semibold text-foreground">
        {label}
        <input
          type={opts.type ?? "text"}
          value={form?.[formKey] ?? ""}
          onChange={(e) => setForm((f) => (f ? { ...f, [formKey]: e.target.value } : f))}
          aria-invalid={err ? true : undefined}
          aria-describedby={err ? `muni-${key}-err` : undefined}
          className={`${INPUT} mt-1`}
        />
        {opts.hint && !err && <span className="mt-1 block text-[12px] font-normal text-muted-foreground">{opts.hint}</span>}
        {err && (
          <span id={`muni-${key}-err`} role="alert" className="mt-1 block text-[12px] font-normal text-destructive">
            {err}
          </span>
        )}
      </label>
    )
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="text-[13px] leading-relaxed text-muted-foreground">
          Postal prefixes decide which city a report matches.
        </p>
        <button
          onClick={() => {
            setErrors({})
            setSaveError(null)
            setForm({ ...EMPTY })
          }}
          className="flex flex-shrink-0 items-center gap-1.5 rounded-lg bg-primary-strong px-3 py-1.5 text-[13px] font-semibold text-primary-foreground"
        >
          <Plus className="h-3.5 w-3.5" /> Add municipality
        </button>
      </div>

      {form && (
        <div className="mb-4 space-y-3 rounded-2xl card-raised p-4">
          <h2 className="text-[15px] font-semibold">{form.id ? "Edit municipality" : "Add municipality"}</h2>
          {field("name", "Name")}
          {field("region", "Region", { hint: "For example BC." })}
          {field("prefixes", "Postal prefixes", { hint: "First three characters, separated by commas or spaces, like V6B, V6C." })}
          {field("phone", "Animal control phone (optional)", { type: "tel" })}
          {field("url", "Animal control web address (optional)", { type: "url" })}
          <label className="flex items-center gap-2 text-[13px] font-semibold">
            <input
              type="checkbox"
              checked={form.active}
              onChange={(e) => setForm((f) => (f ? { ...f, active: e.target.checked } : f))}
            />
            Active
          </label>
          {saveError && (
            <p role="alert" className="text-[13px] text-destructive">
              {saveError}
            </p>
          )}
          <div className="flex gap-2">
            <button
              onClick={() => void submit()}
              disabled={saving}
              className="flex items-center gap-2 rounded-lg bg-primary-strong px-4 py-2 text-[13px] font-semibold text-primary-foreground disabled:opacity-60"
            >
              {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Save
            </button>
            <button onClick={() => setForm(null)} className="rounded-lg bg-muted px-4 py-2 text-[13px] font-semibold">
              Cancel
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : loadError ? (
        <div role="alert" className="rounded-2xl border border-destructive/20 bg-destructive/5 p-4 text-center">
          <p className="text-[13px]">{loadError}</p>
          <button onClick={() => void load()} className="mt-2 text-[13px] font-semibold text-primary-text">
            Try again
          </button>
        </div>
      ) : rows.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border bg-card p-8 text-center text-[13px] text-muted-foreground">
          No municipalities yet.
        </p>
      ) : (
        <ul className="overflow-hidden rounded-2xl card-raised">
          {rows.map((m, i) => (
            <li key={m.id} className={`flex items-start justify-between gap-3 px-3.5 py-3 ${i === rows.length - 1 ? "" : "border-b border-border"}`}>
              <div className="min-w-0">
                <p className="text-[14px] font-semibold text-foreground">
                  {m.name}
                  {m.region ? `, ${m.region}` : ""}
                  {!m.is_active && <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">Inactive</span>}
                </p>
                <p className="text-[12.5px] text-muted-foreground">
                  {m.postal_prefixes.length > 0 ? m.postal_prefixes.join(", ") : "No postal prefixes"}
                </p>
              </div>
              <button onClick={() => edit(m)} aria-label={`Edit ${m.name}`} className="flex-shrink-0 text-[13px] font-semibold text-primary-text">
                Edit
              </button>
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(o) => !o && setConfirm(null)}
        title="Deactivate this municipality?"
        description={
          confirm
            ? `${confirm.count} building${confirm.count === 1 ? " uses" : "s use"} this municipality. They keep it, but reports will stop matching it while it is inactive.`
            : ""
        }
        confirmLabel="Deactivate"
        tone="danger"
        onConfirm={async () => {
          if (!form) return { error: "Nothing to save." }
          const r = await write(form)
          if (!r.error) setConfirm(null)
          return r
        }}
      />
    </div>
  )
}

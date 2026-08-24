"use client"

import { useEffect, useState } from "react"
import { toast } from "sonner"
import { Building2, ChevronRight, Loader2, MapPin } from "lucide-react"
import { useMyBuildingLink } from "@/lib/data"
import {
  getMyAddress,
  updateMyAddress,
  buildingsMatchingMyAddress,
  setMyUnit,
  type MyAddress,
} from "@/lib/data/account"

/**
 * Home address, for owners with no building link.
 *
 * A standalone owner ("just here for my pet") has no resident_link, so no unit
 * and no building — but they still live somewhere, and that somewhere may
 * already be on Pet10x. Saving an address is what lets us notice.
 *
 * When it matches, we say the building's name and tell them to ask their
 * manager for a code. We deliberately cannot hand them the code or join them:
 * the matching function returns names only. Address proximity is not
 * permission — otherwise anyone who guessed a postal code could enrol
 * themselves into a building's register.
 */
export function AddressCard({ onNavigate }: { onNavigate?: (screen: string) => void }) {
  const { data: link, refetch: refetchLink } = useMyBuildingLink()
  const [address, setAddress] = useState<MyAddress | null>(null)
  const [matches, setMatches] = useState<string[]>([])
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const [editingUnit, setEditingUnit] = useState(false)
  const [unitDraft, setUnitDraft] = useState("")
  const [savingUnit, setSavingUnit] = useState(false)
  const [draft, setDraft] = useState<MyAddress>({
    streetAddress: "",
    addressUnit: "",
    city: "",
    region: "",
    postalCode: "",
  })

  async function load() {
    const a = await getMyAddress()
    setAddress(a)
    if (a) setDraft(a)
    setMatches(await buildingsMatchingMyAddress())
    setLoading(false)
  }

  useEffect(() => {
    void load()
  }, [])

  async function save() {
    setSaving(true)
    const { error } = await updateMyAddress(draft)
    setSaving(false)
    if (error) return toast.error("Couldn't save", { description: error })
    toast.success("Address saved")
    setEditing(false)
    void load()
  }

  async function saveUnit() {
    setSavingUnit(true)
    const { error, unit } = await setMyUnit(unitDraft)
    setSavingUnit(false)
    if (error) return toast.error("Couldn't save", { description: error })
    toast.success(unit ? `Unit set to ${unit}` : "Unit cleared")
    setEditingUnit(false)
    refetchLink()
  }

  if (loading) return null

  /* Linked to a building: the address comes FROM the building.
   *
   * It was asking a linked resident to type an address they had already told
   * us by joining, producing a second copy that drifts the moment a manager
   * corrects theirs. Read-only here; the manager edits it on their side and it
   * changes here immediately. The unit stays the resident's to give, and lives
   * in its own row above this one. */
  if (link) {
    const buildingAddress = [link.buildingAddress, link.buildingCity, link.buildingRegion, link.buildingPostalCode]
      .filter(Boolean)
      .join(", ")

    return (
      <section className="mb-5">
        <div className="rounded-2xl card-raised p-4">
          <div className="flex items-start gap-3">
            <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-primary/10">
              <MapPin className="h-4.5 w-4.5 text-primary" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[14px] font-semibold text-foreground">Home address</p>
              <p className="mt-0.5 text-[12.5px] leading-relaxed text-muted-foreground">
                {buildingAddress ? (
                  <>
                    {link.unit ? `Unit ${link.unit}, ` : ""}
                    {buildingAddress}
                  </>
                ) : (
                  <>From {link.buildingName}. Your manager hasn&apos;t added the building address yet.</>
                )}
              </p>

              {/* Unit editing lives HERE, not in a separate row.
                  It had its own card above this one, so a linked resident saw
                  "Unit 302" three times on one screen — in the profile header,
                  in a row that looked like it was asking for it again, and
                  inside this address. The building's part is the manager's to
                  maintain; the unit is the only piece that is theirs. */}
              {editingUnit ? (
                <div className="mt-3">
                  <label htmlFor="unit-number" className="mb-1 block text-[11.5px] font-semibold text-muted-foreground">
                    Unit number
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      id="unit-number"
                      value={unitDraft}
                      onChange={(e) => setUnitDraft(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && saveUnit()}
                      placeholder="e.g. 2104"
                      autoFocus
                      className="min-w-0 flex-1 rounded-lg border border-border bg-background px-3 py-2 text-[14px] focus:border-primary focus:outline-none"
                    />
                    <button
                      onClick={saveUnit}
                      disabled={savingUnit}
                      className="flex flex-shrink-0 items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-[13px] font-semibold text-primary-foreground disabled:opacity-60"
                    >
                      {savingUnit && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Save
                    </button>
                  </div>
                  <button
                    onClick={() => setEditingUnit(false)}
                    className="mt-1.5 text-[12px] font-medium text-muted-foreground"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => {
                    setUnitDraft(link.unit ?? "")
                    setEditingUnit(true)
                  }}
                  className="mt-2 text-[12.5px] font-semibold text-primary"
                >
                  {link.unit ? "Change unit number" : "Add your unit number"}
                </button>
              )}

              <p className="mt-2 text-[11.5px] text-muted-foreground">
                The building&apos;s address is maintained by {link.buildingName}.
              </p>
            </div>
          </div>
        </div>
      </section>
    )
  }

  const summary = [address?.addressUnit ? `Unit ${address.addressUnit}` : null, address?.streetAddress, address?.city]
    .filter(Boolean)
    .join(", ")

  if (!editing) {
    return (
      <section className="mb-5">
        <button
          onClick={() => setEditing(true)}
          className="flex w-full items-center gap-3 rounded-2xl card-interactive p-4 text-left transition-colors active:bg-muted"
        >
          <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-primary/10">
            <MapPin className="h-4.5 w-4.5 text-primary" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[14px] font-semibold text-foreground">Home address</span>
            <span className="block truncate text-[12px] text-muted-foreground">
              {summary || "Not set — add it to see if your building uses Pet10x"}
            </span>
          </span>
          <ChevronRight className="h-5 w-5 flex-shrink-0 text-muted-foreground" />
        </button>

        {matches.length > 0 && (
          <div className="mt-2 rounded-2xl border border-primary/25 bg-primary/5 p-4">
            <div className="flex items-start gap-3">
              <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-primary/15">
                <Building2 className="h-4.5 w-4.5 text-primary" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[14px] font-semibold text-foreground">
                  {matches[0]}{" "}
                  uses Pet10x
                </p>
                <p className="mt-0.5 text-[12.5px] leading-relaxed text-muted-foreground">
                  Do you have a building code? Entering it links you and your pet to the building. If you
                  don&apos;t have one, ask your building manager for it.
                </p>
                <button
                  onClick={() => onNavigate?.("link-building")}
                  className="mt-2.5 rounded-lg bg-primary px-3.5 py-2 text-[13px] font-semibold text-primary-foreground"
                >
                  I have a code
                </button>
              </div>
            </div>
          </div>
        )}
      </section>
    )
  }

  return (
    <section className="mb-5 rounded-2xl card-raised p-4">
      <h3 className="mb-3 text-[14px] font-semibold text-foreground">Home address</h3>
      <div className="flex flex-col gap-2">
        <Row label="Street address" value={draft.streetAddress} onChange={(v) => setDraft({ ...draft, streetAddress: v })} placeholder="123 Main St" />
        <div className="grid grid-cols-2 gap-2">
          <Row label="Unit" value={draft.addressUnit} onChange={(v) => setDraft({ ...draft, addressUnit: v })} placeholder="2104" />
          <Row label="Postal code" value={draft.postalCode} onChange={(v) => setDraft({ ...draft, postalCode: v })} placeholder="V6B 1A1" />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Row label="City" value={draft.city} onChange={(v) => setDraft({ ...draft, city: v })} placeholder="Vancouver" />
          <Row label="Province" value={draft.region} onChange={(v) => setDraft({ ...draft, region: v })} placeholder="BC" />
        </div>
      </div>
      {/* Says why we are asking. An address field with no stated purpose on a
          pet app reads as data collection for its own sake. */}
      <p className="mt-2 text-[11.5px] leading-relaxed text-muted-foreground">
        Used to check whether your building already uses Pet10x. Not shared with anyone.
      </p>
      <div className="mt-3 flex items-center gap-2">
        <button
          onClick={save}
          disabled={saving}
          className="flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 text-[14px] font-semibold text-primary-foreground disabled:opacity-60"
        >
          {saving && <Loader2 className="h-4 w-4 animate-spin" />} Save
        </button>
        <button onClick={() => setEditing(false)} className="text-[12.5px] font-medium text-muted-foreground">
          Cancel
        </button>
      </div>
    </section>
  )
}

function Row({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string
  value: string | null
  onChange: (v: string) => void
  placeholder?: string
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11.5px] font-semibold text-muted-foreground">{label}</span>
      <input
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-[15px] focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
      />
    </label>
  )
}

"use client"

import { useState } from "react"
import { toast } from "sonner"
import { CalendarClock, Loader2, Plus, Stethoscope, Trash2, X } from "lucide-react"
import { usePetVetVisits, addVetVisit, deleteVetVisit } from "@/lib/data"
import { Portal } from "@/components/ui/portal"

/**
 * Vet visit history for a pet.
 *
 * The pet already carried a vet's clinic, name and phone — who to call. It had
 * nowhere to record what actually happened: the check-up, the dental, the
 * reason for the limp last spring. An owner changing vets, or handing the pet
 * to a sitter, had nothing to hand over.
 *
 * Deliberately not folded into Vaccinations or Documents. Those are
 * certificates with expiry dates that drive compliance; a visit is a record of
 * care that never expires and affects no percentage.
 */
export function VetRecords({ petId }: { petId: string }) {
  const { data: visits, isLoading, refetch } = usePetVetVisits(petId)
  const [adding, setAdding] = useState(false)

  return (
    <section className="mb-5">
      <div className="mb-2.5 flex items-center justify-between">
        <h3 className="text-[15px] font-semibold text-foreground">Vet records</h3>
        <button
          onClick={() => setAdding(true)}
          className="flex items-center gap-1.5 text-[13px] font-semibold text-primary"
        >
          <Plus className="h-3.5 w-3.5" /> Add visit
        </button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : visits.length === 0 ? (
        <button
          onClick={() => setAdding(true)}
          className="flex w-full flex-col items-center gap-1 rounded-2xl border border-dashed border-border bg-card px-4 py-8"
        >
          <Stethoscope className="h-6 w-6 text-muted-foreground" />
          <span className="text-[13.5px] font-semibold text-foreground">No visits recorded</span>
          <span className="text-[12px] text-muted-foreground">Check-ups, dentals, treatments</span>
        </button>
      ) : (
        <div className="flex flex-col gap-2">
          {visits.map((v) => (
            <div key={v.id} className="rounded-2xl border border-border bg-card p-3.5">
              <div className="flex items-start gap-3">
                <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-primary/10">
                  <Stethoscope className="h-4.5 w-4.5 text-primary" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] font-semibold text-foreground">{v.reason}</p>
                  <p className="mt-0.5 text-[12px] text-muted-foreground">
                    {new Date(`${v.visitedOn}T00:00:00`).toLocaleDateString("en-CA", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                    {v.clinic ? ` · ${v.clinic}` : ""}
                    {v.vetName ? ` · ${v.vetName}` : ""}
                  </p>
                  {v.notes && <p className="mt-1.5 text-[12.5px] leading-relaxed text-foreground">{v.notes}</p>}
                  {v.followUpOn && (
                    <p className="mt-1.5 flex items-center gap-1.5 text-[12px] font-medium text-primary">
                      <CalendarClock className="h-3.5 w-3.5" />
                      Follow-up{" "}
                      {new Date(`${v.followUpOn}T00:00:00`).toLocaleDateString("en-CA", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </p>
                  )}
                </div>
                <button
                  onClick={async () => {
                    const { error } = await deleteVetVisit(v.id)
                    if (error) return toast.error("Couldn't remove", { description: error })
                    toast("Visit removed")
                    refetch()
                  }}
                  aria-label={`Remove ${v.reason}`}
                  className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-muted-foreground"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {adding && (
        <AddVisit
          petId={petId}
          onClose={() => setAdding(false)}
          onSaved={() => {
            setAdding(false)
            refetch()
          }}
        />
      )}
    </section>
  )
}

function AddVisit({ petId, onClose, onSaved }: { petId: string; onClose: () => void; onSaved: () => void }) {
  const today = new Date().toISOString().slice(0, 10)
  const [visitedOn, setVisitedOn] = useState(today)
  const [reason, setReason] = useState("")
  const [clinic, setClinic] = useState("")
  const [vetName, setVetName] = useState("")
  const [notes, setNotes] = useState("")
  const [followUpOn, setFollowUpOn] = useState("")
  const [saving, setSaving] = useState(false)

  async function save() {
    if (!reason.trim()) return toast.error("What was the visit for?")
    setSaving(true)
    const { error } = await addVetVisit({ petId, visitedOn, reason, clinic, vetName, notes, followUpOn })
    setSaving(false)
    if (error) return toast.error("Couldn't save", { description: error })
    toast.success("Visit recorded")
    onSaved()
  }

  return (
    /* Portalled: every screen in /app animates opacity, which creates a
       stacking context that would trap this behind the tab bar. */
    <Portal>
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
        <button aria-label="Close" onClick={onClose} className="absolute inset-0 bg-foreground/40 backdrop-blur-[2px]" />
        <div
          role="dialog"
          aria-label="Add a vet visit"
          className="relative max-h-[85dvh] w-full max-w-md overflow-y-auto rounded-3xl border border-border bg-card p-5 shadow-xl"
        >
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-[17px] font-semibold text-foreground">Add a vet visit</h2>
            <button
              onClick={onClose}
              aria-label="Close"
              className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="flex flex-col gap-2.5">
            <Field label="What was it for?">
              <input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Annual check-up, dental, limping…"
                autoFocus
                className="w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-[14px] focus:border-primary focus:outline-none"
              />
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Date">
                <input
                  type="date"
                  value={visitedOn}
                  max={today}
                  onChange={(e) => setVisitedOn(e.target.value)}
                  className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-[14px] focus:border-primary focus:outline-none"
                />
              </Field>
              <Field label="Follow-up (optional)">
                <input
                  type="date"
                  value={followUpOn}
                  onChange={(e) => setFollowUpOn(e.target.value)}
                  className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-[14px] focus:border-primary focus:outline-none"
                />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Clinic">
                <input
                  value={clinic}
                  onChange={(e) => setClinic(e.target.value)}
                  placeholder="Optional"
                  className="w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-[14px] focus:border-primary focus:outline-none"
                />
              </Field>
              <Field label="Vet">
                <input
                  value={vetName}
                  onChange={(e) => setVetName(e.target.value)}
                  placeholder="Optional"
                  className="w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-[14px] focus:border-primary focus:outline-none"
                />
              </Field>
            </div>
            <Field label="Notes">
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                placeholder="What the vet said, medication started, anything to watch…"
                className="w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-[14px] focus:border-primary focus:outline-none"
              />
            </Field>
          </div>

          <button
            onClick={save}
            disabled={saving}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3 text-[15px] font-semibold text-primary-foreground disabled:opacity-60"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />} Save visit
          </button>
        </div>
      </div>
    </Portal>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11.5px] font-semibold text-muted-foreground">{label}</span>
      {children}
    </label>
  )
}

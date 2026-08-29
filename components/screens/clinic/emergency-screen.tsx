"use client"

import { useState } from "react"
import { Siren, ShieldAlert, Phone, Clock } from "lucide-react"
import type { ClinicMembership } from "@/lib/data/clinic/context"
import { capabilities } from "@/lib/data/clinic/context"
import {
  useEmergencyArrivals, setArrivalStatus, useEmergencyPulls, emergencyPull,
  useOnCall, type EmergencyProjection,
} from "@/lib/data/clinic/emergency"
import { formatDateShort } from "@/lib/data/clinic/time"
import {
  SectionCard, Spinner, LoadError, EmptyState, Button, Pill, Modal,
  Field, TextInput, Toolbar,
} from "@/components/screens/shared/ui"

export function ClinicEmergencyScreen({ clinic }: { clinic: ClinicMembership }) {
  const arrivals = useEmergencyArrivals(clinic.businessId)
  const pulls = useEmergencyPulls(clinic.businessId)
  const onCall = useOnCall(clinic.businessId)
  const [pullOpen, setPullOpen] = useState(false)
  const caps = capabilities(clinic.role, clinic.tier, clinic.isOwner)

  return (
    <div className="flex flex-col gap-4">
      <SectionCard
        title="On their way"
        subtitle="Sent by owners from the Pet10x emergency card"
        actions={
          caps.emergencyPull && (
            <Button size="sm" variant="danger" onClick={() => setPullOpen(true)}>
              <ShieldAlert className="h-4 w-4" aria-hidden="true" /> Emergency lookup
            </Button>
          )
        }
      >
        {arrivals.isLoading ? (
          <Spinner />
        ) : arrivals.error ? (
          <LoadError message={arrivals.error} onRetry={arrivals.refetch} />
        ) : arrivals.data.length === 0 ? (
          <EmptyState
            title="Nothing inbound"
            detail="When an owner taps “tell them I'm coming”, the animal appears here with weight and allergies before it arrives."
            icon={<Siren className="h-5 w-5" aria-hidden="true" />}
          />
        ) : (
          <ul className="flex flex-col gap-2">
            {arrivals.data.map((a) => (
              <li key={a.id} className="rounded-xl border border-destructive/30 bg-destructive/5 p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 text-[14px] font-semibold text-foreground">
                      {a.petName ?? "Animal"}
                      <Pill tone="bad">{a.triageLevel}</Pill>
                      {a.etaMinutes !== null && <Pill tone="warn">ETA {a.etaMinutes} min</Pill>}
                      <Pill tone="neutral">{a.status}</Pill>
                    </p>
                    <p className="mt-0.5 text-[13px] text-foreground">{a.problem}</p>
                    <p className="text-[12px] text-muted-foreground">
                      {[
                        a.species,
                        a.weightGrams ? `${(a.weightGrams / 1000).toFixed(1)} kg` : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                    {a.allergies && (
                      <p className="mt-1 text-[12.5px] font-semibold text-destructive">Allergies: {a.allergies}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5">
                    {a.contactPhone && (
                      <a
                        href={`tel:${a.contactPhone.replace(/[^\d+]/g, "")}`}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-border px-2.5 py-1.5 text-[12.5px] font-semibold"
                      >
                        <Phone className="h-3.5 w-3.5" aria-hidden="true" /> Call owner
                      </a>
                    )}
                    {a.status === "incoming" && (
                      <Button
                        size="sm"
                        onClick={async () => {
                          await setArrivalStatus(a.id, "arrived")
                          arrivals.refetch()
                        }}
                      >
                        Arrived
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={async () => {
                        await setArrivalStatus(a.id, "handled")
                        arrivals.refetch()
                      }}
                    >
                      Done
                    </Button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <SectionCard title="On call" subtitle="Who covers after hours">
        {onCall.data.length === 0 ? (
          <EmptyState title="No on-call cover set" icon={<Clock className="h-5 w-5" aria-hidden="true" />} />
        ) : (
          <ul className="flex flex-col gap-2">
            {onCall.data.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border p-3">
                <div>
                  <p className="text-[13.5px] font-semibold text-foreground">{s.staffName}</p>
                  <p className="text-[12px] text-muted-foreground">
                    {formatDateShort(s.startsAt)} → {formatDateShort(s.endsAt)}
                  </p>
                </div>
                {s.phone && <Pill tone="neutral">{s.phone}</Pill>}
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <SectionCard title="Emergency access log" subtitle="Every break-glass lookup, reviewable">
        {pulls.data.length === 0 ? (
          <EmptyState title="No emergency lookups" detail="Break-glass access is rare by design and always recorded." />
        ) : (
          <ul className="flex flex-col gap-2">
            {pulls.data.map((p) => (
              <li key={p.id} className="rounded-xl border border-border p-3">
                <p className="text-[13px] font-medium text-foreground">{p.reason}</p>
                <p className="text-[12px] text-muted-foreground">
                  {formatDateShort(p.pulledAt)} ·{" "}
                  {p.reviewedAt ? `reviewed: ${p.reviewOutcome}` : "awaiting review"}
                </p>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <EmergencyPullModal
        open={pullOpen}
        onClose={() => setPullOpen(false)}
        businessId={clinic.businessId}
        onDone={() => {
          pulls.refetch()
        }}
      />
    </div>
  )
}

function EmergencyPullModal({
  open, onClose, businessId, onDone,
}: {
  open: boolean
  onClose: () => void
  businessId: string
  onDone: () => void
}) {
  const [petId, setPetId] = useState("")
  const [reason, setReason] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<EmergencyProjection | null>(null)

  return (
    <Modal
      open={open}
      onClose={() => {
        setResult(null)
        setError(null)
        onClose()
      }}
      title="Emergency lookup"
      description="For an animal in front of you whose owner cannot be reached. The owner is told immediately and every lookup is reviewed."
      footer={
        !result && (
          <>
            <Button variant="secondary" onClick={onClose}>Cancel</Button>
            <Button
              variant="danger"
              busy={busy}
              onClick={async () => {
                setBusy(true)
                setError(null)
                const res = await emergencyPull(businessId, petId.trim(), reason)
                setBusy(false)
                if (res.error) setError(res.error)
                else {
                  setResult(res.data ?? null)
                  onDone()
                }
              }}
            >
              Break glass
            </Button>
          </>
        )
      }
    >
      {result ? (
        <div className="flex flex-col gap-2">
          <p className="rounded-xl bg-warning/10 p-3 text-[12.5px] font-medium text-warning-strong">
            The owner has been notified and this lookup is logged.
          </p>
          <dl className="grid gap-2 sm:grid-cols-2">
            {[
              ["Name", result.name],
              ["Species", result.species],
              ["Breed", result.breed],
              ["Weight", result.weight_grams ? `${(result.weight_grams / 1000).toFixed(1)} kg` : null],
              ["Allergies", result.allergies],
              ["Conditions", result.conditions],
              ["Medications", result.medications_notes],
              ["Owner", result.owner_name],
              ["Owner phone", result.owner_phone],
            ].map(([k, v]) => (
              <div key={String(k)}>
                <dt className="text-[11.5px] font-semibold uppercase tracking-wide text-muted-foreground">{k}</dt>
                <dd className="text-[13px] text-foreground">{v ? String(v) : "—"}</dd>
              </div>
            ))}
          </dl>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <Field label="Pet identifier" hint="The Pet10x pet id, read from a tag or the owner's app." required>
            {(p) => <TextInput {...p} value={petId} onChange={(e) => setPetId(e.target.value)} placeholder="uuid" className="font-mono text-[12px]" />}
          </Field>
          <Field label="Reason" required error={error} hint="Retained with your name against this lookup.">
            {(p) => (
              <TextInput
                {...p}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Collapsed on arrival, owner unreachable"
              />
            )}
          </Field>
        </div>
      )}
    </Modal>
  )
}

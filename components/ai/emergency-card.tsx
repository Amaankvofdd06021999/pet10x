"use client"

import { useState } from "react"
import { AlertTriangle, MapPin, Phone, Send, Check } from "lucide-react"
import type { EmergencyCard as EmergencyCardData } from "@/lib/ai/types"
import { notifyArrival } from "@/lib/data/owner-vets"

/**
 * Rendered instead of an answer when triage says emergency.
 *
 * Nothing here is model-written. The owner's own vet number comes first,
 * because at 2am the thing that helps is a number to press, not prose.
 */
export function EmergencyCard({ card }: { card: EmergencyCardData }) {
  const subject = card.petName ? card.petName : "Your pet"
  const [told, setTold] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  return (
    <div className="rounded-2xl border-2 border-destructive/40 bg-destructive/5 p-4">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-destructive">
          <AlertTriangle className="h-5 w-5 text-destructive-foreground" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-[16px] font-semibold text-destructive">Call a vet now</h3>
          <p className="mt-1 text-[13px] leading-relaxed text-foreground">
            {subject} may need urgent care — {card.reasons.join("; ").toLowerCase()}. Don&apos;t wait for advice here.
          </p>
        </div>
      </div>

      {card.vetPhone && (
        <a
          href={`tel:${card.vetPhone.replace(/[^\d+]/g, "")}`}
          className="mt-3.5 flex items-center gap-3 rounded-xl bg-destructive px-4 py-3 text-destructive-foreground transition-transform active:scale-[0.98]"
        >
          <Phone className="h-5 w-5 flex-shrink-0" fill="currentColor" />
          <span className="min-w-0 flex-1">
            <span className="block text-[10px] font-medium uppercase tracking-wide opacity-80">
              {subject}&apos;s vet{card.vetClinic ? ` · ${card.vetClinic}` : ""}
            </span>
            <span className="block truncate text-[16px] font-semibold">{card.vetPhone}</span>
          </span>
        </a>
      )}

      {card.clinics.length > 0 && (
        <div className="mt-3">
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Emergency clinics nearby
          </p>
          <div className="flex flex-col gap-1.5">
            {card.clinics.map((clinic) => {
              const where = [clinic.address, clinic.city].filter(Boolean).join(", ")
              return (
                <div key={clinic.id} className="rounded-xl card-raised p-2.5">
                  <div className="flex items-start gap-2">
                    <MapPin className="mt-0.5 h-4 w-4 flex-shrink-0 text-destructive" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-semibold text-foreground">{clinic.name}</p>
                      <p className="truncate text-[11px] text-muted-foreground">
                        {where || "Address not listed"}
                        {clinic.distanceKm != null ? ` · ${clinic.distanceKm.toFixed(1)} km` : ""}
                      </p>
                    </div>
                  </div>
                  {/* These rows used to be inert text on the one screen where
                      seconds matter. Now every one of them does something. */}
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {clinic.phone && (
                      <a
                        href={`tel:${clinic.phone.replace(/[^\d+]/g, "")}`}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-destructive px-2.5 py-1.5 text-[12px] font-semibold text-destructive-foreground"
                      >
                        <Phone className="h-3.5 w-3.5" aria-hidden="true" /> Call
                      </a>
                    )}
                    {where && (
                      <a
                        href={`https://maps.google.com/?q=${encodeURIComponent(`${clinic.name} ${where}`)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-[12px] font-semibold text-foreground"
                      >
                        <MapPin className="h-3.5 w-3.5" aria-hidden="true" /> Directions
                      </a>
                    )}
                    {clinic.canNotify && card.petId && (
                      told === clinic.id ? (
                        <span className="inline-flex items-center gap-1.5 rounded-lg bg-success/15 px-2.5 py-1.5 text-[12px] font-semibold text-success">
                          <Check className="h-3.5 w-3.5" aria-hidden="true" /> They know you are coming
                        </span>
                      ) : (
                        <button
                          type="button"
                          disabled={busy === clinic.id}
                          onClick={async () => {
                            if (!card.petId) return
                            setBusy(clinic.id)
                            const res = await notifyArrival(
                              clinic.id,
                              card.petId,
                              card.reasons.join("; ") || "Emergency",
                              20,
                            )
                            setBusy(null)
                            if (res.error) window.alert(res.error)
                            else setTold(clinic.id)
                          }}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-destructive/40 px-2.5 py-1.5 text-[12px] font-semibold text-destructive disabled:opacity-50"
                        >
                          <Send className="h-3.5 w-3.5" aria-hidden="true" />
                          {busy === clinic.id ? "Telling them…" : "Tell them I'm coming"}
                        </button>
                      )
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      <div className="mt-3">
        <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          If something was swallowed
        </p>
        <div className="flex flex-col gap-1.5">
          {card.poisonControl.map((line) => (
            <a
              key={line.phone}
              href={`tel:${line.phone.replace(/[^\d+]/g, "")}`}
              className="flex items-center gap-2 rounded-xl card-interactive p-2.5 transition-transform active:scale-[0.98]"
            >
              <Phone className="h-4 w-4 flex-shrink-0 text-destructive" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-semibold text-foreground">{line.name}</span>
                <span className="block text-[11px] text-muted-foreground">
                  {line.phone} · {line.note}
                </span>
              </span>
            </a>
          ))}
        </div>
      </div>
    </div>
  )
}

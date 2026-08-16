"use client"

import { AlertTriangle, MapPin, Phone } from "lucide-react"
import type { EmergencyCard as EmergencyCardData } from "@/lib/ai/types"

/**
 * Rendered instead of an answer when triage says emergency.
 *
 * Nothing here is model-written. The owner's own vet number comes first,
 * because at 2am the thing that helps is a number to press, not prose.
 */
export function EmergencyCard({ card }: { card: EmergencyCardData }) {
  const subject = card.petName ? card.petName : "Your pet"

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
            {card.clinics.map((clinic) => (
              <div key={clinic.name} className="flex items-start gap-2 rounded-xl card-raised p-2.5">
                <MapPin className="mt-0.5 h-4 w-4 flex-shrink-0 text-destructive" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-semibold text-foreground">{clinic.name}</p>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {[clinic.address, clinic.city].filter(Boolean).join(", ") || "Address not listed"}
                    {clinic.distanceKm != null ? ` · ${clinic.distanceKm.toFixed(1)} km` : ""}
                  </p>
                </div>
              </div>
            ))}
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

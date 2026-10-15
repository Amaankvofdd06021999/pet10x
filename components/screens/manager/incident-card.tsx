"use client"

import { useState } from "react"
import Image from "next/image"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Camera,
  CheckCircle2,
  Clock,
  Gavel,
  MapPin,
  PawPrint,
  UserX,
  XCircle,
} from "lucide-react"
import {
  setIncidentStatus,
  escalateIncident,
  isOpenIncident,
  INCIDENT_TYPE_LABEL,
  INCIDENT_STATUS_LABEL,
  type IncidentStatus,
  type ManagerIncident,
} from "@/lib/data/incidents"

/** A "lat, lng" pair anywhere in a location string (reporters may send raw GPS). */
const COORD_RE = /(-?\d{1,3}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)/

/** Google Maps deep link — a precise pin when we have coordinates, a search otherwise. */
export function mapUrl(location: string): string {
  const m = location.match(COORD_RE)
  const query = m ? `${m[1]},${m[2]}` : location
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`
}

/** Show the human part; a trailing "(lat, lng)" is for the map link, not the eye. */
export function locationLabel(location: string): string {
  return location.replace(/\s*\(-?\d{1,3}\.\d+\s*,\s*-?\d{1,3}\.\d+\)\s*$/, "").trim() || location
}

/* ------------------------------------------------------------------ */
/* Incident triage — the manager's half of the reporting loop.         */
/* ------------------------------------------------------------------ */

/* Keyed on the ENUM, not on `string`.
 *
 * As `Record<string, string>` a status added to `incident_status` compiled
 * silently and rendered with no badge class at all. This is the same shape that
 * made the manager dashboard label every violation "Investigation" for weeks:
 * the map went stale, the compiler had nothing to check it against, and the
 * screen kept rendering.
 *
 * `IncidentStatus` is now an alias of `Database["public"]["Enums"]
 * ["incident_status"]` (`lib/data/incidents.ts:19`), so the chain that makes a
 * seventh value a compile error here is complete: migration -> regenerate
 * `database.types.ts` -> this map is missing a key. Until 2026-08-23 it was a
 * hand-written union with the same six members, and this comment claimed a
 * guarantee that stopped at the hand. */
const INCIDENT_STATUS_BADGE: Record<IncidentStatus, "neutral" | "brand" | "success" | "warning" | "danger" | "info"> = {
  submitted: "danger",
  triaged: "brand",
  investigating: "warning",
  linked_to_violation: "brand",
  dismissed: "neutral",
  resolved: "success",
}

export function IncidentCard({
  incident,
  onChange,
  buildingName = null,
}: {
  incident: ManagerIncident
  onChange: () => void
  /**
   * The report's building, from `useBuildingScope().buildingName` — set only
   * where "Unit 402" alone is ambiguous (more than one building, or a failed
   * load). The parent decides; the card just says it.
   */
  buildingName?: string | null
}) {
  const [busy, setBusy] = useState(false)
  const open = isOpenIncident(incident.status)

  async function move(status: Parameters<typeof setIncidentStatus>[1], label: string) {
    setBusy(true)
    const { error } = await setIncidentStatus(incident.id, status)
    setBusy(false)
    if (error) return toast.error("Couldn't update", { description: error })
    toast.success(label)
    onChange()
  }

  async function escalate() {
    setBusy(true)
    const { error } = await escalateIncident(incident.id)
    setBusy(false)
    if (error) return toast.error("Couldn't escalate", { description: error })
    toast.success("Escalated to a violation", {
      description: "A violation was opened and linked to this report.",
    })
    onChange()
  }

  return (
    <div className="rounded-lg card-raised p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-body font-semibold text-foreground">
              {INCIDENT_TYPE_LABEL[incident.type]}
            </h3>
            <Badge variant={INCIDENT_STATUS_BADGE[incident.status] ?? "neutral"}>
              {INCIDENT_STATUS_LABEL[incident.status]}
            </Badge>
            {incident.isAnonymous && (
              <span className="flex items-center gap-1 text-caption text-muted-foreground">
                <UserX className="h-3 w-3" /> Anonymous
              </span>
            )}
          </div>
          {buildingName && <p className="mt-1 text-caption font-semibold text-muted-foreground">{buildingName}</p>}
          <p className="mt-1.5 text-meta leading-relaxed text-muted-foreground">{incident.description}</p>

          {/* What the reporter photographed. Most reports carry nothing, so this
              renders only when there is something to show — an empty state here
              would be noise on the majority of cards. A report that *does* carry
              photos we couldn't sign says so instead of going quiet, because a
              silent strip and an empty one would otherwise read the same. */}
          {incident.evidenceCount > 0 && (
            <div className="mt-2.5">
              <p className="flex items-center gap-1 text-caption font-semibold text-muted-foreground">
                <Camera className="h-3 w-3" />
                {incident.evidenceUrls.length === 0
                  ? `${incident.evidenceCount} photo${incident.evidenceCount === 1 ? "" : "s"} attached — couldn't load ${incident.evidenceCount === 1 ? "it" : "them"} just now`
                  : `${incident.evidenceUrls.length} photo${incident.evidenceUrls.length === 1 ? "" : "s"} from the reporter`}
              </p>
              <div className="mt-1.5 flex flex-wrap gap-2">
                {incident.evidenceUrls.map((url, i) => (
                  <a
                    key={url}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="Open full size"
                    className="relative h-16 w-16 flex-shrink-0 overflow-hidden rounded-lg bg-muted"
                  >
                    <Image
                      src={url}
                      alt={`Evidence photo ${i + 1} of ${incident.evidenceUrls.length}`}
                      fill
                      className="object-cover"
                      unoptimized
                    />
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* Who was reported.
              The reporter picks the pet from photos and never sees a unit; the
              manager needs the unit and the owner, because acting on the report
              means knocking on a door. The identification is the reporter's
              guess, so it is labelled as one rather than stated as fact. */}
          {incident.petId && (
            <div className="mt-2.5 flex items-center gap-2.5 rounded-xl card-inset p-2.5">
              <span className="relative h-11 w-11 flex-shrink-0 overflow-hidden rounded-lg bg-muted">
                {incident.petPhotoUrl ? (
                  <Image src={incident.petPhotoUrl} alt="" fill className="object-cover" unoptimized />
                ) : (
                  <span className="flex h-full w-full items-center justify-center">
                    <PawPrint className="h-5 w-5 text-muted-foreground" />
                  </span>
                )}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-meta font-semibold text-foreground">
                  {incident.petName}
                  {incident.petBreed ? (
                    <span className="font-normal text-muted-foreground"> · {incident.petBreed}</span>
                  ) : null}
                </p>
                <p className="truncate text-caption text-muted-foreground">
                  {[incident.petUnit && `Unit ${incident.petUnit}`, incident.petOwnerName]
                    .filter(Boolean)
                    .join(" · ") || "Owner not on file"}
                </p>
              </div>
              <Badge variant="neutral" className="flex-shrink-0">
                Identified by reporter
              </Badge>
            </div>
          )}

          <p className="mt-1.5 text-caption text-muted-foreground">
            {incident.reference && <span className="font-mono">{incident.reference}</span>}
            {incident.location && (
              <>
                {" · "}
                <a
                  href={mapUrl(incident.location)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-0.5 text-foreground underline decoration-dotted underline-offset-2"
                  title="Open in Google Maps"
                >
                  <MapPin className="h-3 w-3" />
                  {locationLabel(incident.location)}
                </a>
              </>
            )}
            {incident.unitInvolved && <> &middot; Unit {incident.unitInvolved}</>}
            {incident.buildingName && <> &middot; {incident.buildingName}</>}
            {" · "}
            {new Date(incident.createdAt).toLocaleDateString()}
          </p>
        </div>
      </div>

      {open && (
        <div className="mt-3 flex flex-wrap gap-2 border-t border-border pt-3">
          {incident.status === "submitted" && (
            <Button size="sm" variant="secondary" loading={busy} onClick={() => move("triaged", "Acknowledged")}>
              {!busy && <CheckCircle2 className="h-3.5 w-3.5" />}
              Acknowledge
            </Button>
          )}
          {incident.status !== "investigating" && (
            <Button
              size="sm"
              variant="secondary"
              disabled={busy}
              onClick={() => move("investigating", "Marked as investigating")}
            >
              <Clock className="h-3.5 w-3.5 text-warning" /> Investigate
            </Button>
          )}
          <Button size="sm" variant="secondary" disabled={busy} onClick={escalate}>
            <Gavel className="h-3.5 w-3.5 text-destructive" /> Escalate to violation
          </Button>
          <Button size="sm" disabled={busy} onClick={() => move("resolved", "Marked resolved")}>
            <CheckCircle2 className="h-3.5 w-3.5" /> Resolve
          </Button>
          <Button size="sm" variant="quiet" disabled={busy} onClick={() => move("dismissed", "Dismissed")}>
            <XCircle className="h-3.5 w-3.5" /> Dismiss
          </Button>
        </div>
      )}
    </div>
  )
}

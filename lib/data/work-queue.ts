"use client"

/**
 * Pet10x — the unified strata work queue. Composes the six real, RLS-scoped
 * manager sources into one urgency-sorted, building-tagged list. Urgency is
 * derived from row age + kind (no schema/SLA column needed). Row actions are
 * wired by the screen to the real mutations that already exist.
 */

import { useCallback, useMemo } from "react"
import { useRegistrationsLive, useAccommodationsLive, useDocumentsReviewLive } from "./manager-queues"
import { useIncidents, isOpenIncident, INCIDENT_TYPE_LABEL } from "./incidents"
import { useBuildingResidents } from "./live"
import { useOutstandingFines } from "./portfolio"

export type QueueKind = "registration" | "link" | "incident" | "accommodation" | "document" | "fine"
export type Urgency = "high" | "medium" | "low"

export interface QueueItem {
  key: string
  refId: string
  kind: QueueKind
  buildingId: string | null
  title: string
  subtitle: string
  meta: string
  urgency: Urgency
  sortTs: number // ms; smaller (older / more overdue) sorts first within an urgency band
  ageLabel: string
  safeToBulk: boolean
}

const DAY = 86_400_000
const URGENCY_RANK: Record<Urgency, number> = { high: 0, medium: 1, low: 2 }

function ts(iso: string | null): number {
  if (!iso) return Date.now()
  const t = new Date(iso).getTime()
  return Number.isNaN(t) ? Date.now() : t
}
function daysSince(iso: string | null): number {
  return (Date.now() - ts(iso)) / DAY
}
function ageLabel(iso: string | null): string {
  const d = Math.floor(daysSince(iso))
  if (d <= 0) {
    const h = Math.floor((Date.now() - ts(iso)) / 3_600_000)
    return h <= 0 ? "just now" : `${h}h`
  }
  if (d < 30) return `${d}d`
  return `${Math.floor(d / 30)}mo`
}

export interface UseWorkQueueResult {
  items: QueueItem[]
  isLoading: boolean
  error: string | null
  refetchAll: () => void
}

export function useWorkQueue(): UseWorkQueueResult {
  const regs = useRegistrationsLive()
  const residents = useBuildingResidents()
  const incidents = useIncidents()
  const accs = useAccommodationsLive()
  const docs = useDocumentsReviewLive()
  const fines = useOutstandingFines()

  const isLoading =
    regs.isLoading ||
    residents.isLoading ||
    incidents.isLoading ||
    accs.isLoading ||
    docs.isLoading ||
    fines.isLoading
  const error =
    regs.error || residents.error || incidents.error || accs.error || docs.error || fines.error || null

  const items = useMemo<QueueItem[]>(() => {
    const out: QueueItem[] = []

    // Pending pet registrations
    for (const r of regs.data) {
      const age = daysSince(r.createdAt)
      const urgency: Urgency = age > 3 ? "high" : age > 1 ? "medium" : "low"
      out.push({
        key: `registration:${r.id}`,
        refId: r.id,
        kind: "registration",
        buildingId: r.buildingId,
        title: `Pet registration — ${r.name}`,
        subtitle: r.flags.length ? r.flags.join(" · ") : `${r.species} · ${r.breed} · docs look clean`,
        meta: `Unit ${r.unit} · ${r.resident}`,
        urgency,
        sortTs: ts(r.createdAt),
        ageLabel: ageLabel(r.createdAt),
        safeToBulk: r.flags.length === 0,
      })
    }

    // Pending resident-link requests
    for (const l of residents.data.filter((x) => x.status === "pending")) {
      const age = daysSince(l.requestedAt)
      const urgency: Urgency = age > 5 ? "high" : age > 2 ? "medium" : "low"
      out.push({
        key: `link:${l.linkId}`,
        refId: l.linkId,
        kind: "link",
        buildingId: l.buildingId,
        title: "Resident link request",
        subtitle: l.residentEmail || "Requesting building access",
        meta: l.residentName,
        urgency,
        sortTs: ts(l.requestedAt),
        ageLabel: ageLabel(l.requestedAt),
        safeToBulk: true,
      })
    }

    // Open incidents
    for (const i of incidents.data.filter((x) => isOpenIncident(x.status))) {
      const age = daysSince(i.createdAt)
      const severe = i.type === "aggressive" || i.type === "damage"
      const urgency: Urgency = severe || age > 2 ? "high" : age > 1 ? "medium" : "low"
      out.push({
        key: `incident:${i.id}`,
        refId: i.id,
        kind: "incident",
        buildingId: i.buildingId,
        title: `${INCIDENT_TYPE_LABEL[i.type] ?? "Incident"}${i.isAnonymous ? " (anonymous)" : ""}`,
        subtitle: i.description,
        meta: i.unitInvolved ? `Unit ${i.unitInvolved}` : (i.location ?? "Reported"),
        urgency,
        sortTs: ts(i.createdAt),
        ageLabel: ageLabel(i.createdAt),
        safeToBulk: false,
      })
    }

    // Accommodation requests (pending / info_requested) — legal, never bulk
    for (const a of accs.data.filter((x) => x.status === "pending")) {
      const age = daysSince(a.createdAt)
      const urgency: Urgency = age > 5 ? "high" : "medium"
      out.push({
        key: `accommodation:${a.id}`,
        refId: a.id,
        kind: "accommodation",
        buildingId: a.buildingId,
        title: `${a.type} accommodation request`,
        subtitle: a.legalNote || a.animal,
        meta: `Unit ${a.unit} · ${a.resident}`,
        urgency,
        sortTs: ts(a.createdAt),
        ageLabel: ageLabel(a.createdAt),
        safeToBulk: false,
      })
    }

    // Expiring / expired documents — informational (managers can't write pet_documents)
    for (const d of docs.data) {
      const days = d.expiresOn ? daysSince(d.expiresOn) : 0 // >0 means already past expiry
      const urgency: Urgency = days > 0 ? "high" : days > -14 ? "medium" : "low"
      out.push({
        key: `document:${d.id}`,
        refId: d.id,
        kind: "document",
        buildingId: d.buildingId,
        title: `${d.type} ${days > 0 ? "expired" : "expiring"}`,
        subtitle: `${d.pet} · ${days > 0 ? "past due" : `expires ${d.expiring}`}`,
        meta: `Unit ${d.unit} · ${d.resident}`,
        urgency,
        sortTs: d.expiresOn ? ts(d.expiresOn) : Date.now(),
        ageLabel: d.expiring,
        safeToBulk: false,
      })
    }

    // Outstanding fines
    for (const f of fines.data) {
      const overdue = f.dueOn ? new Date(f.dueOn).getTime() < Date.now() : false
      const age = daysSince(f.createdAt)
      const urgency: Urgency = overdue || age > 21 ? "high" : age > 7 ? "medium" : "low"
      out.push({
        key: `fine:${f.id}`,
        refId: f.id,
        kind: "fine",
        buildingId: f.buildingId,
        title: `Fine ${overdue ? "overdue" : "outstanding"} — $${f.amount.toFixed(2)}`,
        subtitle: `${f.resident} · ${f.status.replace(/_/g, " ")}`,
        meta: `Unit ${f.unit}`,
        urgency,
        sortTs: ts(f.createdAt),
        ageLabel: ageLabel(f.createdAt),
        safeToBulk: false,
      })
    }

    return out.sort((a, b) => URGENCY_RANK[a.urgency] - URGENCY_RANK[b.urgency] || a.sortTs - b.sortTs)
  }, [regs.data, residents.data, incidents.data, accs.data, docs.data, fines.data])

  const refetchAll = useCallback(() => {
    regs.refetch()
    residents.refetch()
    incidents.refetch()
    accs.refetch()
    docs.refetch()
    fines.refetch()
  }, [regs, residents, incidents, accs, docs, fines])

  return { items, isLoading, error, refetchAll }
}

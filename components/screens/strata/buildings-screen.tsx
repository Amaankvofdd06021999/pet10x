"use client"

import { useMemo, useState } from "react"
import { useBuildingPets } from "@/lib/data"
import { useWorkQueue } from "@/lib/data/work-queue"
import { useStrata } from "./portal-context"
import { BuildingDetail } from "./building-detail"
import { Spinner, LoadError, buildingState, STATE_LABEL, STATE_TEXT, STATE_DOT } from "./strata-ui"
import { Building2, ChevronRight, Inbox } from "lucide-react"

export function BuildingsScreen() {
  const { buildings, isLoading: bLoading, error: bError, refetch } = useStrata()
  const { data: pets, isLoading: pLoading, error: pError, refetch: refetchPets } = useBuildingPets()
  const { items: queue } = useWorkQueue()
  const [openId, setOpenId] = useState<string | null>(null)

  const cards = useMemo(() => {
    const comp = new Map<string, { pets: number; sum: number }>()
    for (const p of pets) {
      if (!p.buildingId) continue
      const e = comp.get(p.buildingId) ?? { pets: 0, sum: 0 }
      e.pets++
      e.sum += p.compliancePct
      comp.set(p.buildingId, e)
    }
    const queueByBuilding = new Map<string, number>()
    for (const q of queue) {
      if (!q.buildingId) continue
      queueByBuilding.set(q.buildingId, (queueByBuilding.get(q.buildingId) ?? 0) + 1)
    }
    return buildings
      .map((b) => {
        const c = comp.get(b.id)
        return {
          ...b,
          pets: c?.pets ?? 0,
          compliance: c && c.pets ? Math.round(c.sum / c.pets) : 100,
          queueCount: queueByBuilding.get(b.id) ?? 0,
        }
      })
      .sort((a, b) => a.compliance - b.compliance)
  }, [buildings, pets, queue])

  if (openId) return <BuildingDetail buildingId={openId} onBack={() => setOpenId(null)} />

  if (bLoading || pLoading) return <Spinner />
  if (bError) return <LoadError message={bError} onRetry={refetch} />
  if (pError) return <LoadError message={pError} onRetry={refetchPets} />

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {cards.map((b) => {
        const state = buildingState(b.compliance)
        return (
          <button
            key={b.id}
            onClick={() => setOpenId(b.id)}
            className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4 text-left transition-colors hover:border-info/50"
          >
            <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-info/10">
              <Building2 className="h-5 w-5 text-info" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="truncate text-[15px] font-semibold text-foreground">{b.name}</p>
                <span className={`h-2 w-2 flex-shrink-0 rounded-full ${STATE_DOT[state]}`} />
              </div>
              <p className="truncate text-[12px] text-muted-foreground">
                {b.code}
                {b.city ? ` · ${b.city}` : ""}
              </p>
              <div className="mt-1.5 flex items-center gap-3 text-[12px]">
                <span className="font-semibold text-foreground">{b.compliance}%</span>
                <span className={`font-medium ${STATE_TEXT[state]}`}>{STATE_LABEL[state]}</span>
                <span className="text-muted-foreground">{b.pets} pets</span>
                {b.queueCount > 0 && (
                  <span className="flex items-center gap-1 text-info">
                    <Inbox className="h-3.5 w-3.5" /> {b.queueCount}
                  </span>
                )}
              </div>
            </div>
            <ChevronRight className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
          </button>
        )
      })}
    </div>
  )
}

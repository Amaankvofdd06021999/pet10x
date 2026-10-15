"use client"

import { createContext, useContext, useMemo, useState, type ReactNode } from "react"
import { usePortfolioBuildings, type PortfolioBuilding } from "@/lib/data/portfolio"
import { Building2, Check, ChevronDown } from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

interface StrataCtx {
  buildings: PortfolioBuilding[]
  isLoading: boolean
  error: string | null
  refetch: () => void
  /** "all" = whole portfolio, otherwise a single building id. */
  selectedBuildingId: string | "all"
  setSelectedBuildingId: (v: string | "all") => void
  selectedBuilding: PortfolioBuilding | null
  /** Resolve a building_id to its display name (for building-tagging rows). */
  nameFor: (id: string | null | undefined) => string
  /** True when a row's building matches the current scope. */
  inScope: (id: string | null | undefined) => boolean
}

const Ctx = createContext<StrataCtx | null>(null)

export function StrataProvider({ children }: { children: ReactNode }) {
  const { data: buildings, isLoading, error, refetch } = usePortfolioBuildings()
  const [selectedBuildingId, setSelectedBuildingId] = useState<string | "all">("all")

  const value = useMemo<StrataCtx>(() => {
    const byId = new Map(buildings.map((b) => [b.id, b]))
    return {
      buildings,
      isLoading,
      error,
      refetch,
      selectedBuildingId,
      setSelectedBuildingId,
      selectedBuilding: selectedBuildingId === "all" ? null : byId.get(selectedBuildingId) ?? null,
      nameFor: (id) => (id ? byId.get(id)?.name ?? "—" : "—"),
      inScope: (id) => selectedBuildingId === "all" || id === selectedBuildingId,
    }
  }, [buildings, isLoading, error, refetch, selectedBuildingId])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useStrata(): StrataCtx {
  const v = useContext(Ctx)
  if (!v) throw new Error("useStrata must be used within a StrataProvider")
  return v
}

/** Portfolio ⇄ single-building selector, shown in the portal header. */
export function BuildingSwitcher() {
  const { buildings, selectedBuildingId, setSelectedBuildingId } = useStrata()
  const [open, setOpen] = useState(false)
  const current =
    selectedBuildingId === "all"
      ? `All buildings (${buildings.length})`
      : buildings.find((b) => b.id === selectedBuildingId)?.name ?? "Building"

  // A Radix popover rather than a click-catcher backdrop: Escape closes it,
  // focus moves into the list and returns to the button afterwards.
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          aria-label={`Building: ${current}`}
          className="flex items-center gap-2 rounded-lg card-interactive px-3 py-1.5 text-[13px] font-medium text-foreground transition-colors hover:shadow-float"
        >
          <Building2 className="h-4 w-4 text-info" aria-hidden="true" />
          <span className="max-w-[180px] truncate">{current}</span>
          <ChevronDown
            className={`h-4 w-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
            aria-hidden="true"
          />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="max-h-80 w-64 overflow-y-auto rounded-xl border border-border bg-popover p-1 shadow-xl"
      >
        <SwitcherItem
          label={`All buildings (${buildings.length})`}
          active={selectedBuildingId === "all"}
          onClick={() => {
            setSelectedBuildingId("all")
            setOpen(false)
          }}
        />
        <div className="my-1 h-px bg-border" />
        {buildings.map((b) => (
          <SwitcherItem
            key={b.id}
            label={b.name}
            sub={b.code}
            active={selectedBuildingId === b.id}
            onClick={() => {
              setSelectedBuildingId(b.id)
              setOpen(false)
            }}
          />
        ))}
      </PopoverContent>
    </Popover>
  )
}

function SwitcherItem({
  label,
  sub,
  active,
  onClick,
}: {
  label: string
  sub?: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      aria-current={active ? "true" : undefined}
      className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[13px] transition-colors ${
        active ? "bg-info-soft text-foreground" : "text-foreground hover:bg-muted"
      }`}
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{label}</span>
        {sub ? <span className="block truncate text-[11px] text-muted-foreground">{sub}</span> : null}
      </span>
      {active ? <Check className="h-4 w-4 flex-shrink-0 text-info" /> : null}
    </button>
  )
}

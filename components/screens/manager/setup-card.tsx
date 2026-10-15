"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { Check, ChevronRight, Copy } from "lucide-react"
import { useAuth } from "@/lib/auth-context"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import { useManagerBuildingRules } from "@/lib/data/building-rules-live"
import {
  bylawsPublished,
  fineScheduleSet,
  setupRows,
  type StaffCount,
  setupHiddenKey,
} from "@/lib/data/building-setup"

/**
 * Staff other than the viewer, for the "add a co-manager" row. A head count
 * (`head: true`) rather than the rows: the card needs a yes or no. null until
 * answered, and after a failed read, so the row never claims a state it does
 * not know.
 */
function useOtherManagerCount(buildingId: string, selfId: string | undefined): StaffCount {
  const [count, setCount] = useState<StaffCount>("loading")
  useEffect(() => {
    let live = true
    setCount("loading")
    const supabase = getSupabaseBrowserClient()
    if (!supabase || !selfId) return
    void supabase
      .from("building_managers")
      .select("id", { count: "exact", head: true })
      .eq("building_id", buildingId)
      .neq("profile_id", selfId)
      .then(({ count: n, error }) => {
        if (live) setCount(error ? "error" : (n ?? 0))
      })
    return () => {
      live = false
    }
  }, [buildingId, selfId])
  return count
}

function readHidden(buildingId: string): boolean {
  try {
    return window.localStorage.getItem(setupHiddenKey(buildingId)) === "1"
  } catch {
    return false
  }
}

/**
 * "Get your building ready" (BM-8): the building code, large, with Copy, and
 * the four jobs that make the building usable. It can be hidden only once all
 * four are done, so an unfinished checklist cannot be dismissed into the
 * dashboard of zeros it replaces.
 */
export function SetupCard({
  building,
  onNavigate,
}: {
  building: { id: string; name: string; code: string; rules: unknown }
  onNavigate?: (screen: string, id?: string, petId?: string, tab?: string) => void
}) {
  const { user } = useAuth()
  const { data: houseRules, isLoading: rulesLoading } = useManagerBuildingRules(building.id)
  const staff = useOtherManagerCount(building.id, user?.id)
  const [hidden, setHidden] = useState(false)
  const codeRef = useRef<HTMLSpanElement>(null)

  // Read after mount (localStorage is not there on the server) and again for
  // each building, since the card is kept across a building switch.
  useEffect(() => setHidden(readHidden(building.id)), [building.id])

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(building.code)
      toast.success("Building code copied")
    } catch {
      // No clipboard permission (or an insecure origin): select the text so
      // the manager can copy it themselves.
      const el = codeRef.current
      const sel = window.getSelection()
      if (el && sel) {
        const range = document.createRange()
        range.selectNodeContents(el)
        sel.removeAllRanges()
        sel.addRange(range)
      }
      toast.error("Couldn't copy", { description: "The code is selected. Copy it with your keyboard." })
    }
  }, [building.code])

  if (hidden || rulesLoading) return null

  const rows = setupRows(
    {
    bylawsPublished: bylawsPublished(building.rules),
    fineScheduleSet: fineScheduleSet(building.rules),
    houseRulesCount: houseRules.filter((r) => r.isPublished).length,
    },
    staff,
  )
  const complete = staff !== "loading" && rows.every((r) => r.done)

  function hide() {
    try {
      window.localStorage.setItem(setupHiddenKey(building.id), "1")
    } catch {
      /* Hidden for this visit only. */
    }
    setHidden(true)
  }

  return (
    <section className="mb-6" aria-labelledby="setup-title">
      <div className="rounded-2xl card-raised p-4">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 id="setup-title" className="text-[17px] font-semibold text-foreground">
              Get your building ready
            </h2>
            <p className="text-[12px] text-muted-foreground">Share the code so residents can join {building.name}.</p>
          </div>
          {complete && (
            <button onClick={hide} className="flex-shrink-0 text-[13px] font-semibold text-primary-text">
              Hide
            </button>
          )}
        </div>

        <div className="mb-4 flex items-center justify-between gap-3 rounded-xl bg-muted/60 px-4 py-3">
          <div className="min-w-0">
            <p className="text-[11px] font-medium uppercase text-muted-foreground">Building code</p>
            <span
              ref={codeRef}
              className="block select-all break-all font-mono text-[28px] font-bold leading-tight tracking-widest text-foreground"
            >
              {building.code}
            </span>
          </div>
          <button
            onClick={() => void copy()}
            className="flex flex-shrink-0 items-center gap-1.5 rounded-xl bg-primary-strong px-3.5 py-2 text-[13px] font-semibold text-primary-foreground active:scale-[0.97]"
          >
            <Copy className="h-3.5 w-3.5" /> Copy
          </button>
        </div>

        <ul className="flex flex-col">
          {rows.map((row, i) => (
            <li key={row.key} className={i === rows.length - 1 ? "" : "border-b border-border"}>
              <button
                onClick={() => onNavigate?.(row.target.screen, undefined, undefined, row.target.tab)}
                className="flex w-full items-center gap-3 py-2.5 text-left"
              >
                <span
                  className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border ${
                    row.done ? "border-success-strong bg-success-strong text-white" : "border-border"
                  }`}
                  aria-hidden
                >
                  {row.done && <Check className="h-3 w-3" strokeWidth={3} />}
                </span>
                <span className={`flex-1 text-[14px] ${row.done ? "text-muted-foreground line-through" : "text-foreground"}`}>
                  {row.label}
                </span>
                <span className="sr-only">{row.done ? "Done" : "To do"}</span>
                <ChevronRight className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
              </button>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

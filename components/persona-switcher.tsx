"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/lib/auth-context"
import { PERSONA_LABEL, PERSONA_ROUTE, type Persona } from "@/lib/rbac"
import { Portal } from "@/components/ui/portal"
import { Building2, Check, ChevronsUpDown, Dog, Layers, Shield, X } from "lucide-react"

/**
 * Switches which surface a multi-role account is looking at.
 *
 * Only rendered when more than one persona was actually granted — a plain
 * pet-owner signup sees nothing here until an admin grants them something, so
 * the control never advertises access that does not exist.
 *
 * Switching is a change of view, not of privilege. It re-points the app at a
 * different surface and a different query scope; every row it can then read is
 * still decided by RLS, which this cannot reach.
 */

const PERSONA_ICON: Record<Persona, typeof Dog> = {
  "pet-owner": Dog,
  "building-manager": Building2,
  "strata-manager": Layers,
  "super-admin": Shield,
  business: Building2,
}

const PERSONA_BLURB: Record<Persona, string> = {
  "pet-owner": "Your own pets, care and community",
  "building-manager": "Residents, approvals and violations",
  "strata-manager": "Every building you manage",
  "super-admin": "Platform administration",
  business: "Your business listing and bookings",
}

export function PersonaSwitcher({
  className = "",
  /**
   * Icon + name only, no "Viewing as" caption. For dense headers like the
   * admin console's, where the full control wrapped "Sign out" onto a second
   * line at phone width.
   */
  compact = false,
}: {
  className?: string
  compact?: boolean
}) {
  const {
    personas,
    activePersona,
    setActivePersona,
    canSwitch,
    managedBuildings,
    activeBuildingId,
    setActiveBuilding,
  } = useAuth()
  const [open, setOpen] = useState(false)
  const router = useRouter()

  // The whole control is absent for single-persona accounts, which is most of
  // them. Nothing to explain, nothing to dismiss.
  if (!canSwitch) return null

  const current = activePersona ?? personas[0]
  const CurrentIcon = PERSONA_ICON[current]

  const choose = (p: Persona) => {
    setActivePersona(p)
    setOpen(false)
    // Personas live on different routes; staying put would show the old
    // surface until the next navigation.
    const target = PERSONA_ROUTE[p]
    if (typeof window !== "undefined" && !window.location.pathname.startsWith(target)) {
      router.push(target)
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-label={`Viewing as ${PERSONA_LABEL[current]}. Switch view`}
        className={`flex items-center gap-2 rounded-xl card-interactive text-left transition-colors active:bg-muted ${
          compact ? "px-2 py-1.5" : "px-3 py-2"
        } ${className}`}
      >
        <span
          className={`flex flex-shrink-0 items-center justify-center rounded-lg bg-primary/10 ${
            compact ? "h-6 w-6" : "h-7 w-7"
          }`}
        >
          <CurrentIcon className={compact ? "h-3.5 w-3.5 text-primary" : "h-4 w-4 text-primary"} />
        </span>
        <span className="min-w-0 flex-1">
          {!compact && (
            <span className="block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Viewing as
            </span>
          )}
          <span className={`block truncate font-semibold text-foreground ${compact ? "text-[12px]" : "text-[13px]"}`}>
            {PERSONA_LABEL[current]}
          </span>
        </span>
        <ChevronsUpDown className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
      </button>

      {open && (
        /* Portalled: the sheet must sit above the fixed tab bar, and any
           ancestor with a transform or an opacity animation would trap a
           z-index here inside its stacking context. */
        <Portal>
          <div className="fixed inset-0 z-[100] flex items-end justify-center sm:items-center">
            <button
              aria-label="Close"
              onClick={() => setOpen(false)}
              className="absolute inset-0 bg-foreground/40 backdrop-blur-[2px]"
            />
            <div
              role="dialog"
              aria-label="Switch view"
              className="relative w-full max-w-md rounded-t-3xl bg-card shadow-float p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-xl sm:rounded-3xl sm:pb-5"
            >
              <div className="mb-4 flex items-center justify-between gap-3">
                <h2 className="text-[17px] font-semibold text-foreground">Switch view</h2>
                <button
                  onClick={() => setOpen(false)}
                  aria-label="Close"
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="flex flex-col gap-2">
                {personas.map((p) => {
                  const Icon = PERSONA_ICON[p]
                  const active = p === current
                  return (
                    <button
                      key={p}
                      onClick={() => choose(p)}
                      aria-current={active ? "true" : undefined}
                      className={`flex items-center gap-3 rounded-2xl border p-3 text-left transition-colors ${
                        active ? "border-primary bg-primary/5" : "border-border bg-card active:bg-muted"
                      }`}
                    >
                      <span
                        className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl ${
                          active ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"
                        }`}
                      >
                        <Icon className="h-5 w-5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[14px] font-semibold text-foreground">{PERSONA_LABEL[p]}</span>
                        <span className="block truncate text-[12px] text-muted-foreground">{PERSONA_BLURB[p]}</span>
                      </span>
                      {active && <Check className="h-4.5 w-4.5 flex-shrink-0 text-primary" />}
                    </button>
                  )
                })}
              </div>

              {/* Building picker — only meaningful once there is more than one
                  to pick between, which is what makes someone strata. */}
              {managedBuildings.length > 1 && (
                <div className="mt-5">
                  <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Active building
                  </h3>
                  <div className="flex flex-col gap-1.5">
                    {managedBuildings.map((b) => {
                      const active = b.id === activeBuildingId
                      return (
                        <button
                          key={b.id}
                          onClick={() => {
                            setActiveBuilding(b.id)
                            setOpen(false)
                          }}
                          className={`flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-left transition-colors ${
                            active ? "bg-primary/10" : "active:bg-muted"
                          }`}
                        >
                          <Building2
                            className={`h-4 w-4 flex-shrink-0 ${active ? "text-primary" : "text-muted-foreground"}`}
                          />
                          <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-foreground">
                            {b.name}
                          </span>
                          {b.isPrimary && (
                            <span className="flex-shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                              Primary
                            </span>
                          )}
                          {active && <Check className="h-4 w-4 flex-shrink-0 text-primary" />}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              <p className="mt-4 text-center text-[11px] leading-relaxed text-muted-foreground">
                Switching changes what you see, not what you can access. Your permissions are unchanged.
              </p>
            </div>
          </div>
        </Portal>
      )}
    </>
  )
}

"use client"

import { createContext, useContext, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"

/**
 * Don't lose a half-filled form.
 *
 * A form says whether it is dirty with `useUnsavedGuard(dirty)` (compute it
 * with `isDirty` from lib/unsaved.ts). While it is:
 *
 * - closing or reloading the tab asks first (`beforeunload`), and
 * - every way out of the screen asks first, through ONE dialog owned by
 *   `UnsavedGuardProvider`: "Discard this form? What you typed will be lost."
 *   with "Keep editing" / "Discard".
 *
 * The provider wraps the /app shell, which asks before its own navigations —
 * Back, a tab or sidebar tap, `onNavigate`, and browser Back (popstate). So a
 * form's Cancel / nav-bar Back, which call the shell's `onBack`, are guarded
 * without the form doing anything. A form only calls the returned
 * `confirmLeave()` itself for a way out the shell never sees (the report
 * composer's first-step Back, which returns to the chooser in place).
 *
 * Why one shared dialog rather than one per form: the shell has to be able to
 * ask on popstate and sidebar taps, which happen outside the form.
 *
 * Without a provider (the signed-out `/report` page renders the composer)
 * `confirmLeave()` resolves `true` and only `beforeunload` guards.
 *
 * A form that leaves on its own after saving must not be dirty by then: report
 * "not dirty" once the save lands (a success view does this naturally, since
 * the user taps out of it after a render).
 */

type UnsavedGuard = {
  /** Record whether one form (by id) is dirty. */
  report: (id: string, dirty: boolean) => void
  isDirty: () => boolean
  /** Resolves `true` at once when nothing is dirty; otherwise asks, `true` on Discard. */
  confirmLeave: () => Promise<boolean>
}

const UnsavedGuardContext = createContext<UnsavedGuard | null>(null)

const leaveFreely = () => Promise.resolve(true)

export function UnsavedGuardProvider({ children }: { children: ReactNode }) {
  const dirtyIds = useRef(new Set<string>())
  const pending = useRef<((ok: boolean) => void) | null>(null)
  const [open, setOpen] = useState(false)

  // Refs only, so built once: `guard` is a stable context value.
  const { guard, settle } = useMemo(() => {
    const settle = (ok: boolean) => {
      const resolve = pending.current
      pending.current = null
      resolve?.(ok)
    }
    const guard: UnsavedGuard = {
      report(id, dirty) {
        if (dirty) dirtyIds.current.add(id)
        else dirtyIds.current.delete(id)
      },
      isDirty: () => dirtyIds.current.size > 0,
      confirmLeave() {
        if (dirtyIds.current.size === 0) return Promise.resolve(true)
        // A second ask while one is open (a popstate during the dialog) supersedes it.
        settle(false)
        return new Promise<boolean>((resolve) => {
          pending.current = resolve
          setOpen(true)
        })
      },
    }
    return { guard, settle }
  }, [])

  return (
    <UnsavedGuardContext.Provider value={guard}>
      {children}
      <ConfirmDialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next)
          if (!next) settle(false)
        }}
        title="Discard this form?"
        description="What you typed will be lost."
        confirmLabel="Discard"
        cancelLabel="Keep editing"
        tone="danger"
        onConfirm={async () => {
          // Cleared before the caller navigates: the form is about to unmount,
          // and a popstate fired by that navigation must not ask again.
          dirtyIds.current.clear()
          settle(true)
          return { error: null }
        }}
      />
    </UnsavedGuardContext.Provider>
  )
}

/** For a form: register `dirty`; returns `confirmLeave()` for ways out the shell does not see. */
export function useUnsavedGuard(dirty: boolean): () => Promise<boolean> {
  const guard = useContext(UnsavedGuardContext)
  const id = useId()

  useEffect(() => {
    if (!guard) return
    guard.report(id, dirty)
    return () => guard.report(id, false)
  }, [guard, id, dirty])

  useEffect(() => {
    if (!dirty) return
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      // Older browsers need returnValue set to show their own prompt.
      e.returnValue = ""
    }
    window.addEventListener("beforeunload", onBeforeUnload)
    return () => window.removeEventListener("beforeunload", onBeforeUnload)
  }, [dirty])

  return guard ? guard.confirmLeave : leaveFreely
}

/** For the shell: ask before its own navigations. A no-op guard outside a provider. */
export function useUnsavedShellGuard(): Pick<UnsavedGuard, "isDirty" | "confirmLeave"> {
  return useContext(UnsavedGuardContext) ?? NO_GUARD
}

const NO_GUARD = { isDirty: () => false, confirmLeave: leaveFreely }

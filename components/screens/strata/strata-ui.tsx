"use client"

import type { ReactNode } from "react"
import { AlertTriangle, Loader2 } from "lucide-react"

/** Portfolio "state" derived from a compliance %, versus the 90% target. */
export type BuildingState = "at-risk" | "watch" | "healthy"
export function buildingState(pct: number): BuildingState {
  if (pct < 75) return "at-risk"
  if (pct < 90) return "watch"
  return "healthy"
}
export const STATE_LABEL: Record<BuildingState, string> = {
  "at-risk": "At risk",
  watch: "Watch",
  healthy: "Healthy",
}
export const STATE_TEXT: Record<BuildingState, string> = {
  "at-risk": "text-destructive",
  watch: "text-warning",
  healthy: "text-success",
}
export const STATE_DOT: Record<BuildingState, string> = {
  "at-risk": "bg-destructive",
  watch: "bg-warning",
  healthy: "bg-success",
}

export function StatTile({
  label,
  value,
  sub,
  tone = "default",
}: {
  label: string
  value: ReactNode
  sub?: ReactNode
  tone?: "default" | "info" | "warning" | "destructive" | "success"
}) {
  const valueColor =
    tone === "info"
      ? "text-info"
      : tone === "warning"
        ? "text-warning"
        : tone === "destructive"
          ? "text-destructive"
          : tone === "success"
            ? "text-success"
            : "text-foreground"
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <p className="text-[11.5px] font-medium text-muted-foreground">{label}</p>
      <p className={`mt-1 text-[26px] font-bold leading-none tracking-tight ${valueColor}`}>{value}</p>
      {sub ? <p className="mt-1.5 text-[11.5px] text-muted-foreground">{sub}</p> : null}
    </div>
  )
}

export function SectionCard({
  title,
  action,
  children,
  className = "",
}: {
  title?: ReactNode
  action?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section className={`rounded-2xl border border-border bg-card p-4 sm:p-5 ${className}`}>
      {(title || action) && (
        <div className="mb-3 flex items-center justify-between gap-2">
          {typeof title === "string" ? <h3 className="text-[14px] font-semibold text-foreground">{title}</h3> : title}
          {action}
        </div>
      )}
      {children}
    </section>
  )
}

export function LoadError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-destructive/30 bg-destructive/10 px-6 py-8 text-center">
      <AlertTriangle className="h-6 w-6 text-destructive" />
      <div>
        <p className="text-[14px] font-semibold text-foreground">Couldn&apos;t load</p>
        <p className="mt-0.5 max-w-sm text-[12px] text-muted-foreground">{message}</p>
      </div>
      <button onClick={onRetry} className="rounded-lg bg-muted px-4 py-1.5 text-[13px] font-semibold text-foreground">
        Retry
      </button>
    </div>
  )
}

export function EmptyState({ icon, title, sub }: { icon: ReactNode; title: string; sub?: string }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border px-6 py-12 text-center">
      <span className="text-muted-foreground">{icon}</span>
      <p className="text-[14px] font-semibold text-foreground">{title}</p>
      {sub ? <p className="max-w-xs text-[12.5px] text-muted-foreground">{sub}</p> : null}
    </div>
  )
}

export function Spinner() {
  return (
    <div className="flex justify-center py-16">
      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
    </div>
  )
}

export function BuildingTag({ name }: { name: string }) {
  return (
    <span className="whitespace-nowrap rounded-md border border-border bg-muted/60 px-1.5 py-0.5 text-[10.5px] font-medium text-muted-foreground">
      {name}
    </span>
  )
}

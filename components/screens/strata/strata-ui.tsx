"use client"

import type { ReactNode } from "react"
import { StatTile as UiStatTile, type StatTone } from "@/components/ui/stat-tile"
import { SectionCard as UiSectionCard } from "@/components/ui/section-card"
import { EmptyState as UiEmptyState } from "@/components/ui/empty"

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
// The state is a Badge (soft fill, dark words), never coloured text.
export const STATE_BADGE: Record<BuildingState, "danger" | "warning" | "success"> = {
  "at-risk": "danger",
  watch: "warning",
  healthy: "success",
}
export const STATE_DOT: Record<BuildingState, string> = {
  "at-risk": "bg-destructive",
  watch: "bg-warning",
  healthy: "bg-success",
}

/*
 * The portal's pieces are the shared ones (components/ui); these adapters only
 * keep the portal's prop names (`sub`, `action`, its tone words) so the
 * screens read as they did.
 */

const TONE: Record<"default" | "info" | "warning" | "destructive" | "success", StatTone> = {
  default: "default",
  info: "info",
  warning: "warn",
  destructive: "bad",
  success: "good",
}

export function StatTile({
  label,
  value,
  sub,
  tone = "default",
  onClick,
}: {
  label: string
  value: string | number
  sub?: ReactNode
  tone?: keyof typeof TONE
  onClick?: () => void
}) {
  return <UiStatTile label={label} value={value} hint={sub} tone={TONE[tone]} onClick={onClick} />
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
    <UiSectionCard title={title} actions={action} className={className}>
      {children}
    </UiSectionCard>
  )
}

export function EmptyState({ icon, title, sub }: { icon: ReactNode; title: string; sub?: string }) {
  return <UiEmptyState icon={icon} title={title} detail={sub} />
}

export { LoadError } from "@/components/ui/load-error"
export { Spinner } from "@/components/ui/spinner"

export function BuildingTag({ name }: { name: string }) {
  return (
    <span className="whitespace-nowrap rounded-md border border-border bg-muted px-1.5 py-0.5 text-[10.5px] font-medium text-muted-foreground">
      {name}
    </span>
  )
}

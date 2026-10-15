"use client"

import type { ReactNode } from "react"
import { AlertTriangle, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

export function StatTile({
  label,
  value,
  sub,
  tone = "default",
}: {
  label: string
  value: ReactNode
  sub?: ReactNode
  tone?: "default" | "accent" | "warning" | "destructive" | "success"
}) {
  // The tone is a dot beside the label; the number stays dark (no coloured words).
  const dot =
    tone === "accent"
      ? "bg-primary"
      : tone === "warning"
        ? "bg-warning"
        : tone === "destructive"
          ? "bg-destructive"
          : tone === "success"
            ? "bg-success"
            : null
  return (
    <div className="rounded-lg card-raised p-4">
      <p className="flex items-center gap-1.5 text-caption font-medium text-muted-foreground">
        {dot && <span aria-hidden="true" className={`size-2 rounded-full ${dot}`} />}
        {label}
      </p>
      <p className="mt-1 text-[26px] font-bold leading-none tracking-tight text-foreground">{value}</p>
      {sub ? <p className="mt-1.5 text-caption text-muted-foreground">{sub}</p> : null}
    </div>
  )
}

export function SectionCard({
  title,
  action,
  children,
}: {
  title?: ReactNode
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="rounded-lg card-raised p-4 sm:p-5">
      {(title || action) && (
        <div className="mb-3 flex items-center justify-between gap-2">
          {typeof title === "string" ? <h3 className="text-body font-semibold text-foreground">{title}</h3> : title}
          {action}
        </div>
      )}
      {children}
    </section>
  )
}

export function EmptyState({ icon, title, sub }: { icon: ReactNode; title: string; sub?: string }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border px-6 py-12 text-center">
      <span className="text-muted-foreground">{icon}</span>
      <p className="text-body font-semibold text-foreground">{title}</p>
      {sub ? <p className="max-w-xs text-caption text-muted-foreground">{sub}</p> : null}
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

export function LoadError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-destructive bg-destructive-soft px-6 py-8 text-center">
      <AlertTriangle className="h-6 w-6 text-destructive" />
      <p className="text-body font-semibold text-foreground">Couldn&apos;t load</p>
      <p className="max-w-sm text-caption text-muted-foreground">{message}</p>
      <Button variant="secondary" size="sm" onClick={onRetry}>
        Retry
      </Button>
    </div>
  )
}

export function Money({ cents, className = "" }: { cents: number; className?: string }) {
  return <span className={className}>${(cents / 100).toFixed(2)}</span>
}

export function Stars({ rating, size = 13 }: { rating: number; size?: number }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${rating} out of 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <span key={i} style={{ fontSize: size }} className={i <= Math.round(rating) ? "text-warning" : "text-border"}>
          ★
        </span>
      ))}
    </span>
  )
}

export function TextInput({
  value,
  onChange,
  placeholder,
  type = "text",
  onEnter,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  type?: string
  onEnter?: () => void
}) {
  return (
    <Input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => e.key === "Enter" && onEnter?.()}
      placeholder={placeholder}
      autoCapitalize={type === "email" ? "none" : undefined}
    />
  )
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p className="mb-1.5 text-caption font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      {children}
    </div>
  )
}

"use client"

import type { ReactNode } from "react"
import { AlertTriangle, Loader2 } from "lucide-react"

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
  const color =
    tone === "accent"
      ? "text-accent"
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
      <p className={`mt-1 text-[26px] font-bold leading-none tracking-tight ${color}`}>{value}</p>
      {sub ? <p className="mt-1.5 text-[11.5px] text-muted-foreground">{sub}</p> : null}
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
    <section className="rounded-2xl border border-border bg-card p-4 sm:p-5">
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

export function LoadError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-destructive/30 bg-destructive/10 px-6 py-8 text-center">
      <AlertTriangle className="h-6 w-6 text-destructive" />
      <p className="text-[14px] font-semibold text-foreground">Couldn&apos;t load</p>
      <p className="max-w-sm text-[12px] text-muted-foreground">{message}</p>
      <button onClick={onRetry} className="rounded-lg bg-muted px-4 py-1.5 text-[13px] font-semibold text-foreground">
        Retry
      </button>
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
        <span key={i} style={{ fontSize: size }} className={i <= Math.round(rating) ? "text-warning" : "text-muted-foreground/40"}>
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
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => e.key === "Enter" && onEnter?.()}
      placeholder={placeholder}
      autoCapitalize={type === "email" ? "none" : undefined}
      className="w-full min-w-0 rounded-xl border border-border bg-background px-3.5 py-2.5 text-[14px] text-foreground placeholder:text-muted-foreground/60 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
    />
  )
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p className="mb-1.5 text-[11.5px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      {children}
    </div>
  )
}

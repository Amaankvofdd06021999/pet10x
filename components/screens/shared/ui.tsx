"use client"

import { useCallback, useEffect, useId, useRef, type ReactNode } from "react"
import { createPortal } from "react-dom"
import { Loader2, X, AlertTriangle, Inbox } from "lucide-react"

/**
  * The shared pattern layer for record-heavy console screens.
 *
 * The diligence review counted thirteen hand-rolled bottom sheets, ~20 status
 * pill maps and 57 files importing Loader2 directly — and zero overlays with a
 * focus trap. This module is the middle tier that was missing: every screen in
 * /clinic composes these and none of them re-implement a dialog.
 */

/* ------------------------------ surfaces -------------------------------- */

export function SectionCard({
  title,
  subtitle,
  actions,
  children,
  className = "",
}: {
  title?: string
  subtitle?: string
  actions?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section className={`rounded-2xl border border-border bg-card ${className}`}>
      {(title || actions) && (
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
          <div className="min-w-0">
            {title && <h2 className="text-[15px] font-semibold text-foreground">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-[12.5px] text-muted-foreground">{subtitle}</p>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className="p-4">{children}</div>
    </section>
  )
}

export function StatTile({
  label,
  value,
  hint,
  tone = "default",
  onClick,
}: {
  label: string
  value: string | number
  hint?: string
  tone?: "default" | "good" | "warn" | "bad" | "info" | "accent"
  onClick?: () => void
}) {
  const toneClass = {
    default: "text-foreground",
    good: "text-success",
    warn: "text-warning-strong",
    bad: "text-destructive",
    info: "text-info",
    accent: "text-primary",
  }[tone]
  const Tag = onClick ? "button" : "div"
  return (
    <Tag
      {...(onClick ? { type: "button" as const, onClick } : {})}
      className={`rounded-2xl border border-border bg-card p-4 text-left ${
        onClick ? "transition-colors hover:border-primary/40" : ""
      }`}
    >
      <p className="text-[11.5px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`mt-1 text-[26px] font-semibold leading-none tabular-nums ${toneClass}`}>{value}</p>
      {hint && <p className="mt-1 text-[12px] text-muted-foreground">{hint}</p>}
    </Tag>
  )
}

/* ------------------------------- states --------------------------------- */

export function Spinner({ label = "Loading" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-10 text-muted-foreground" role="status">
      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
      <span className="text-[13px]">{label}…</span>
    </div>
  )
}

export function SkeletonRows({ rows = 4 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-2" aria-hidden="true">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-14 animate-pulse rounded-xl bg-secondary" />
      ))}
    </div>
  )
}

export function LoadError({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/5 p-4">
      <p className="flex items-center gap-2 text-[13px] font-semibold text-destructive">
        <AlertTriangle className="h-4 w-4" aria-hidden="true" />
        Could not load this
      </p>
      <p className="text-[12.5px] text-muted-foreground">{message}</p>
      {onRetry && (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  )
}

export function EmptyState({
  title,
  detail,
  action,
  icon,
}: {
  title: string
  detail?: string
  action?: ReactNode
  icon?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-dashed border-border bg-card px-6 py-10 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
        {icon ?? <Inbox className="h-5 w-5" aria-hidden="true" />}
      </div>
      <p className="mt-3 text-[14px] font-semibold text-foreground">{title}</p>
      {detail && <p className="mt-1 max-w-[24rem] text-[12.5px] text-muted-foreground">{detail}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  )
}

/* -------------------------------- pills --------------------------------- */

export type Tone = "neutral" | "good" | "warn" | "bad" | "info" | "accent"

const TONE_CLASS: Record<Tone, string> = {
  neutral: "bg-secondary text-secondary-foreground",
  good: "bg-success/12 text-success",
  warn: "bg-warning/15 text-warning-strong",
  bad: "bg-destructive/12 text-destructive",
  info: "bg-info/12 text-info",
  accent: "bg-primary/12 text-primary",
}

export function Pill({
  children,
  tone = "neutral",
  title,
}: {
  children: ReactNode
  tone?: Tone
  title?: string
}) {
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${TONE_CLASS[tone]}`}
    >
      {children}
    </span>
  )
}

/* ------------------------------- controls -------------------------------- */

export function Button({
  children,
  variant = "primary",
  size = "md",
  className = "",
  busy = false,
  ...rest
}: {
  children: ReactNode
  variant?: "primary" | "secondary" | "ghost" | "danger"
  size?: "sm" | "md"
  busy?: boolean
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const base =
    "inline-flex items-center justify-center gap-1.5 rounded-xl font-semibold transition-colors disabled:opacity-50 disabled:pointer-events-none"
  const sizes = { sm: "px-2.5 py-1.5 text-[12.5px]", md: "px-3.5 py-2 text-[13.5px]" }[size]
  const variants = {
    primary: "bg-primary text-primary-foreground hover:bg-primary/90",
    secondary: "border border-border bg-card text-foreground hover:bg-secondary",
    ghost: "text-muted-foreground hover:bg-secondary hover:text-foreground",
    danger: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
  }[variant]
  return (
    <button type="button" className={`${base} ${sizes} ${variants} ${className}`} disabled={busy || rest.disabled} {...rest}>
      {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
      {children}
    </button>
  )
}

/** A labelled control. The label is a real <label htmlFor>, and errors bind. */
export function Field({
  label,
  hint,
  error,
  children,
  required,
}: {
  label: string
  hint?: string
  error?: string | null
  required?: boolean
  children: (props: { id: string; "aria-describedby"?: string; "aria-invalid"?: boolean }) => ReactNode
}) {
  const id = useId()
  const hintId = hint ? `${id}-hint` : undefined
  const errId = error ? `${id}-err` : undefined
  const described = [hintId, errId].filter(Boolean).join(" ") || undefined
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-[12px] font-semibold text-foreground">
        {label}
        {required && <span className="ml-0.5 text-destructive">*</span>}
      </label>
      {children({ id, "aria-describedby": described, "aria-invalid": error ? true : undefined })}
      {hint && !error && (
        <p id={hintId} className="text-[11.5px] text-muted-foreground">
          {hint}
        </p>
      )}
      {error && (
        <p id={errId} className="text-[11.5px] font-medium text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}

const INPUT_CLASS =
  "w-full rounded-xl border border-input bg-card px-3 py-2 text-[13.5px] text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/30"

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${INPUT_CLASS} ${props.className ?? ""}`} />
}

export function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`${INPUT_CLASS} min-h-[80px] ${props.className ?? ""}`} />
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`${INPUT_CLASS} ${props.className ?? ""}`} />
}

/** Tabs that behave like tabs: roles, aria-selected and arrow keys. */
export function SegmentedTabs<T extends string>({
  tabs,
  active,
  onChange,
  label,
}: {
  tabs: Array<{ id: T; label: string; count?: number }>
  active: T
  onChange: (id: T) => void
  label: string
}) {
  const onKeyDown = (e: React.KeyboardEvent) => {
    const i = tabs.findIndex((t) => t.id === active)
    if (e.key === "ArrowRight") {
      e.preventDefault()
      onChange(tabs[(i + 1) % tabs.length].id)
    } else if (e.key === "ArrowLeft") {
      e.preventDefault()
      onChange(tabs[(i - 1 + tabs.length) % tabs.length].id)
    }
  }
  return (
    <div role="tablist" aria-label={label} onKeyDown={onKeyDown} className="flex flex-wrap gap-1.5">
      {tabs.map((t) => {
        const on = t.id === active
        return (
          <button
            key={t.id}
            role="tab"
            type="button"
            aria-selected={on}
            tabIndex={on ? 0 : -1}
            onClick={() => onChange(t.id)}
            className={`rounded-full px-3 py-1.5 text-[12.5px] font-semibold transition-colors ${
              on ? "bg-primary text-primary-foreground" : "border border-border bg-card text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
            {typeof t.count === "number" && <span className="ml-1 opacity-70 tabular-nums">({t.count})</span>}
          </button>
        )
      })}
    </div>
  )
}

/* -------------------------------- dialog -------------------------------- */

/**
 * One dialog for the whole console: focus trap, Escape, scroll lock, focus
 * restore, aria-modal and a labelled title. Every overlay in /clinic uses it.
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  wide = false,
}: {
  open: boolean
  onClose: () => void
  title: string
  description?: string
  children: ReactNode
  footer?: ReactNode
  wide?: boolean
}) {
  const panelRef = useRef<HTMLDivElement | null>(null)
  const restoreRef = useRef<HTMLElement | null>(null)
  const titleId = useId()
  const descId = useId()

  const trap = useCallback((e: KeyboardEvent) => {
    if (e.key === "Escape") {
      e.stopPropagation()
      onCloseRef.current()
      return
    }
    if (e.key !== "Tab" || !panelRef.current) return
    const focusables = panelRef.current.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])',
    )
    if (focusables.length === 0) return
    const first = focusables[0]
    const last = focusables[focusables.length - 1]
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault()
      first.focus()
    }
  }, [])

  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    if (!open) return
    restoreRef.current = document.activeElement as HTMLElement | null
    const overflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    document.addEventListener("keydown", trap, true)
    const t = window.setTimeout(() => {
      const first = panelRef.current?.querySelector<HTMLElement>(
        'input, textarea, select, button:not([data-close])',
      )
      ;(first ?? panelRef.current)?.focus()
    }, 20)
    return () => {
      document.removeEventListener("keydown", trap, true)
      document.body.style.overflow = overflow
      window.clearTimeout(t)
      restoreRef.current?.focus?.()
    }
  }, [open, trap])

  if (!open || typeof document === "undefined") return null

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-end justify-center sm:items-center">
      <button
        type="button"
        data-close
        aria-label="Close dialog"
        onClick={onClose}
        className="absolute inset-0 h-full w-full cursor-default bg-foreground/40 backdrop-blur-[2px]"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        className={`relative flex max-h-[88dvh] w-full flex-col overflow-hidden rounded-t-3xl border border-border bg-card shadow-float sm:rounded-3xl ${
          wide ? "sm:max-w-3xl" : "sm:max-w-lg"
        }`}
      >
        <header className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div className="min-w-0">
            <h2 id={titleId} className="text-[16px] font-semibold text-foreground">
              {title}
            </h2>
            {description && (
              <p id={descId} className="mt-0.5 text-[12.5px] text-muted-foreground">
                {description}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <footer className="flex flex-wrap justify-end gap-2 border-t border-border px-5 py-3">{footer}</footer>}
      </div>
    </div>,
    document.body,
  )
}

/* ------------------------------ misc bits -------------------------------- */

export function SpeciesIcon({ species }: { species: string | null }) {
  const glyph = species === "cat" ? "🐈" : species === "bird" ? "🐦" : species === "dog" ? "🐕" : "🐾"
  return (
    <span aria-hidden="true" className="text-[15px]">
      {glyph}
    </span>
  )
}

export function LinkedBadge({ linked }: { linked: boolean }) {
  return linked ? (
    <Pill tone="accent" title="This patient is linked to a Pet10x account">
      Pet10x
    </Pill>
  ) : (
    <Pill tone="neutral" title="Not linked to a Pet10x account — the practice holds this record on its own">
      Local
    </Pill>
  )
}

export function Toolbar({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-center gap-2">{children}</div>
}

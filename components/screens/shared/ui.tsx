"use client"

/**
 * Compatibility layer — deleted in Task 7 of the UI system plan.
 *
 * Everything that used to be implemented here now lives once in
 * components/ui (one set of pieces, spec §2). This file only re-exports those
 * pieces under their old names, and keeps three thin wrappers whose old props
 * differ from the new piece (Button's `busy`/`ghost`, Pill's tones). Screens
 * import from components/ui directly as their batch moves; nothing new should
 * import from here.
 */

import type { ReactNode } from "react"
import { Button as UiButton } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"

export { SectionCard } from "@/components/ui/section-card"
export { StatTile } from "@/components/ui/stat-tile"
export { Spinner } from "@/components/ui/spinner"
export { SkeletonRows } from "@/components/ui/skeleton"
export { LoadError } from "@/components/ui/load-error"
export { EmptyState } from "@/components/ui/empty"
export { Field } from "@/components/ui/field"
export { Input as TextInput } from "@/components/ui/input"
export { Textarea as TextArea } from "@/components/ui/textarea"
export { NativeSelect as Select } from "@/components/ui/select"
export { SegmentedTabs } from "@/components/ui/segmented-tabs"
export { Modal } from "@/components/ui/dialog"
export { Toolbar } from "@/components/ui/toolbar"
export { SpeciesIcon } from "@/components/screens/shared/species-icon"
export { LinkedBadge } from "@/components/screens/clinic/linked-badge"

export type Tone = "neutral" | "good" | "warn" | "bad" | "info" | "accent"

const TONE_VARIANT = {
  neutral: "neutral",
  good: "success",
  warn: "warning",
  bad: "danger",
  info: "info",
  accent: "brand",
} as const satisfies Record<Tone, string>

/** Old name for Badge with the old tone names. */
export function Pill({ children, tone = "neutral", title }: { children: ReactNode; tone?: Tone; title?: string }) {
  return (
    <Badge variant={TONE_VARIANT[tone]} title={title}>
      {children}
    </Badge>
  )
}

/** Old Button props (`busy`, `ghost`, sizes sm/md) on the one Button. */
export function Button({
  variant = "primary",
  size = "md",
  busy = false,
  type = "button",
  ...rest
}: {
  children: ReactNode
  variant?: "primary" | "secondary" | "ghost" | "danger"
  size?: "sm" | "md"
  busy?: boolean
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <UiButton
      type={type}
      variant={variant === "ghost" ? "quiet" : variant}
      size={size}
      loading={busy}
      {...rest}
    />
  )
}

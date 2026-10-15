'use client'

import { useId, type ReactNode } from 'react'

import { ErrorText } from '@/components/ui/error-text'

/**
 * A labelled control. The label is a real <label htmlFor>, and the hint and
 * error are bound to the control through aria-describedby, so a screen reader
 * hears them with the field. The control is a render prop so any input —
 * Input, Textarea, NativeSelect or something custom — gets the same wiring.
 */
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
  children: (props: { id: string; 'aria-describedby'?: string; 'aria-invalid'?: boolean }) => ReactNode
}) {
  const id = useId()
  const hintId = hint ? `${id}-hint` : undefined
  const errId = error ? `${id}-err` : undefined
  const described = [hintId, errId].filter(Boolean).join(' ') || undefined
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-caption font-semibold text-foreground">
        {label}
        {/* A mark, not text, so it may stay red. */}
        {required && <span className="ml-0.5 text-destructive">*</span>}
      </label>
      {children({ id, 'aria-describedby': described, 'aria-invalid': error ? true : undefined })}
      {hint && !error && (
        <p id={hintId} className="text-caption text-muted-foreground">
          {hint}
        </p>
      )}
      {error && (
        <ErrorText id={errId} className="text-caption font-medium">
          {error}
        </ErrorText>
      )}
    </div>
  )
}

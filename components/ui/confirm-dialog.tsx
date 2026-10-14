'use client'

import * as React from 'react'

import { validateReason } from '@/lib/reason'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'

const REASON_ERRORS = {
  required: 'Add a reason — the person affected will see it.',
  too_long: 'Keep it under 2000 characters.',
} as const

type ConfirmDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: React.ReactNode
  confirmLabel: string
  tone?: 'danger' | 'default'
  reason?: { label: string; required: boolean; placeholder?: string }
  /** Resolves with an error message to keep the dialog open, or null to close it. */
  onConfirm: (reason: string | null) => Promise<{ error: string | null }>
}

function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  tone = 'default',
  reason,
  onConfirm,
}: ConfirmDialogProps) {
  const [text, setText] = React.useState('')
  const [error, setError] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)

  function reset() {
    setText('')
    setError(null)
  }

  function handleOpenChange(next: boolean) {
    if (busy) return
    if (!next) reset()
    onOpenChange(next)
  }

  async function handleConfirm() {
    let value: string | null = null
    if (reason) {
      const result = validateReason(text, { required: reason.required })
      if (!result.ok) {
        setError(REASON_ERRORS[result.error])
        return
      }
      value = result.value
    }
    setError(null)
    setBusy(true)
    let outcome: { error: string | null }
    try {
      outcome = await onConfirm(value)
    } catch {
      outcome = { error: 'Something went wrong. Try again.' }
    }
    setBusy(false)
    if (outcome.error) {
      setError(outcome.error)
      return
    }
    reset()
    onOpenChange(false)
  }

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        {reason && (
          <div className="grid gap-2">
            <label htmlFor="confirm-reason" className="text-sm font-medium">
              {reason.label}
            </label>
            <Textarea
              id="confirm-reason"
              value={text}
              placeholder={reason.placeholder}
              disabled={busy}
              aria-invalid={error ? true : undefined}
              onChange={(e) => setText(e.target.value)}
            />
          </div>
        )}
        {error && (
          <p role="alert" className="text-destructive text-sm">
            {error}
          </p>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
          {/* A plain Button, not AlertDialogAction: that one closes on click, before onConfirm resolves. */}
          <Button
            variant={tone === 'danger' ? 'destructive' : 'default'}
            disabled={busy}
            onClick={handleConfirm}
          >
            {confirmLabel}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

export { ConfirmDialog }
export type { ConfirmDialogProps }

"use client"

import type { RefObject } from "react"
import { Button } from "@/components/ui/button"

/** Mirrors the server's CODE_TTL_MINUTES / RESEND_COOLDOWN_SECONDS. */
export const CODE_TTL_MS = 15 * 60 * 1000
export const RESEND_COOLDOWN_MS = 60 * 1000

export const mmss = (ms: number) => {
  const total = Math.max(0, Math.ceil(ms / 1000))
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`
}

/**
 * The 6-digit code field and its two clocks — expiry and resend — shared by
 * the resident sign-up (sign-in screen) and the business sign-up
 * (/businessaccess), which verify through the same OTP routes.
 */
export function CodeEntry({
  value,
  onChange,
  onEnter,
  inputRef,
  invalid,
  msLeft,
  codeExpired,
  resendLeft,
  loading,
  onResend,
}: {
  value: string
  onChange: (code: string) => void
  onEnter: () => void
  inputRef?: RefObject<HTMLInputElement | null>
  invalid: boolean
  msLeft: number
  codeExpired: boolean
  resendLeft: number
  loading: boolean
  onResend: () => void
}) {
  return (
    <>
      <label htmlFor="otp" className="sr-only">
        6-digit verification code
      </label>
      <input
        id="otp"
        ref={inputRef}
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 6))}
        onKeyDown={(e) => e.key === "Enter" && onEnter()}
        placeholder="••••••"
        aria-invalid={invalid}
        className="w-full rounded-xl border border-input bg-card py-4 text-center font-mono text-[28px] font-bold tracking-[0.4em] text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary-soft"
      />

      <div className="mt-3 flex items-center justify-between gap-3">
        <span className={`text-[13px] ${codeExpired ? "font-semibold text-foreground" : "text-muted-foreground"}`}>
          {codeExpired ? "Code expired" : `Expires in ${mmss(msLeft)}`}
        </span>
        <Button
          // Not a submit: the code screen is a <form>, and resending must not verify.
          type="button"
          variant="quiet"
          size="sm"
          onClick={onResend}
          disabled={loading || (resendLeft > 0 && !codeExpired)}
        >
          {resendLeft > 0 && !codeExpired ? `Resend in ${Math.ceil(resendLeft / 1000)}s` : "Send a new code"}
        </Button>
      </div>
    </>
  )
}

"use client"

import { useId, useState } from "react"
import { Check, Eye, EyeOff, Info, Lock, X } from "lucide-react"
import { PASSWORD_RULES, STRENGTH_LABEL, checkPassword } from "@/lib/auth/password-rules"

/**
 * Password input with a show/hide toggle, and — when creating a password —
 * a live requirements panel.
 *
 * The panel opens on focus as well as hover. Hover alone would hide it from
 * every phone, which is where most of this app is used; focus is the touch
 * equivalent of "the user is looking at this field right now".
 */
export function PasswordField({
  value,
  onChange,
  placeholder = "Password",
  autoComplete = "current-password",
  onEnter,
  /** Show the live rules panel. Only meaningful when creating a password. */
  showRules = false,
  className = "",
  id,
  ariaLabel,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  autoComplete?: "current-password" | "new-password"
  onEnter?: () => void
  showRules?: boolean
  className?: string
  id?: string
  ariaLabel?: string
}) {
  const [visible, setVisible] = useState(false)

  /* Open/closed is derived, not a single toggle.
   *
   * `focused`/`hovered` are the automatic reasons to show it. `dismissed` is
   * the user overriding those — previously there was nothing but blur to close
   * the panel, so hovering on desktop left it up with no way out. `pinned`
   * re-opens it after a dismissal, via the ⓘ button. */
  const [focused, setFocused] = useState(false)
  const [hovered, setHovered] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  const [pinned, setPinned] = useState(false)

  const open = showRules && !dismissed && (pinned || focused || hovered)
  const generatedId = useId()
  const panelId = `${id ?? generatedId}-rules`

  const verdict = checkPassword(value)
  const strengthPct = (verdict.score / 4) * 100
  const barColor =
    verdict.score <= 1 ? "bg-destructive" : verdict.score === 2 ? "bg-warning" : verdict.score === 3 ? "bg-primary" : "bg-success"

  return (
    <div
      className={`relative ${className}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className="relative">
        <Lock className="absolute left-3.5 top-1/2 h-4.5 w-4.5 -translate-y-1/2 text-muted-foreground" />
        <input
          id={id}
          aria-label={ariaLabel}
          // Toggling the type is what actually reveals the value; there is no
          // separate "reveal" state to keep in sync.
          type={visible ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete={autoComplete}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          aria-describedby={showRules ? panelId : undefined}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setFocused(false)
            // Pinning is a one-off "show me again", not a sticky preference.
            setPinned(false)
          }}
          onKeyDown={(e) => e.key === "Enter" && onEnter?.()}
          className={`w-full rounded-xl border border-border bg-card py-3 pl-11 text-[15px] ${showRules && dismissed ? "pr-20" : "pr-12"} focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20`}
        />
        {/* Only when there are rules to review, and only once dismissed —
            otherwise it is a button that does nothing visible. */}
        {showRules && dismissed && (
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              setDismissed(false)
              setPinned(true)
            }}
            aria-label="Show password requirements"
            className="absolute right-10 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-muted-foreground transition-colors active:bg-muted"
          >
            <Info className="h-4 w-4" />
          </button>
        )}
        <button
          type="button"
          // Keeps focus in the input, so revealing the password does not close
          // the requirements panel underneath it.
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? "Hide password" : "Show password"}
          aria-pressed={visible}
          className="absolute right-1 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-muted-foreground transition-colors active:bg-muted"
        >
          {visible ? <EyeOff className="h-4.5 w-4.5" /> : <Eye className="h-4.5 w-4.5" />}
        </button>
      </div>

      {showRules && open && (
        /* Positioned rather than inline so the form below does not jump as the
           panel appears and disappears. */
        <div
          id={panelId}
          role="status"
          className="absolute left-0 right-0 top-full z-30 mt-1.5 rounded-xl border border-border bg-popover p-3 shadow-lg"
        >
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Password strength
            </span>
            <div className="flex items-center gap-1.5">
              <span className="text-[11.5px] font-semibold text-foreground">
                {value ? STRENGTH_LABEL[verdict.score] : ""}
              </span>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  setDismissed(true)
                  setPinned(false)
                }}
                aria-label="Hide password requirements"
                className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors active:bg-muted"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
          <div className="mb-2.5 h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className={`h-full rounded-full transition-all ${barColor}`}
              style={{ width: `${value ? Math.max(6, strengthPct) : 0}%` }}
            />
          </div>

          <ul className="flex flex-col gap-1.5">
            {PASSWORD_RULES.map((r) => {
              const met = r.test(value)
              return (
                <li key={r.id} className="flex items-start gap-2">
                  <span
                    className={`mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full ${
                      met ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {met ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                  </span>
                  <span className={`text-[12px] leading-snug ${met ? "text-foreground" : "text-muted-foreground"}`}>
                    {r.label}
                  </span>
                </li>
              )
            })}
          </ul>

          <p className="mt-2.5 border-t border-border pt-2 text-[11px] leading-relaxed text-muted-foreground">
            A long passphrase — four unrelated words — beats a short scramble and is easier to remember.
          </p>
        </div>
      )}
    </div>
  )
}

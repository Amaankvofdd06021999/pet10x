"use client"

import { ExternalLink, Heart } from "lucide-react"

/**
 * The BC SPCA's own donation page.
 *
 * Deliberately an outbound link and nothing more. Pet10x does not take the
 * card, hold the money, issue the tax receipt or pass anything on — building
 * any of that would mean handling donations to a registered charity we have no
 * agreement with, and a receipt that never arrives is a real problem for a real
 * donor. The SPCA already does all of it properly on their own site.
 *
 * For the same reason the copy never says "partner", "supported by" or "in
 * association with". Pet10x is pointing at a charity, not fundraising for one.
 *
 * Verified to resolve to the BC SPCA's "Help Animals in Need" page. Pet10x's
 * municipality data is BC-only, so the provincial society is the right one to
 * point at; when the app covers other provinces this should follow the
 * building's region.
 */
export const SPCA_DONATE_URL = "https://spca.bc.ca/ways-to-help/donate/"

/** Full-width card, for a profile or menu list. */
export function DonateSpcaCard({ className = "" }: { className?: string }) {
  return (
    <a
      href={SPCA_DONATE_URL}
      target="_blank"
      rel="noopener noreferrer"
      className={`flex items-center gap-3 rounded-2xl border border-border bg-card p-4 transition-transform active:scale-[0.99] ${className}`}
    >
      <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-destructive/10">
        <Heart className="h-5 w-5 text-destructive" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-semibold text-foreground">Donate to the SPCA</span>
        <span className="block text-[12.5px] leading-relaxed text-muted-foreground">
          Support animal rescue and welfare. Opens the BC SPCA&apos;s own site — Pet10x takes nothing
          and handles no payment.
        </span>
      </span>
      <ExternalLink className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
    </a>
  )
}

/** Quieter one-liner, for the end of a flow. */
export function DonateSpcaLink({ className = "" }: { className?: string }) {
  return (
    <a
      href={SPCA_DONATE_URL}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex items-center gap-1.5 text-[13px] font-semibold text-destructive underline-offset-2 hover:underline ${className}`}
    >
      <Heart className="h-3.5 w-3.5" />
      Donate to the SPCA
      <ExternalLink className="h-3 w-3 opacity-70" />
    </a>
  )
}

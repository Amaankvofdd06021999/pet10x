"use client"

import { useEffect, useState, type ReactNode } from "react"
import { createPortal } from "react-dom"

/**
 * Renders children into <body>, escaping the app shell's stacking context.
 *
 * The screen wrapper in app/app/page.tsx carries `animate-in fade-in`, which
 * animates opacity and therefore CREATES A STACKING CONTEXT. Anything inside
 * it — however high its z-index — is confined below siblings of that wrapper,
 * so a z-50 modal still rendered underneath the z-50 tab bar and the z-40 FAB.
 * Raising the modal's z-index cannot fix that; it has to leave the subtree.
 *
 * This is the same thing Radix does for its Dialog, which is why the shadcn
 * dialogs never showed the bug and the hand-rolled ones all did.
 *
 * Mounting is deferred one tick because `document` does not exist during SSR;
 * returning null on the server keeps the markup identical on both sides.
 */
export function Portal({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])

  if (!mounted) return null
  return createPortal(children, document.body)
}

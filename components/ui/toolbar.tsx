import type { ReactNode } from 'react'

/** A wrapping row of controls above a list — filters, search, actions. */
export function Toolbar({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-center gap-2">{children}</div>
}

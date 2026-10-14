/**
 * Said on every scoped manager screen when the account's buildings couldn't be
 * loaded: the list beneath is every building's, and the manager should know
 * that before acting on a row.
 */
export function ScopeNotice({ notice, className = "" }: { notice: string | null; className?: string }) {
  if (!notice) return null
  return (
    <p
      role="status"
      className={`rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-[12px] font-medium text-warning-strong ${className}`}
    >
      {notice}
    </p>
  )
}

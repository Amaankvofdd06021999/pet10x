import { Archive } from "lucide-react"

/**
 * Shown to a manager whose building an admin has archived (20261008000004).
 *
 * The building is off Pet10x: its code no longer resolves, nobody can join or
 * report to it, and it has left the strata portfolio. Its history is kept and
 * the manager can still read it — but settings that only matter to a live
 * building are withdrawn, so the banner says why rather than leaving controls
 * that quietly do nothing for anyone.
 */
export function ArchivedBuildingBanner({ name }: { name: string }) {
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-border bg-muted/60 p-4">
      <Archive className="mt-0.5 h-5 w-5 flex-shrink-0 text-muted-foreground" aria-hidden="true" />
      <div>
        <p className="text-[14px] font-semibold text-foreground">{name} is archived</p>
        <p className="mt-0.5 text-[12.5px] leading-relaxed text-muted-foreground">
          A Pet10x admin took this building off Pet10x. Its code no longer works for joining or reporting, and its
          settings can&apos;t be changed. Its residents, pets and records are kept and stay readable here. Ask a Pet10x
          admin to restore it.
        </p>
      </div>
    </div>
  )
}

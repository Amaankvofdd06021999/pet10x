import Link from "next/link"
import { ChevronRight, FileText, HelpCircle, Mail, ShieldCheck } from "lucide-react"
import { SUPPORT_EMAIL, SUPPORT_MAILTO } from "@/lib/site"

const ROWS = [
  { href: "/help", label: "Help & FAQ", icon: HelpCircle },
  { href: "/terms", label: "Terms of Service", icon: FileText },
  { href: "/privacy", label: "Privacy Policy", icon: ShieldCheck },
] as const

/**
 * The Help & legal rows on the resident Profile and the manager Settings
 * screen. Plain links to the public pages, plus the support address — every
 * row goes somewhere real.
 */
export function HelpLegalSection({ title = "Help & legal" }: { title?: string }) {
  const row = "flex w-full items-center gap-3 border-b border-border px-3 py-2.5 text-left transition-colors active:bg-muted"
  return (
    <section className="mb-5">
      <h3 className="mb-1.5 px-1 text-[11px] font-semibold uppercase text-muted-foreground">{title}</h3>
      <div className="overflow-hidden rounded-2xl card-raised">
        {ROWS.map(({ href, label, icon: Icon }) => (
          <Link key={href} href={href} className={row}>
            <Icon className="h-5 w-5 text-primary" />
            <span className="flex-1 text-[14px] text-foreground">{label}</span>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </Link>
        ))}
        <a href={SUPPORT_MAILTO} className={`${row} border-b-0`}>
          <Mail className="h-5 w-5 text-primary" />
          <span className="flex-1 text-[14px] text-foreground">Contact support</span>
          <span className="truncate text-[12px] text-muted-foreground">{SUPPORT_EMAIL}</span>
          <ChevronRight className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
        </a>
      </div>
    </section>
  )
}

/** One line of the same links, for consoles with no settings screen (clinic, business). */
export function HelpLegalLinks({ className = "" }: { className?: string }) {
  const link = "hover:text-foreground"
  return (
    <p className={`flex flex-wrap gap-x-3 gap-y-1 text-[11.5px] text-muted-foreground ${className}`}>
      <Link href="/help" className={link}>
        Help
      </Link>
      <Link href="/terms" className={link}>
        Terms
      </Link>
      <Link href="/privacy" className={link}>
        Privacy
      </Link>
      <a href={SUPPORT_MAILTO} className={link}>
        Contact
      </a>
    </p>
  )
}

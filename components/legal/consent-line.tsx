import Link from "next/link"

/**
 * "By continuing, you agree…" under every form that creates an account, with
 * the two documents it names actually linked.
 */
export function ConsentLine({ className = "" }: { className?: string }) {
  return (
    <p className={`text-center text-[11px] text-muted-foreground ${className}`}>
      By continuing, you agree to our{" "}
      <Link href="/terms" className="font-medium text-foreground underline underline-offset-2">
        Terms
      </Link>{" "}
      &amp;{" "}
      <Link href="/privacy" className="font-medium text-foreground underline underline-offset-2">
        Privacy Policy
      </Link>
    </p>
  )
}

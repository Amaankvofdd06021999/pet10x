"use client"

import { Mail, Phone } from "lucide-react"
import { telHref } from "@/lib/data/business-contact"

/**
 * A phone number and an email, printed as text you can read and copy, with the
 * tel: / mailto: link on that same text. The text is the point: a link does
 * nothing on a desktop with no phone or mail app, so it can never be the only
 * way to get the number. Renders nothing when both are missing.
 *
 * Used for the business on its page and on a customer's booking, and for the
 * customer on the business's booking card.
 */
export function ContactLinks({
  phone,
  email,
  className = "",
}: {
  phone: string | null
  email: string | null
  className?: string
}) {
  if (!phone && !email) return null
  return (
    <ul className={`flex flex-col gap-1.5 ${className}`}>
      {phone && (
        <li className="flex items-center gap-2 text-[13px]">
          <Phone className="h-3.5 w-3.5 flex-shrink-0 text-primary" aria-hidden="true" />
          <a href={telHref(phone)} className="select-text text-foreground underline-offset-2 hover:underline">
            {phone}
          </a>
        </li>
      )}
      {email && (
        <li className="flex min-w-0 items-center gap-2 text-[13px]">
          <Mail className="h-3.5 w-3.5 flex-shrink-0 text-primary" aria-hidden="true" />
          <a href={`mailto:${email}`} className="select-text break-all text-foreground underline-offset-2 hover:underline">
            {email}
          </a>
        </li>
      )}
    </ul>
  )
}

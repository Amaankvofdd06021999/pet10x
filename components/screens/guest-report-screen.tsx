"use client"

import { LogOut } from "lucide-react"
import { useAuth } from "@/lib/auth-context"
import { IncidentComposer } from "@/components/screens/report/incident-composer"

/**
 * Filing a report with nothing but a code from the lobby.
 *
 * This screen is a shell. Everything about the report itself — the four steps,
 * the photos, the pet picker, the summary and the success screen with its
 * reference number — is `IncidentComposer`, which the signed-in resident path
 * renders too. This file's whole job is to say who the reporter is: a guest,
 * anonymous by default, filing against the building their code resolved to,
 * with a way out that ends the guest session rather than navigating.
 *
 * It used to carry its own copy of that flow, and the copy is why the bug
 * existed: its evidence step had no file input, pushed the hardcoded string
 * "/pets/dog1.jpg", and never sent a photo anywhere. The resident screen had
 * no evidence step at all. One act, two implementations, one of them extended.
 */
export function GuestReportScreen() {
  const { guestSession, signOut } = useAuth()

  // Every caller renders this only once a code has resolved, so there is no
  // "enter your code" state to fall back to here — leaving is the honest
  // option, and it is the same button the header carries.
  if (!guestSession) return null

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <IncidentComposer
        building={{ code: guestSession.buildingCode, name: guestSession.buildingName }}
        defaultAnonymous
        onBack={signOut}
        onDone={signOut}
        headerAction={
          <button
            onClick={signOut}
            className="flex items-center gap-1.5 rounded-full bg-muted px-3 py-1.5 text-[12px] font-medium text-muted-foreground transition-transform active:scale-95"
          >
            <LogOut className="h-3.5 w-3.5" />
            Exit
          </button>
        }
      />
    </div>
  )
}

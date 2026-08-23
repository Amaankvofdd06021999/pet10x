"use client"

import { useEffect, useState } from "react"
import { toast } from "sonner"
import { Loader2 } from "lucide-react"
import { IOSNavBar } from "@/components/ios-nav-bar"
import { NavBackButton } from "@/components/nav-back-button"
import { ReportChooser } from "@/components/screens/report/report-chooser"
import { MunicipalReport } from "@/components/screens/report/municipal-report"
import { IncidentComposer } from "@/components/screens/report/incident-composer"
import { myBuildingCode } from "@/lib/data/municipal"

/**
 * Reporting from inside the app, for a signed-in resident.
 *
 * Same two destinations as the public page, with one difference that matters:
 * a linked resident is not asked for their building code. They were given it
 * once, at join time, and have no reason to still have it — and we already
 * know which building they are in.
 *
 * This screen is a shell. It decides which building is being filed against and
 * hands over to `IncidentComposer`, which is the one implementation of filing
 * a report — the same one the signed-out guest page renders. It used to hold a
 * second, flatter form of its own, and that fork is why the evidence step only
 * ever existed on the guest side.
 */
export function ReportScreen({ onBack }: { onBack: () => void }) {
  const [view, setView] = useState<"choose" | "building" | "municipal">("choose")
  const [building, setBuilding] = useState<{ code: string; name: string } | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    void myBuildingCode().then((b) => {
      setBuilding(b)
      setLoading(false)
    })
  }, [])

  if (loading) {
    return (
      <div className="flex min-h-dvh flex-col bg-background">
        <IOSNavBar title="Report" largeTitle={false} leftAction={<NavBackButton onClick={onBack} />} />
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </div>
    )
  }

  /* The composer brings its own header — title, building name, progress and a
     back button that walks the steps. Stacking the app's nav bar on top of it
     would put two bars and two back arrows on one screen, meaning different
     things. So the composer takes over the screen for the building path.

     Taking the viewport means taking responsibility for the tab bar. `IOSTabBar`
     is `fixed bottom-0 z-50 h-16` and `app/app/page.tsx` renders it for every
     authenticated screen, this one included.

     The padding sits on this wrapper, not on the composer's `<main>`, because
     the document is what scrolls here. `main` carries `ios-scroll`, which is
     `overflow-y: auto`, so it reads like the scroll container — but `min-h-dvh`
     below is a minimum, not a definite height, so the flex line just grows past
     the viewport to fit its content and never constrains `flex-1`. Measuring in
     Task 4 gave `main` an overflow of 0 and put the whole scroll on the
     document. At full scroll the last element — on the pet step, the only
     Continue/Skip button — would otherwise sit under the bar.

     Padding `main` would clear it just as well, since the document grows to
     fit. The clearance sits here instead because `main` belongs to the shared
     composer, and the guest shell that also renders it has no tab bar to
     clear — `/report` is standalone and the guest branch returns before
     `IOSTabBar`. Padding `main` would leak 64px of dead space into every
     guest report.

     The clearance itself is stated the way `ai-chat-screen.tsx` states it: the
     bar's own 64px plus the home indicator, dropped at the `md` breakpoint
     where the bar is hidden. A/B measurement confirmed the amount. */
  if (view === "building" && building) {
    return (
      <div className="flex min-h-dvh flex-col bg-background pb-[calc(4rem+env(safe-area-inset-bottom))] md:pb-0">
        <IncidentComposer
          building={building}
          /* Anonymous by default, as the form this replaced was.

             A resident reports someone they will keep sharing a lift with. The
             safer default is the one they opt out of, not into — and the
             summary step shows the toggle plainly before anything is sent, so
             attaching their name stays one tap away. Flipping this to `false`
             as a side effect of merging two screens would have quietly made a
             privacy default less protective. */
          defaultAnonymous
          onBack={() => setView("choose")}
          onDone={onBack}
        />
      </div>
    )
  }

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <IOSNavBar
        title="Report an incident"
        largeTitle={false}
        leftAction={<NavBackButton onClick={view === "choose" ? onBack : () => setView("choose")} />}
      />
      <main className="ios-scroll flex-1 pb-24">
        {view === "choose" && (
          <ReportChooser
            buildingName={building?.name ?? null}
            onBuilding={() => {
              if (!building) {
                toast.error("You're not linked to a building yet", {
                  description: "Join one with a building code, or report to your municipality instead.",
                })
                return
              }
              setView("building")
            }}
            onMunicipal={() => setView("municipal")}
          />
        )}
        {view === "municipal" && <MunicipalReport signedIn onBack={() => setView("choose")} />}
      </main>
    </div>
  )
}

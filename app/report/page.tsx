"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { PawPrint } from "lucide-react"
import { Toaster } from "@/components/ui/sonner"
import { ReportChooser } from "@/components/screens/report/report-chooser"
import { MunicipalReport } from "@/components/screens/report/municipal-report"

/**
 * The public reporting entry point, linked from the landing nav.
 *
 * No account required for either path. The building route hands off to the
 * existing guest flow on /login, which already takes a building code and shows
 * the building's pets as photos — rebuilding that here would be a second
 * implementation of a screen with a privacy contract worth having in one
 * place.
 */
export default function ReportPage() {
  const [view, setView] = useState<"choose" | "municipal">("choose")
  const router = useRouter()

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="border-b border-border/60 px-5 py-3.5 sm:px-8">
        <Link href="/" className="flex items-center gap-2" aria-label="Pet10x home">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary shadow-sm shadow-primary/30">
            <PawPrint className="h-5 w-5 text-primary-foreground" strokeWidth={2.5} />
          </span>
          <span className="text-[17px] font-semibold tracking-tight text-foreground">Pet10x</span>
        </Link>
      </header>

      <main className="flex-1">
        {view === "choose" ? (
          <ReportChooser
            onBuilding={() => router.push("/login?report=1")}
            onMunicipal={() => setView("municipal")}
          />
        ) : (
          <MunicipalReport onBack={() => setView("choose")} />
        )}
      </main>

      <Toaster />
    </div>
  )
}

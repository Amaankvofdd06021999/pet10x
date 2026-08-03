"use client"

import { useState } from "react"
import { usePets } from "@/lib/data"
import { CareTracker } from "@/components/screens/care/care-tracker"
import { ArrowLeft, Plus, PawPrint } from "lucide-react"

interface PetCareScreenProps {
  onBack: () => void
  onNavigate?: (screen: string) => void
  /** Tab to open on, when arriving from a Today's Care tile. */
  initialKind?: string
}

/**
 * The standalone Trackers screen: a pet switcher above the shared tracker.
 *
 * The tracker itself lives in `CareTracker` so the pet's own detail screen can
 * show the same logs and targets without a second implementation — care is a
 * property of the animal, and the two views must never disagree about it.
 */
export function PetCareScreen({ onBack, onNavigate, initialKind }: PetCareScreenProps) {
  const { data: pets, isLoading: petsLoading } = usePets()
  const [activePetId, setActivePetId] = useState<string | undefined>(undefined)
  const pet = pets.find((p) => p.id === (activePetId ?? pets[0]?.id)) ?? pets[0]

  if (!petsLoading && pets.length === 0) {
    return (
      <ScreenShell onBack={onBack}>
        <div className="flex flex-1 flex-col items-center justify-center px-8 py-16 text-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
            <PawPrint className="h-8 w-8 text-primary" />
          </div>
          <h2 className="text-[18px] font-semibold text-foreground">No pets yet</h2>
          <p className="mt-1.5 max-w-xs text-[14px] leading-relaxed text-muted-foreground">
            Add a pet to start tracking food, medicine and treats — every entry is saved to your account.
          </p>
          <button
            onClick={() => onNavigate?.("add-pet")}
            className="mt-5 flex items-center gap-2 rounded-xl bg-primary px-5 py-3 text-[15px] font-semibold text-primary-foreground transition-transform active:scale-[0.98]"
          >
            <Plus className="h-4.5 w-4.5" /> Add a pet
          </button>
        </div>
      </ScreenShell>
    )
  }

  return (
    <ScreenShell onBack={onBack} title="Trackers">
      <main className="ios-scroll flex-1 px-4 pb-24 pt-4">
        {pets.length > 1 && (
          <div className="no-scrollbar mb-4 flex gap-2 overflow-x-auto">
            {pets.map((p) => (
              <button
                key={p.id}
                onClick={() => setActivePetId(p.id)}
                className={`flex-shrink-0 rounded-lg border px-3 py-2 text-[13px] font-semibold transition-colors ${
                  p.id === pet?.id
                    ? "border-primary bg-primary/5 text-primary"
                    : "border-border bg-card text-muted-foreground"
                }`}
              >
                {p.name}
              </button>
            ))}
          </div>
        )}

        {/* Remounted per pet: the tracker holds per-pet state (selected kind,
            unit, draft amounts) that must not survive a switch. */}
        {pet && <CareTracker key={pet.id} pet={pet} initialKind={initialKind} />}
      </main>
    </ScreenShell>
  )
}

function ScreenShell({ children, onBack, title }: { children: React.ReactNode; onBack: () => void; title?: string }) {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="sticky top-0 z-40 border-b border-border bg-card/80 px-4 pt-safe backdrop-blur-xl">
        <div className="flex h-12 items-center gap-2">
          <button onClick={onBack} className="flex items-center gap-1 text-primary" aria-label="Back">
            <ArrowLeft className="h-5 w-5" />
            <span className="text-[17px]">Back</span>
          </button>
          <h1 className="absolute left-1/2 -translate-x-1/2 text-[17px] font-semibold text-foreground">
            {title ?? "Trackers"}
          </h1>
        </div>
      </header>
      {children}
    </div>
  )
}

"use client"

import { Loader2 } from "lucide-react"
import { IOSNavBar } from "@/components/ios-nav-bar"
import { NavBackButton } from "@/components/nav-back-button"
import { BuildingTeam } from "@/components/screens/strata/team-screen"
import { useAuth } from "@/lib/auth-context"
import { usePortfolioTeam } from "@/lib/data/portfolio"
import { LoadError } from "@/components/ui/load-error"

/**
 * Settings › Staff & Access. The active building's managers — the strata
 * portal's team card for one building. Invite and remove are offered to the
 * building's primary manager only, as in the portal; /api/strata/invite and
 * removeCoManager check the same thing on the server.
 */
export function StaffAccessScreen({
  buildingId,
  buildingName,
  onBack,
}: {
  buildingId: string
  buildingName: string
  onBack: () => void
}) {
  const { user, managedBuildings } = useAuth()
  const { data: team, isLoading, error, refetch } = usePortfolioTeam([buildingId])
  const isPrimary = managedBuildings.some((b) => b.id === buildingId && b.isPrimary === true)

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <IOSNavBar title="Staff & Access" largeTitle={false} leftAction={<NavBackButton onClick={onBack} />} />
      <main className="ios-scroll flex-1 px-4 pb-24">
        <p className="mb-3 text-caption leading-relaxed text-muted-foreground">
          Everyone who manages {buildingName}. Managers see every resident, pet, case and report in the building.
        </p>
        {isLoading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <LoadError message="Couldn't load the team." onRetry={() => void refetch()} />
        ) : (
          <BuildingTeam
            buildingId={buildingId}
            buildingName={buildingName}
            isPrimary={isPrimary}
            members={team}
            myId={user?.id ?? ""}
            onChange={refetch}
          />
        )}
      </main>
    </div>
  )
}

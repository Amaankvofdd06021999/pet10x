"use client"

import { useState } from "react"
import { UsersRound, MapPin } from "lucide-react"
import type { ClinicMembership, ClinicRole } from "@/lib/data/clinic/context"
import { useClinicStaff, useClinicLocations, updateStaff } from "@/lib/data/clinic/context"
import { formatDateShort } from "@/lib/data/clinic/time"
import { SectionCard, Spinner, LoadError, EmptyState, Button, Pill, Select, Field } from "@/components/screens/shared/ui"

const ROLE_LABEL: Record<ClinicRole, string> = {
  owner: "Owner",
  manager: "Practice manager",
  veterinarian: "Veterinarian",
  nurse: "Nurse / technician",
  reception: "Reception",
}

export function ClinicTeamScreen({ clinic }: { clinic: ClinicMembership }) {
  const staff = useClinicStaff(clinic.businessId)
  const locations = useClinicLocations(clinic.businessId)
  const [busy, setBusy] = useState<string | null>(null)

  return (
    <div className="flex flex-col gap-4">
      <SectionCard title="Team" subtitle="Roles decide who may read shared records and who may publish them">
        {staff.isLoading ? (
          <Spinner />
        ) : staff.error ? (
          <LoadError message={staff.error} onRetry={staff.refetch} />
        ) : staff.data.length === 0 ? (
          <EmptyState title="No team members" icon={<UsersRound className="h-5 w-5" aria-hidden="true" />} />
        ) : (
          <ul className="flex flex-col gap-2">
            {staff.data.map((s) => {
              const lapsed =
                s.licenceExpiresOn !== null && new Date(s.licenceExpiresOn) < new Date()
              return (
                <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border p-3">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 text-[13.5px] font-semibold text-foreground">
                      {s.name}
                      {!s.isActive && <Pill tone="neutral">Inactive</Pill>}
                      {s.isBookable && <Pill tone="accent">Bookable</Pill>}
                      {lapsed && <Pill tone="bad">Licence lapsed</Pill>}
                    </p>
                    <p className="text-[12px] text-muted-foreground">
                      {[s.email, s.title].filter(Boolean).join(" · ") || "No contact on file"}
                      {s.licenceNumber ? ` · ${s.licenceNumber}` : ""}
                      {s.licenceExpiresOn ? ` · expires ${formatDateShort(s.licenceExpiresOn)}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <label htmlFor={`role-${s.id}`} className="sr-only">
                      Role for {s.name}
                    </label>
                    <Select
                      id={`role-${s.id}`}
                      value={s.role}
                      disabled={busy === s.id}
                      onChange={async (e) => {
                        setBusy(s.id)
                        const res = await updateStaff(s.id, { role: e.target.value as ClinicRole })
                        setBusy(null)
                        if (res.error) window.alert(res.error)
                        else staff.refetch()
                      }}
                      className="w-auto"
                    >
                      {(Object.keys(ROLE_LABEL) as ClinicRole[]).map((r) => (
                        <option key={r} value={r}>
                          {ROLE_LABEL[r]}
                        </option>
                      ))}
                    </Select>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={async () => {
                        setBusy(s.id)
                        const res = await updateStaff(s.id, { is_bookable: !s.isBookable })
                        setBusy(null)
                        if (res.error) window.alert(res.error)
                        else staff.refetch()
                      }}
                    >
                      {s.isBookable ? "Remove from calendar" : "Add to calendar"}
                    </Button>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </SectionCard>

      <SectionCard title="Locations">
        {locations.data.length === 0 ? (
          <EmptyState title="No locations" icon={<MapPin className="h-5 w-5" aria-hidden="true" />} />
        ) : (
          <ul className="flex flex-col gap-2">
            {locations.data.map((l) => (
              <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border p-3">
                <div>
                  <p className="flex items-center gap-2 text-[13.5px] font-semibold text-foreground">
                    {l.name}
                    {l.isPrimary && <Pill tone="accent">Primary</Pill>}
                  </p>
                  <p className="text-[12px] text-muted-foreground">
                    {[l.address, l.city, l.phone].filter(Boolean).join(" · ") || "No address on file"}
                  </p>
                </div>
                <Pill tone="neutral">{l.timezone}</Pill>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  )
}

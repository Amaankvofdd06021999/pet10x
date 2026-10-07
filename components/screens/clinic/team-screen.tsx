"use client"

import { useState } from "react"
import { UsersRound, MapPin, UserPlus, Copy } from "lucide-react"
import type { ClinicMembership, ClinicRole } from "@/lib/data/clinic/context"
import {
  useClinicStaff, useClinicLocations, updateStaff, inviteStaff, capabilities,
} from "@/lib/data/clinic/context"
import {
  STAFF_ROLE_LABEL as ROLE_LABEL, INVITABLE_ROLES, canDeactivate, type InvitableRole,
} from "@/lib/data/clinic/staff-invite"
import { formatDateShort } from "@/lib/data/clinic/time"
import {
  SectionCard, Spinner, LoadError, EmptyState, Button, Pill, Select, Field, Modal, TextInput,
} from "@/components/screens/shared/ui"

export function ClinicTeamScreen({ clinic }: { clinic: ClinicMembership }) {
  const staff = useClinicStaff(clinic.businessId)
  const locations = useClinicLocations(clinic.businessId)
  const [busy, setBusy] = useState<string | null>(null)
  const [inviteOpen, setInviteOpen] = useState(false)
  const caps = capabilities(clinic.role, clinic.tier, clinic.isOwner)

  return (
    <div className="flex flex-col gap-4">
      <SectionCard
        title="Team"
        subtitle="Roles decide who may read shared records and who may publish them"
        actions={
          caps.manageTeam ? (
            <Button size="sm" onClick={() => setInviteOpen(true)}>
              <UserPlus className="h-4 w-4" aria-hidden="true" /> Invite staff
            </Button>
          ) : undefined
        }
      >
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
                    {caps.manageTeam &&
                      canDeactivate(s, { ownerId: clinic.ownerId, viewerId: clinic.profileId }) && (
                        <Button
                          size="sm"
                          variant="secondary"
                          busy={busy === `active-${s.id}`}
                          onClick={async () => {
                            if (
                              s.isActive &&
                              !window.confirm(
                                `Deactivate ${s.name}? They lose access to ${clinic.name} until reactivated. ` +
                                  "Their past work stays on record.",
                              )
                            )
                              return
                            setBusy(`active-${s.id}`)
                            const res = await updateStaff(s.id, { is_active: !s.isActive })
                            setBusy(null)
                            if (res.error) window.alert(`Couldn't update ${s.name}. Try again.`)
                            else staff.refetch()
                          }}
                        >
                          {s.isActive ? "Deactivate" : "Reactivate"}
                        </Button>
                      )}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </SectionCard>

      {caps.manageTeam && (
        <InviteStaffModal
          open={inviteOpen}
          onClose={() => setInviteOpen(false)}
          businessId={clinic.businessId}
          businessName={clinic.name}
          onInvited={staff.refetch}
        />
      )}

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

/**
 * Name, email, role. On success with email suppressed (dev) the invite link is
 * shown here to copy, exactly as the strata team screen offers it.
 */
function InviteStaffModal({
  open, onClose, businessId, businessName, onInvited,
}: {
  open: boolean
  onClose: () => void
  businessId: string
  businessName: string
  onInvited: () => void
}) {
  const [fullName, setFullName] = useState("")
  const [email, setEmail] = useState("")
  const [role, setRole] = useState<InvitableRole>("veterinarian")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<{ message: string; inviteUrl?: string } | null>(null)

  function close() {
    setFullName("")
    setEmail("")
    setRole("veterinarian")
    setError(null)
    setDone(null)
    onClose()
  }

  async function submit() {
    setError(null)
    if (!fullName.trim()) return setError("Enter their name.")
    if (!email.trim()) return setError("Enter their email.")
    setBusy(true)
    const res = await inviteStaff({ businessId, email: email.trim(), fullName: fullName.trim(), role })
    setBusy(false)
    if (res.error) return setError(res.error)
    onInvited()
    if (res.existing) {
      setDone({ message: `${fullName.trim()} already had a Pet10x account and is now on your team.` })
    } else if (res.emailSent === false && res.inviteUrl) {
      setDone({
        message: "Added — the email was not sent (email is off outside production). Copy the invite link to share it.",
        inviteUrl: res.inviteUrl,
      })
    } else {
      setDone({ message: `Invite sent to ${email.trim()}.` })
    }
  }

  return (
    <Modal
      open={open}
      onClose={close}
      title="Invite staff"
      description={`They join ${businessName} with the role you choose. You can change it later.`}
      footer={
        done ? (
          <Button onClick={close}>Done</Button>
        ) : (
          <>
            <Button variant="secondary" onClick={close}>Cancel</Button>
            <Button busy={busy} onClick={() => void submit()}>Send invite</Button>
          </>
        )
      }
    >
      {done ? (
        <div className="flex flex-col gap-3">
          <p role="status" className="text-[13px] text-foreground">{done.message}</p>
          {done.inviteUrl && (
            <div className="flex items-center gap-2">
              <label htmlFor="invite-url" className="sr-only">Invite link</label>
              <TextInput id="invite-url" readOnly value={done.inviteUrl} onFocus={(e) => e.currentTarget.select()} />
              <Button
                size="sm"
                variant="secondary"
                onClick={() => void navigator.clipboard?.writeText(done.inviteUrl ?? "")}
              >
                <Copy className="h-4 w-4" aria-hidden="true" /> Copy link
              </Button>
            </div>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <Field label="Name" required>
            {(p) => <TextInput {...p} value={fullName} onChange={(e) => setFullName(e.target.value)} autoComplete="off" />}
          </Field>
          <Field label="Email" required>
            {(p) => (
              <TextInput
                {...p}
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoCapitalize="none"
                autoComplete="off"
              />
            )}
          </Field>
          <Field label="Role" required error={error}>
            {(p) => (
              <Select {...p} value={role} onChange={(e) => setRole(e.target.value as InvitableRole)}>
                {INVITABLE_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABEL[r]}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>
      )}
    </Modal>
  )
}

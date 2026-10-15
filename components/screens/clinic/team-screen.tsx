"use client"

import { useState } from "react"
import { toast } from "sonner"
import { UsersRound, MapPin, UserPlus, Copy, Plus, X } from "lucide-react"
import type { ClinicMembership, ClinicRole, ClinicStaffMember } from "@/lib/data/clinic/context"
import {
  useClinicStaff, useClinicLocations, updateStaff, inviteStaff, capabilities,
} from "@/lib/data/clinic/context"
import {
  STAFF_ROLE_LABEL as ROLE_LABEL, INVITABLE_ROLES, canEditMember, staffErrorSentence, type InvitableRole,
} from "@/lib/data/clinic/staff-invite"
import { formatDateShort } from "@/lib/data/clinic/time"
import { useStaffHours, replaceStaffHours } from "@/lib/data/clinic/schedule"
import { validateHours, nextSession, WEEKDAY_LABEL, WEEKDAY_ORDER, type HoursRow } from "@/lib/data/clinic/hours"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { SectionCard } from "@/components/ui/section-card"
import { Spinner } from "@/components/ui/spinner"
import { LoadError } from "@/components/ui/load-error"
import { EmptyState } from "@/components/ui/empty"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { NativeSelect } from "@/components/ui/select"
import { Field } from "@/components/ui/field"
import { Modal } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { ErrorText } from "@/components/ui/error-text"

export function ClinicTeamScreen({ clinic }: { clinic: ClinicMembership }) {
  const staff = useClinicStaff(clinic.businessId)
  const locations = useClinicLocations(clinic.businessId)
  const [busy, setBusy] = useState<string | null>(null)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [deactivating, setDeactivating] = useState<ClinicStaffMember | null>(null)
  const [hoursFor, setHoursFor] = useState<ClinicStaffMember | null>(null)
  const hours = useStaffHours(clinic.businessId)
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
        {hours.error && (
          <div className="mb-3">
            <LoadError message={`Couldn't load weekly hours. ${hours.error}`} onRetry={hours.refetch} />
          </div>
        )}
        {staff.isLoading ? (
          <Spinner />
        ) : staff.error ? (
          <LoadError message={staff.error} onRetry={staff.refetch} />
        ) : staff.data.length === 0 ? (
          <EmptyState title="No team members" icon={<UsersRound className="h-5 w-5" aria-hidden="true" />} />
        ) : (
          <ul className="flex flex-col gap-2">
            {staff.data.map((s) => {
              const editable = canEditMember(s, { ownerId: clinic.ownerId, viewerId: clinic.profileId })
              const lapsed =
                s.licenceExpiresOn !== null && new Date(s.licenceExpiresOn) < new Date()
              return (
                <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border p-3">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 text-meta font-semibold text-foreground">
                      {s.name}
                      {!s.isActive && <Badge variant="neutral">Inactive</Badge>}
                      {s.isBookable && <Badge variant="brand">Bookable</Badge>}
                      {lapsed && <Badge variant="danger">Licence lapsed</Badge>}
                    </p>
                    <p className="text-caption text-muted-foreground">
                      {[s.email, s.title].filter(Boolean).join(" · ") || "No contact on file"}
                      {s.licenceNumber ? ` · ${s.licenceNumber}` : ""}
                      {s.licenceExpiresOn ? ` · expires ${formatDateShort(s.licenceExpiresOn)}` : ""}
                    </p>
                    {s.isBookable && s.isActive && !hours.isLoading && !hours.error && (
                      <p className="mt-0.5 text-caption text-muted-foreground">
                        {hoursSummary(hours.data[s.id] ?? [])}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {/* Your own row and the owner's are not yours to change —
                        business_staff_guard (20261010000002) refuses it — so
                        they show the role, not a picker. Owner is never offered. */}
                    {caps.manageTeam && editable ? (
                      <>
                        <label htmlFor={`role-${s.id}`} className="sr-only">
                          Role for {s.name}
                        </label>
                        <NativeSelect
                          id={`role-${s.id}`}
                          value={s.role}
                          disabled={busy === s.id}
                          onChange={async (e) => {
                            setBusy(s.id)
                            const res = await updateStaff(s.id, { role: e.target.value as ClinicRole })
                            setBusy(null)
                            if (res.error) toast.error(`Couldn't change ${s.name}'s role. ${staffErrorSentence(res.error)}`)
                            else staff.refetch()
                          }}
                          className="w-auto"
                        >
                          {s.role === "owner" && (
                            <option value="owner" disabled>
                              {ROLE_LABEL.owner}
                            </option>
                          )}
                          {INVITABLE_ROLES.map((r) => (
                            <option key={r} value={r}>
                              {ROLE_LABEL[r]}
                            </option>
                          ))}
                        </NativeSelect>
                      </>
                    ) : (
                      <Badge variant="neutral">{ROLE_LABEL[s.role]}</Badge>
                    )}
                    {caps.manageSchedule && s.isBookable && s.isActive && (
                      // Never opened on hours that haven't loaded: saving an
                      // empty editor would replace the real rows with nothing.
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={hours.isLoading || Boolean(hours.error)}
                        onClick={() => setHoursFor(s)}
                      >
                        Weekly hours
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="quiet"
                      onClick={async () => {
                        setBusy(s.id)
                        const res = await updateStaff(s.id, { is_bookable: !s.isBookable })
                        setBusy(null)
                        if (res.error) toast.error(res.error)
                        else staff.refetch()
                      }}
                    >
                      {s.isBookable ? "Remove from calendar" : "Add to calendar"}
                    </Button>
                    {caps.manageTeam && editable && (
                        <Button
                          size="sm"
                          variant="secondary"
                          loading={busy === `active-${s.id}`}
                          onClick={async () => {
                            if (s.isActive) return setDeactivating(s)
                            setBusy(`active-${s.id}`)
                            const res = await updateStaff(s.id, { is_active: true })
                            setBusy(null)
                            if (res.error) toast.error(`Couldn't update ${s.name}. ${staffErrorSentence(res.error)}`)
                            else {
                              toast.success(`${s.name} reactivated`)
                              staff.refetch()
                            }
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

      <ConfirmDialog
        open={deactivating !== null}
        onOpenChange={(open) => {
          if (!open) setDeactivating(null)
        }}
        title={`Deactivate ${deactivating?.name ?? "this person"}?`}
        description={`They lose access to ${clinic.name} until reactivated. Their past work stays on record.`}
        confirmLabel="Deactivate"
        tone="danger"
        onConfirm={async () => {
          const s = deactivating
          if (!s) return { error: null }
          const res = await updateStaff(s.id, { is_active: false })
          if (res.error) return { error: `Couldn't update ${s.name}. ${staffErrorSentence(res.error)}` }
          toast.success(`${s.name} deactivated`)
          staff.refetch()
          return { error: null }
        }}
      />

      {hoursFor && (
        <HoursModal
          key={hoursFor.id}
          businessId={clinic.businessId}
          member={hoursFor}
          initial={hours.data[hoursFor.id] ?? []}
          onClose={() => setHoursFor(null)}
          onSaved={() => {
            toast.success(`Saved ${hoursFor.name}'s hours`)
            setHoursFor(null)
            hours.refetch()
          }}
        />
      )}

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
                  <p className="flex items-center gap-2 text-meta font-semibold text-foreground">
                    {l.name}
                    {l.isPrimary && <Badge variant="brand">Primary</Badge>}
                  </p>
                  <p className="text-caption text-muted-foreground">
                    {[l.address, l.city, l.phone].filter(Boolean).join(" · ") || "No address on file"}
                  </p>
                </div>
                <Badge variant="neutral">{l.timezone}</Badge>
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
        message: res.emailFailed
          ? "Added — but the invite email failed. Copy the link and send it to them yourself."
          : "Added — the email was not sent (email is off outside production). Copy the invite link to share it.",
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
            <Button loading={busy} onClick={() => void submit()}>Send invite</Button>
          </>
        )
      }
    >
      {done ? (
        <div className="flex flex-col gap-3">
          <p role="status" className="text-meta text-foreground">{done.message}</p>
          {done.inviteUrl && (
            <div className="flex items-center gap-2">
              <label htmlFor="invite-url" className="sr-only">Invite link</label>
              <Input id="invite-url" readOnly value={done.inviteUrl} onFocus={(e) => e.currentTarget.select()} />
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
            {(p) => <Input {...p} value={fullName} onChange={(e) => setFullName(e.target.value)} autoComplete="off" />}
          </Field>
          <Field label="Email" required>
            {(p) => (
              <Input
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
              <NativeSelect {...p} value={role} onChange={(e) => setRole(e.target.value as InvitableRole)}>
                {INVITABLE_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABEL[r]}
                  </option>
                ))}
              </NativeSelect>
            )}
          </Field>
        </div>
      )}
    </Modal>
  )
}

const SHORT_DAY: Record<number, string> = { 0: "Sun", 1: "Mon", 2: "Tue", 3: "Wed", 4: "Thu", 5: "Fri", 6: "Sat" }

/** "Mon 09:00–17:00 · Tue 09:00–12:00, 13:00–17:00", or why nobody can book them. */
function hoursSummary(rows: HoursRow[]): string {
  if (rows.length === 0) return "No weekly hours — owners can't book them online."
  return WEEKDAY_ORDER.filter((d) => rows.some((r) => r.weekday === d))
    .map(
      (d) =>
        `${SHORT_DAY[d]} ${rows
          .filter((r) => r.weekday === d)
          .map((r) => `${r.start}–${r.end}`)
          .join(", ")}`,
    )
    .join(" · ")
}

/**
 * One clinician's week. Each day holds zero or more sessions; saving replaces
 * all of their staff_availability rows. Slots for online booking are cut from
 * exactly these sessions (clinic_available_slots).
 */
function HoursModal({
  businessId, member, initial, onClose, onSaved,
}: {
  businessId: string
  member: ClinicStaffMember
  initial: HoursRow[]
  onClose: () => void
  onSaved: () => void
}) {
  const [rows, setRows] = useState<HoursRow[]>(initial)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const update = (i: number, patch: Partial<HoursRow>) =>
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)))

  async function save() {
    const checked = validateHours(rows)
    if (!checked.ok) return setError(checked.error)
    setError(null)
    setBusy(true)
    const res = await replaceStaffHours(businessId, member.id, rows)
    setBusy(false)
    if (res.error) return setError(res.error)
    onSaved()
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`${member.name}'s weekly hours`}
      description="Owners booking online are offered times inside these hours. Use a 24-hour clock."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button loading={busy} onClick={() => void save()}>Save hours</Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        {WEEKDAY_ORDER.map((day) => {
          const sessions = rows.map((r, i) => ({ r, i })).filter(({ r }) => r.weekday === day)
          const next = nextSession(day, sessions.map(({ r }) => r))
          return (
            <fieldset key={day} className="rounded-xl border border-border p-2.5">
              <legend className="px-1 text-caption font-semibold text-foreground">{WEEKDAY_LABEL[day]}</legend>
              {sessions.length === 0 && <p className="text-caption text-muted-foreground">Not working</p>}
              <ul className="flex flex-col gap-1.5">
                {sessions.map(({ r, i }) => (
                  <li key={i} className="flex flex-wrap items-center gap-2">
                    <label className="sr-only" htmlFor={`start-${day}-${i}`}>{WEEKDAY_LABEL[day]} start</label>
                    <Input
                      id={`start-${day}-${i}`}
                      type="time"
                      step={300}
                      value={r.start}
                      onChange={(e) => update(i, { start: e.target.value })}
                      className="w-32"
                    />
                    <span className="text-caption text-muted-foreground">to</span>
                    <label className="sr-only" htmlFor={`end-${day}-${i}`}>{WEEKDAY_LABEL[day]} end</label>
                    <Input
                      id={`end-${day}-${i}`}
                      type="time"
                      step={300}
                      value={r.end}
                      onChange={(e) => update(i, { end: e.target.value })}
                      className="w-32"
                    />
                    <Button
                      size="sm"
                      variant="quiet"
                      aria-label={`Remove ${WEEKDAY_LABEL[day]} ${r.start}–${r.end}`}
                      onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}
                    >
                      <X className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  </li>
                ))}
              </ul>
              <Button
                size="sm"
                variant="quiet"
                className="mt-1"
                // No room left in the day (or a time half-typed): nothing valid to add.
                disabled={next === null}
                onClick={() => {
                  if (next) setRows((rs) => [...rs, next])
                }}
              >
                <Plus className="h-3.5 w-3.5" aria-hidden="true" /> Add hours
              </Button>
            </fieldset>
          )
        })}
        {error && <ErrorText className="text-caption font-medium">{error}</ErrorText>}
      </div>
    </Modal>
  )
}

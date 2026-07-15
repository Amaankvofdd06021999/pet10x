"use client"

import { useMemo, useState } from "react"
import { toast } from "sonner"
import { useAuth } from "@/lib/auth-context"
import { usePortfolioTeam, inviteCoManager, removeCoManager, type CoManager } from "@/lib/data/portfolio"
import { useStrata } from "./portal-context"
import { SectionCard, Spinner, LoadError } from "./strata-ui"
import { Users, Mail, Loader2, UserMinus, ShieldCheck, Building2 } from "lucide-react"

export function TeamScreen() {
  const { user } = useAuth()
  const { buildings } = useStrata()
  const { data: team, isLoading, error, refetch } = usePortfolioTeam()

  const byBuilding = useMemo(() => {
    const m = new Map<string, CoManager[]>()
    for (const t of team) {
      const arr = m.get(t.buildingId) ?? []
      arr.push(t)
      m.set(t.buildingId, arr)
    }
    return m
  }, [team])

  if (isLoading) return <Spinner />
  if (error) return <LoadError message={error} onRetry={refetch} />

  return (
    <div className="space-y-4">
      <p className="text-[13px] text-muted-foreground">
        Managers per building. As a <strong className="text-foreground">primary</strong> manager you can invite a
        co-manager or remove one — scoped to that building only.
      </p>
      {buildings.map((b) => (
        <BuildingTeam
          key={b.id}
          buildingId={b.id}
          buildingName={b.name}
          isPrimary={b.isPrimary}
          members={byBuilding.get(b.id) ?? []}
          myId={user?.id ?? ""}
          onChange={refetch}
        />
      ))}
    </div>
  )
}

function BuildingTeam({
  buildingId,
  buildingName,
  isPrimary,
  members,
  myId,
  onChange,
}: {
  buildingId: string
  buildingName: string
  isPrimary: boolean
  members: CoManager[]
  myId: string
  onChange: () => void
}) {
  const [email, setEmail] = useState("")
  const [name, setName] = useState("")
  const [busy, setBusy] = useState(false)
  const [removing, setRemoving] = useState<string | null>(null)

  async function invite() {
    if (!email.trim()) return toast.error("Enter the manager's email.")
    setBusy(true)
    const res = await inviteCoManager({ buildingId, buildingName, email: email.trim(), fullName: name.trim() || undefined })
    setBusy(false)
    if (res.error) return toast.error("Invite failed", { description: res.error })
    if (res.emailSent === false && res.inviteUrl) {
      const url = res.inviteUrl
      toast.success("Manager added — email not sent", {
        description: "Email is disabled outside production. Copy the invite link to share it.",
        duration: 15000,
        action: { label: "Copy link", onClick: () => void navigator.clipboard.writeText(url) },
      })
    } else {
      toast.success("Co-manager invited", { description: `Invite sent to ${email.trim()}` })
    }
    setEmail("")
    setName("")
    onChange()
  }

  async function remove(m: CoManager) {
    if (!confirm(`Remove ${m.name} as a manager of ${buildingName}? Their account stays active.`)) return
    setRemoving(m.linkId)
    const { error } = await removeCoManager(m.linkId)
    setRemoving(null)
    if (error) return toast.error("Couldn't remove", { description: error })
    toast.success("Manager removed from building")
    onChange()
  }

  return (
    <SectionCard
      title={
        <div className="flex items-center gap-2">
          <Building2 className="h-4 w-4 text-info" />
          <span className="text-[14px] font-semibold text-foreground">{buildingName}</span>
          {isPrimary && (
            <span className="rounded-full bg-info/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-info">
              You&apos;re primary
            </span>
          )}
        </div>
      }
    >
      <div className="space-y-2">
        {members.map((m) => {
          const isSelf = m.profileId === myId
          const canRemove = isPrimary && !isSelf && members.length > 1
          return (
            <div key={m.linkId} className="flex items-center gap-3 rounded-lg border border-border bg-card p-3">
              <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-info/15 text-[13px] font-semibold text-info">
                {m.name.slice(0, 1)}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate text-[13.5px] font-semibold text-foreground">{m.name}</p>
                  {m.isPrimary && (
                    <span className="rounded-full bg-muted px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Primary
                    </span>
                  )}
                  {isSelf && <span className="text-[10.5px] text-muted-foreground">(you)</span>}
                </div>
                <p className="truncate text-[12px] text-muted-foreground">{m.email}</p>
              </div>
              {canRemove ? (
                <button
                  onClick={() => remove(m)}
                  disabled={removing === m.linkId}
                  className="flex items-center gap-1 rounded-lg bg-muted px-2.5 py-1.5 text-[12px] font-semibold text-muted-foreground disabled:opacity-50"
                >
                  {removing === m.linkId ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserMinus className="h-3.5 w-3.5" />}
                </button>
              ) : null}
            </div>
          )
        })}
        {members.length === 0 && (
          <p className="py-2 text-center text-[12.5px] text-muted-foreground">No managers on record.</p>
        )}
      </div>

      {isPrimary ? (
        <div className="mt-3 flex flex-col gap-2 border-t border-border pt-3 sm:flex-row">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name (optional)"
            className="min-w-0 flex-1 rounded-lg border border-border bg-background px-3 py-2 text-[13px] focus:border-info focus:outline-none"
          />
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="co-manager@email.com"
            autoCapitalize="none"
            className="min-w-0 flex-1 rounded-lg border border-border bg-background px-3 py-2 text-[13px] focus:border-info focus:outline-none"
          />
          <button
            onClick={invite}
            disabled={busy}
            className="flex items-center justify-center gap-1.5 rounded-lg bg-info px-3.5 py-2 text-[13px] font-semibold text-info-foreground disabled:opacity-60"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />} Invite
          </button>
        </div>
      ) : (
        <p className="mt-3 flex items-center gap-1.5 border-t border-border pt-3 text-[12px] text-muted-foreground">
          <ShieldCheck className="h-3.5 w-3.5" /> Only a primary manager of this building can change its team.
        </p>
      )}
    </SectionCard>
  )
}

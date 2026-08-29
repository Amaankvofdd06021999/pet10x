"use client"

import { useState } from "react"
import { Phone, RefreshCw, BellRing, Clock, Check, X } from "lucide-react"
import type { ClinicMembership } from "@/lib/data/clinic/context"
import { capabilities } from "@/lib/data/clinic/context"
import {
  useReminderQueue, useReminderRules, generateReminders, actOnReminder, saveReminderRule,
  type ReminderItem,
} from "@/lib/data/clinic/reminders"
import { dueLabel, daysUntil, formatDateShort } from "@/lib/data/clinic/time"
import {
  SectionCard, Spinner, LoadError, EmptyState, Button, Pill, Modal,
  Field, TextInput, Select, SegmentedTabs, Toolbar, StatTile, LinkedBadge,
} from "@/components/screens/shared/ui"

type View = "due" | "sent" | "rules"

/**
 * The call list. A receptionist with twenty minutes opens one queue, most
 * overdue first, with the phone number right there.
 */
export function ClinicRemindersScreen({ clinic }: { clinic: ClinicMembership }) {
  const [view, setView] = useState<View>("due")
  const queue = useReminderQueue(clinic.businessId, view === "due" ? ["pending", "snoozed"] : ["sent", "booked", "done"])
  const rules = useReminderRules(clinic.businessId)
  const [busy, setBusy] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)
  const [ruleOpen, setRuleOpen] = useState(false)
  const caps = capabilities(clinic.role, clinic.tier, clinic.isOwner)

  const overdue = queue.data.filter((r) => (daysUntil(r.dueOn) ?? 0) < 0).length
  const linked = queue.data.filter((r) => r.isLinked).length

  async function act(item: ReminderItem, action: Parameters<typeof actOnReminder>[1], note?: string, days?: number) {
    setBusy(item.id)
    const res = await actOnReminder(item.id, action, note, days)
    setBusy(null)
    if (res.error) window.alert(res.error)
    else queue.refetch()
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="In the queue" value={queue.data.length} />
        <StatTile label="Overdue" value={overdue} tone={overdue ? "bad" : "good"} />
        <StatTile label="Reachable in-app" value={linked} tone="accent" hint="free, one tap to book" />
        <StatTile label="Rules" value={rules.data.filter((r) => r.isActive).length} />
      </div>

      <Toolbar>
        <SegmentedTabs
          label="Reminder views"
          active={view}
          onChange={setView}
          tabs={[
            { id: "due", label: "Due", count: view === "due" ? queue.data.length : undefined },
            { id: "sent", label: "Handled" },
            { id: "rules", label: "Rules", count: rules.data.length },
          ]}
        />
        <div className="ml-auto flex gap-2">
          <Button
            size="sm"
            variant="secondary"
            busy={generating}
            onClick={async () => {
              setGenerating(true)
              const res = await generateReminders(clinic.businessId)
              setGenerating(false)
              if (res.error) window.alert(res.error)
              else queue.refetch()
            }}
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" /> Rebuild queue
          </Button>
          {view === "rules" && (
            <Button size="sm" onClick={() => setRuleOpen(true)}>
              New rule
            </Button>
          )}
        </div>
      </Toolbar>

      {view === "rules" ? (
        <SectionCard title="Rules" subtitle="What creates a reminder, and how far ahead">
          {rules.isLoading ? (
            <Spinner />
          ) : rules.data.length === 0 ? (
            <EmptyState title="No rules yet" detail="A rule turns a due date into something on the call list." />
          ) : (
            <ul className="flex flex-col gap-2">
              {rules.data.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border p-3">
                  <div>
                    <p className="text-[13.5px] font-semibold text-foreground">{r.name}</p>
                    <p className="text-[12px] text-muted-foreground">
                      {r.triggerKind.replace(/_/g, " ")} · {r.leadDays} days ahead · via {r.channel}
                    </p>
                  </div>
                  <Pill tone={r.isActive ? "good" : "neutral"}>{r.isActive ? "Active" : "Off"}</Pill>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      ) : queue.isLoading ? (
        <Spinner label="Building the call list" />
      ) : queue.error ? (
        <LoadError message={queue.error} onRetry={queue.refetch} />
      ) : queue.data.length === 0 ? (
        <EmptyState
          title={view === "due" ? "Nobody to chase" : "Nothing handled yet"}
          detail={view === "due" ? "Rebuild the queue after recording vaccinations or follow-ups." : undefined}
          icon={<BellRing className="h-5 w-5" aria-hidden="true" />}
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {queue.data.map((r) => {
            const late = (daysUntil(r.dueOn) ?? 0) < 0
            return (
              <li key={r.id} className="rounded-2xl border border-border bg-card p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 text-[14px] font-semibold text-foreground">
                      {r.patientName} · {r.label}
                      <LinkedBadge linked={r.isLinked} />
                      {!r.serviceReminders && <Pill tone="warn">Opted out</Pill>}
                    </p>
                    <p className="text-[12.5px] text-muted-foreground">
                      {r.customerName}
                      {r.customerPhone ? ` · ${r.customerPhone}` : " · no phone on file"}
                    </p>
                    <p className={`mt-0.5 text-[12px] font-medium ${late ? "text-destructive" : "text-muted-foreground"}`}>
                      {dueLabel(r.dueOn)} ({formatDateShort(r.dueOn)})
                      {r.snoozedUntil ? ` · snoozed to ${formatDateShort(r.snoozedUntil)}` : ""}
                    </p>
                    {r.note && <p className="mt-1 text-[12px] text-muted-foreground">{r.note}</p>}
                  </div>
                  {view === "due" && caps.workReminders && (
                    <div className="flex flex-wrap items-center gap-1.5">
                      {r.customerPhone && (
                        <a
                          href={`tel:${r.customerPhone.replace(/[^\d+]/g, "")}`}
                          onClick={() => void act(r, "log_call", "Called from the queue")}
                          className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-2.5 py-1.5 text-[12.5px] font-semibold text-primary-foreground"
                        >
                          <Phone className="h-3.5 w-3.5" aria-hidden="true" /> Call
                        </a>
                      )}
                      {r.isLinked && (
                        <Button size="sm" variant="secondary" busy={busy === r.id} onClick={() => void act(r, "notify")}>
                          <BellRing className="h-3.5 w-3.5" aria-hidden="true" /> Notify
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" onClick={() => void act(r, "snooze", undefined, 7)}>
                        <Clock className="h-3.5 w-3.5" aria-hidden="true" /> Snooze
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => void act(r, "booked")}>
                        <Check className="h-3.5 w-3.5" aria-hidden="true" /> Booked
                      </Button>
                      <Button size="sm" variant="ghost" aria-label="Suppress this reminder" onClick={() => void act(r, "suppress")}>
                        <X className="h-3.5 w-3.5" aria-hidden="true" />
                      </Button>
                    </div>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}

      <RuleModal
        open={ruleOpen}
        onClose={() => setRuleOpen(false)}
        businessId={clinic.businessId}
        onSaved={() => {
          setRuleOpen(false)
          rules.refetch()
        }}
      />
    </div>
  )
}

function RuleModal({
  open, onClose, businessId, onSaved,
}: {
  open: boolean
  onClose: () => void
  businessId: string
  onSaved: () => void
}) {
  const [f, setF] = useState({ name: "", triggerKind: "vaccination_due", leadDays: 30, channel: "app" })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New reminder rule"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button
            busy={busy}
            onClick={async () => {
              setBusy(true)
              setError(null)
              const res = await saveReminderRule({ businessId, isActive: true, ...f })
              setBusy(false)
              if (res.error) setError(res.error)
              else onSaved()
            }}
          >
            Save
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <Field label="Name" required error={error}>
          {(p) => <TextInput {...p} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Annual booster" />}
        </Field>
        <Field label="Triggered by">
          {(p) => (
            <Select {...p} value={f.triggerKind} onChange={(e) => setF({ ...f, triggerKind: e.target.value })}>
              <option value="vaccination_due">A vaccination coming due</option>
              <option value="visit_follow_up">A follow-up a visit asked for</option>
              <option value="annual_check">Annual check</option>
              <option value="lapsed_customer">A customer who has not been in</option>
            </Select>
          )}
        </Field>
        <Field label="How many days ahead" hint="How early it appears in the queue.">
          {(p) => (
            <TextInput
              {...p}
              type="number"
              min={0}
              max={365}
              value={String(f.leadDays)}
              onChange={(e) => setF({ ...f, leadDays: Number(e.target.value) })}
            />
          )}
        </Field>
        <Field label="Default channel">
          {(p) => (
            <Select {...p} value={f.channel} onChange={(e) => setF({ ...f, channel: e.target.value })}>
              <option value="app">In-app notification</option>
              <option value="call">Call list</option>
              <option value="email">Email</option>
              <option value="sms">SMS</option>
            </Select>
          )}
        </Field>
      </div>
    </Modal>
  )
}

"use client"

import { useState } from "react"
import { Check, Clock, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { PetAvatar } from "@/components/screens/home/pet-avatar"
import {
  useHouseholdCareTasks,
  setCareTaskDone,
  taskRunsOn,
  groupHouseholdTasks,
  formatTime,
  type HouseholdTaskGroup,
  type Pet,
  type ScheduledCareTask,
} from "@/lib/data"

/**
 * Today's scheduled tasks, on the home screen — for the WHOLE household.
 *
 * It used to take one pet id, and Home gave it `pets[0]`, the oldest pet. 71%
 * of owners keep two or three animals, so for most of them this strip was
 * quietly showing a third or a half of the morning, with the rest — Lola's
 * thyroid tablet included — not merely unticked but absent.
 *
 * Shows only what is still outstanding: a plan you have already completed is
 * not information, and a list that never shrinks stops being read. Once
 * everything is ticked the strip collapses to a single line.
 *
 * Overdue is judged against the device clock. The server sweep makes the same
 * judgement in the owner's stored timezone, so a task that reads "overdue"
 * here is the one that raised the notification.
 *
 * EVERY COMPOSED STRING IN THIS FILE IS BUILT IN JS, NOT IN JSX. That is how
 * this project shipped "firstfine", "1 finewhose" and "Log Mochi'sactivities"
 * past a clean build five times, and the practice is right — but the reason
 * first recorded for it was wrong, and this is the corrected one (measured
 * 2026-08-23 against this repo's own toolchain; `scripts/jsx-space-drift.mjs`
 * has the bisection):
 *
 *   `{a} text`, all on ONE line, keeps its space in tsc AND in SWC. It is not
 *   true that SWC trims the whitespace around an expression. Two rules bite,
 *   and neither is that one:
 *
 *     1. JSX strips leading whitespace that spans a NEWLINE, so `{a}` ending a
 *        line and text beginning the next loses the space between them. This
 *        is ordinary JSX and is identical in tsc, SWC and Babel.
 *     2. SWC ONLY: a JSXText node containing an HTML ENTITY loses its leading
 *        whitespace even on the same line, where rule 1 does not apply and
 *        every quotable rule says it survives.
 *            `Log {name} activities & meals`    -> both keep the space
 *            `Log {name} activities &amp; meals` -> SWC drops it, tsc keeps it
 *        This one produced every defect actually observed here, because this
 *        codebase writes `&apos;` and `&amp;` in almost every sentence. `tsc
 *        --noEmit` emits the correct string, so nothing local can see it.
 *
 * A template literal is one expression and produces no JSXText node, so
 * neither rule can reach it. The mitigation was always sound; only the
 * explanation needed fixing.
 */

/** Groups shown before the strip starts counting instead of listing. */
const MAX_GROUPS = 4

/* The rule that separates the household schedule from one pet's goals lives
   HERE and not in the card, because only this component knows whether there is
   a schedule at all. Rendered by the card, it would draw a hairline under
   nothing on any day a household has no tasks — and on every empty account. */
const SHELL = "mt-3 border-b border-border pb-4"

export function TodayScheduleStrip({
  pets,
  onOpenPet,
}: {
  pets: Pet[]
  /** Open this pet's tracker. Given only the LABEL is a hit target for it —
   *  a tick that also navigated would throw you off Home every time you fed
   *  the dog. */
  onOpenPet?: (petId: string) => void
}) {
  const { data: tasks, isLoading, refetch } = useHouseholdCareTasks(pets.map((p) => p.id))
  const [busyId, setBusyId] = useState<string | null>(null)

  const now = new Date()
  const nowMinutes = now.getHours() * 60 + now.getMinutes()
  const todays = tasks.filter((t) => taskRunsOn(t, now))
  const multiPet = pets.length > 1

  const byId = new Map(pets.map((p) => [p.id, p]))

  if (isLoading || todays.length === 0) return null

  const outstanding = todays.filter((t) => !t.doneToday)

  async function toggle(t: ScheduledCareTask) {
    setBusyId(t.id)
    const { error } = await setCareTaskDone(t.id, true)
    setBusyId(null)
    if (error) return toast.error("Couldn't update", { description: error })
    // A tick is a claim about ONE animal, so the confirmation says which — in
    // a household where that is a question worth answering.
    const pet = byId.get(t.petId)
    toast.success(multiPet && pet ? `${t.label} done · ${pet.name}` : `${t.label} done`)
    refetch()
  }

  if (outstanding.length === 0) {
    // Counts the household, but does not list it: naming three pets here is
    // the one place a wall of names buys nothing.
    return (
      <div className={SHELL}>
        <div className="flex items-center gap-2 rounded-xl bg-success/10 px-3 py-2.5">
          <Check className="h-4 w-4 flex-shrink-0 text-success" strokeWidth={3} />
          <span className="text-[12px] font-semibold text-success">
            {`All ${todays.length} scheduled ${todays.length === 1 ? "task" : "tasks"} done today`}
          </span>
        </div>
      </div>
    )
  }

  const groups = groupHouseholdTasks(outstanding, pets.map((p) => p.id), nowMinutes)
  const shown = groups.slice(0, MAX_GROUPS)
  // The overflow line keeps counting TASKS, as it always has — "+2 more"
  // meaning two things left to do, not two headers left to read.
  const remaining = outstanding.length - shown.reduce((n, g) => n + g.tasks.length, 0)

  /* A plain function, not a nested component: declaring one inside the render
     body gives it a new type on every render, so React unmounts and remounts
     the button and the tick loses focus mid-interaction. */
  const renderTick = (task: ScheduledCareTask) => {
    const pet = byId.get(task.petId)
    return (
      <button
        onClick={() => toggle(task)}
        disabled={busyId === task.id}
        /* Named per pet even in a one-pet home. Without it a screen reader in
           Isabella's household hears "Mark Breakfast done" three times with no
           way to tell them apart — a defect this fix would have CREATED. */
        aria-label={pet ? `Mark ${task.label} done for ${pet.name}` : `Mark ${task.label} done`}
        className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full border-2 border-border text-transparent transition-colors active:border-success active:bg-success active:text-primary-foreground"
      >
        {busyId === task.id ? (
          <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
        ) : (
          <Check className="h-3 w-3" strokeWidth={3} />
        )}
      </button>
    )
  }

  return (
    <div className={`${SHELL} flex flex-col gap-1.5`}>
      {shown.map((group) => (
        <div
          key={group.key}
          className={`rounded-xl ${group.overdue ? "bg-destructive/10" : "bg-muted/60"}`}
        >
          {!multiPet || group.tasks.length === 1 ? (
            group.tasks.map((t) => (
              <SingleRow
                key={t.id}
                task={t}
                pet={multiPet ? byId.get(t.petId) : undefined}
                /* The row shows no name in a one-pet home, but the control
                   still knows whose tracker it opens. */
                petName={byId.get(t.petId)?.name}
                overdue={group.overdue}
                tick={renderTick(t)}
                onOpenPet={onOpenPet}
              />
            ))
          ) : (
            <GroupRows group={group} byId={byId} renderTick={renderTick} onOpenPet={onOpenPet} />
          )}
        </div>
      ))}
      {remaining > 0 && (
        <p className="px-1 text-[11px] text-muted-foreground">{`+${remaining} more in the schedule`}</p>
      )}
    </div>
  )
}

/**
 * A task no other pet shares — and every task in a single-pet household.
 *
 * With `pet` undefined this is byte-for-byte the row this strip has always
 * rendered: clock, label, time, tick. 8 of 28 households see only this, and it
 * is the regression risk in the whole phase.
 */
function SingleRow({
  task,
  pet,
  petName,
  overdue,
  tick,
  onOpenPet,
}: {
  task: ScheduledCareTask
  /** Set only when the row should SHOW the pet — i.e. a multi-pet household. */
  pet?: Pet
  /** Always set when the pet is known, shown or not. */
  petName?: string
  overdue: boolean
  tick: React.ReactNode
  onOpenPet?: (petId: string) => void
}) {
  return (
    <div className="flex items-center gap-2.5 px-3 py-2">
      {pet ? (
        <PetAvatar pet={pet} />
      ) : (
        <Clock className={`h-3.5 w-3.5 flex-shrink-0 ${overdue ? "text-destructive" : "text-muted-foreground"}`} />
      )}
      <RowLabel
        text={pet ? `${pet.name} · ${task.label}` : task.label}
        petId={task.petId}
        petName={petName}
        onOpenPet={onOpenPet}
      />
      <span
        className={`flex-shrink-0 text-[11px] font-semibold ${overdue ? "text-destructive" : "text-muted-foreground"}`}
      >
        {task.scheduledAt ? formatTime(task.scheduledAt) : "All day"}
      </span>
      {tick}
    </div>
  )
}

/**
 * Two or more pets due the same thing at the same moment.
 *
 * The label is written once as a header and each animal gets its own row, so
 * the whole content of a row is the part that differs. Prefixing every row
 * with its pet instead would repeat the label — the part that is identical —
 * and bury the name.
 *
 * The tick stays one write per row. Collapsing a group into a single tick that
 * marks every pet was considered and rejected: setCareTaskDone also writes a
 * care_entries row when the task links a target, so a two-pet tick is two
 * multi-statement writes, and a half-failure leaves the screen unable to say
 * which cat was fed.
 */
function GroupRows({
  group,
  byId,
  renderTick,
  onOpenPet,
}: {
  group: HouseholdTaskGroup
  byId: Map<string, Pet>
  renderTick: (task: ScheduledCareTask) => React.ReactNode
  onOpenPet?: (petId: string) => void
}) {
  const time = group.scheduledAt ? formatTime(group.scheduledAt) : "All day"
  return (
    <>
      <div className="flex items-center gap-2.5 px-3 pb-0.5 pt-2">
        <Clock
          className={`h-3.5 w-3.5 flex-shrink-0 ${group.overdue ? "text-destructive" : "text-muted-foreground"}`}
        />
        <span
          className={`min-w-0 flex-1 truncate text-[12px] font-semibold ${
            group.overdue ? "text-destructive" : "text-muted-foreground"
          }`}
        >
          {`${group.label} · ${time}`}
        </span>
      </div>
      {group.tasks.map((task) => {
        const pet = byId.get(task.petId)
        return (
          <div key={task.id} className="flex items-center gap-2.5 py-1 pl-8 pr-3 last:pb-2">
            {pet && <PetAvatar pet={pet} />}
            <RowLabel
              text={pet?.name ?? task.label}
              petId={task.petId}
              petName={pet?.name}
              onOpenPet={onOpenPet}
            />
            {renderTick(task)}
          </div>
        )
      })}
    </>
  )
}

/**
 * The part of a row you can tap to open that pet.
 *
 * Deliberately a SEPARATE hit target from the tick beside it. Marking
 * Breakfast done and going to look at Lola's chart are different intentions,
 * and a row where either tap navigated would throw you off Home every morning.
 *
 * Falls back to plain text when there is nowhere to go, so a control that
 * cannot act never exists.
 */
function RowLabel({
  text,
  petId,
  petName,
  onOpenPet,
}: {
  text: string
  petId: string
  petName?: string
  onOpenPet?: (petId: string) => void
}) {
  const className = "min-w-0 flex-1 truncate text-left text-[12px] font-semibold text-foreground"
  if (!onOpenPet) return <span className={className}>{text}</span>
  return (
    <button
      onClick={() => onOpenPet(petId)}
      aria-label={petName ? `Open ${petName}'s tracker` : `Open ${text} in the tracker`}
      className={className}
    >
      {text}
    </button>
  )
}

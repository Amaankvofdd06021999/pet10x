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
 * EVERY COMPOSED STRING IN THIS FILE IS BUILT IN JS, NOT IN JSX. `{a} · {b}`
 * across a line break is how this project has shipped "firstfine", "1 finewhose"
 * and "Log Mochi'sactivities" past a clean build five times: SWC trims the
 * whitespace of a JSXText node even when the source has it. A template literal
 * is one expression and has nothing to trim.
 */

/** Groups shown before the strip starts counting instead of listing. */
const MAX_GROUPS = 4

/* The rule that separates the household schedule from one pet's goals lives
   HERE and not in the card, because only this component knows whether there is
   a schedule at all. Rendered by the card, it would draw a hairline under
   nothing on any day a household has no tasks — and on every empty account. */
const SHELL = "mt-3 border-b border-border pb-4"

export function TodayScheduleStrip({ pets }: { pets: Pet[] }) {
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
                overdue={group.overdue}
                tick={renderTick(t)}
              />
            ))
          ) : (
            <GroupRows group={group} byId={byId} renderTick={renderTick} />
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
  overdue,
  tick,
}: {
  task: ScheduledCareTask
  pet?: Pet
  overdue: boolean
  tick: React.ReactNode
}) {
  return (
    <div className="flex items-center gap-2.5 px-3 py-2">
      {pet ? (
        <PetAvatar pet={pet} />
      ) : (
        <Clock className={`h-3.5 w-3.5 flex-shrink-0 ${overdue ? "text-destructive" : "text-muted-foreground"}`} />
      )}
      <span className="min-w-0 flex-1 truncate text-[12px] font-semibold text-foreground">
        {pet ? `${pet.name} · ${task.label}` : task.label}
      </span>
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
}: {
  group: HouseholdTaskGroup
  byId: Map<string, Pet>
  renderTick: (task: ScheduledCareTask) => React.ReactNode
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
            <span className="min-w-0 flex-1 truncate text-[12px] font-semibold text-foreground">
              {pet?.name ?? task.label}
            </span>
            {renderTick(task)}
          </div>
        )
      })}
    </>
  )
}

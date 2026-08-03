# Pet care: targets, logs, schedules and reminders

## What was wrong

Four limits, each blocking something owners actually do.

| | |
| --- | --- |
| `care_targets` had `UNIQUE (pet_id, kind)` | **One** target per kind. A dog on two medications could set a goal for one; the second silently replaced it. Capping dental chews *and* training treats separately was impossible. |
| Units were hardcoded in the UI | `food = "cups"` for every animal. A cat is fed in cans, a fish in pinches. |
| `pet_care_tasks` was `TIME` + `days_of_week` | Daily and weekly only. No monthly flea treatment, no six-month heartworm course, no annual booster, and no way for a finite course to end. |
| `pet_vaccinations.expires_on` was never read | 49 rows with expiry dates and nothing that ever looked at them. |

## Species decides the vocabulary

`lib/data/care-catalog.ts` answers "what does care mean for this animal" —
which kinds exist and what units they use.

| Species | Kinds offered |
| --- | --- |
| Dog | Food · Water · Treats · Medicine · **Walks** · **Outings** · Potty · Weight |
| Cat | Food · Water · Treats · Medicine · **Playtime** · **Outdoors** · Potty · Weight |
| Bird | Food · Water · Treats · Medicine · Out of cage · Weight |
| Small mammal | Food · Water · Treats · Medicine · Exercise · Weight |
| Reptile | Food · Water · Medicine · Weight |
| Fish | Food · Medicine |

Units follow the same logic — dog food in **bowls** first, cat food in **cans**
first, both offering grams; walks in **times** before minutes and km, because
an owner reliably knows how many walks and estimates the rest.

`care_entry_kind` gained `play` and `outing`. "Walk" is a dog's word; logging a
cat's afternoon as a walk was previously the only option.

Units stay free text in the database on purpose. The catalogue decides what the
UI *offers*; a value recorded last year still means what it said after the list
changes. `unitById` falls back to the stored string so nothing is silently
reinterpreted.

## Targets are a list

`UNIQUE (pet_id, kind)` is gone. A target now carries a `label`, a `period`
(`day` | `week`), `sort_order` and `is_active`, and uniqueness is
`(pet_id, kind, lower(btrim(label)))` — so several coexist but a double-tap
cannot create "Heartgard" twice.

Kinds marked `multi` in the catalogue (medicine, treats) show an add-more list;
the rest edit in place. Progress is computed **per target**, matching entries by
label: summing two medications into "3 of 4 doses" would say nothing about
whether either was actually given.

## Long courses and interval reminders

`pet_care_tasks` gained a named recurrence rather than an overloaded one:

```
daily      scheduled_at + days_of_week          meals, walks
interval   every interval_days from next_due_on flea = 30, heartworm = 182
```

plus `starts_on` / `ends_on` (a six-month course retires itself), and `dose` as
free text — dosing is not a number we should reinterpret.

Two check constraints reject shapes that would silently never fire: an
`interval` task without both `interval_days` and `next_due_on`, and `ends_on`
before `starts_on`.

The sweep advances `next_due_on` only **after** the ledger row is safely
written, so a failure leaves the dose due rather than skipping it. Past
`ends_on` the task deactivates itself.

## Vaccination, booster and injection reminders

`pet_vaccinations` gained `kind` (`vaccine` | `booster` | `injection` |
`treatment`), `remind_days_before` (default 30) and `reminded_for`.

`reminded_for` stores the **expiry date** last reminded about, not a boolean —
so renewing re-arms the reminder automatically.

Compliance matches on *name* (rabies, core vaccines), so recording an injection
or a treatment never moves a compliance percentage.

**A 60-day floor on overdue reminders.** On production the day this shipped, 9
of the 10 rows inside the notification window had lapsed 46–207 days earlier.
A reminder is for the transition; a long-lapsed vaccination is already surfaced
continuously by `computeCompliance`, the manager's Incomplete filter and the
resident's missing-info card. It does not also need a notification about last
spring. `MAX_OVERDUE_DAYS` in the sweep.

## Verified against production

- Two medicine targets on one pet — previously impossible. ✓
- `"  heartgard "` rejected as a duplicate of `Heartgard`. ✓
- Cat entries stored in `can` / `min` under the new `play` and `outing` kinds. ✓
- Six-month interval course created; sweep raised it and advanced
  `2026-08-03 → 2026-09-02`, still active, ends 2027-02-01. ✓
- Malformed tasks (interval with no interval; `ends_on` before `starts_on`)
  rejected — 0 stored. ✓
- Sweep: `{checked: 3, due: 1, raised: 1, vaccinesChecked: 49, vaccineReminders: 7}`
  — the 3 rows more than 60 days overdue correctly skipped. ✓
- Browser: dog shows Walks/Outings, cat shows Playtime/Outdoors, fish shows
  only Food and Medicine. ✓

All probe rows removed: 41 users, 46 pets, 9 targets, 6 entries, 2 tasks —
the pre-test baseline.

## Known gaps

- `pet_medications` (0 rows) is now redundant with interval care tasks and
  should be retired or merged rather than left as a second place to put a
  medicine.
- Weekly targets (`period = 'week'`) are stored and displayed but progress is
  still computed against the day. Weekly goals need a week-window sum.

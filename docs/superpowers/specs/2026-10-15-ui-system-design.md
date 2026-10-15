# UI system and notification swipe actions — design

Date: 2026-10-15 · Branch: `ui-system` · Status: approved in chat, awaiting spec review

## Intent

The brand looks inconsistent: orange turns brown on buttons and orange text,
the same status colour appears at four or five strengths, a teal second accent
appears at random, and about 490 hand-built buttons sit beside two competing
component sets. Set one palette and one set of UI pieces, move every screen
onto them, and stop new drift with a lint rule. Separately, let people clear
notifications quickly on mobile.

**Success:** no screen shows the brown stops (`#B85A12`, `#A9520F`,
`#A04E0F`) or teal; every button in the app is the shared `Button`; one
component set exists; lint fails on raw colours; a resident can snooze or
delete a notification in two moves on a phone.

Behaviour does not change except the notification actions.

## Decisions (from the brainstorm)

| Question | Decision |
|---|---|
| Button colour | **True orange `#FD9340` with white bold text.** Known trade-off: about 2.2:1 contrast, below WCAG AA; bold text helps a little. One token changes it later. |
| Orange text on white | **Never.** All text is dark (`foreground`) or grey (`muted-foreground`). Orange appears only on buttons, icons, indicators and soft highlights. Links are marked by weight and a chevron. |
| Scope | **Full sweep** — every screen: resident, sign-in, landing, manager, clinic, admin. |
| Teal `#2FBFB8` | **Dropped.** Selected states and icons become orange; tags become info blue. |
| Notification swipe | **Swipe left reveals two buttons, Snooze and Delete** (iPhone Mail style). |

## 1. Palette (tokens in `app/globals.css`)

Light values below; dark mode keeps today's dark ground and defines the same
names.

| Group | Tokens |
|---|---|
| Brand | `--primary #FD9340`, `--primary-hover` (= `color-mix(in oklab, #FD9340, black 8%)`), `--primary-soft #FFF1E6`, `--primary-foreground #FFFFFF` |
| Neutrals | `--background #F8F9FD`, `--card #FFFFFF`, `--foreground #2C2E30`, `--muted-foreground #646569`, `--border #E9EAF2`, `--input #E1E2EC`, `--muted #EDEEF6` |
| Status | `--success #1E9E62` + `--success-soft`, `--warning #F0A81E` + `--warning-soft`, `--destructive #D93A2B` + `--destructive-soft`, `--info #2555C7` + `--info-soft`. Text on any soft background is `foreground`. |
| Charts | `--chart-1..5` = primary, success, info, warning, destructive |
| Focus | `--ring #FD9340` |

Removed: `--primary-strong`, `--primary-strong-hover`, `--primary-text`,
`--accent` (teal), `--warning-strong`, `--success-strong`, and every
opacity variant used as a background (`bg-x/5`, `/10`, `/15`, `/20`) — those
become the `-soft` token. The hard-coded yellows (`#FFF6E0`, `#FFF9E6`,
`#FFFBEF`, `#B38F00`) become `warning-soft` with dark text.

Type scale and radius tokens: `text-caption` 12, `text-meta` 13, `text-body`
15, `text-title` 17, `text-heading` 22 (px); radius `sm` 8, `md` 12, `lg` 16,
`full`. Pieces use these; one-off `text-[13px]` style sizes are replaced
inside any element a batch touches.

`Pet10x_Color_Reference_Card.md` is rewritten to match.

## 2. Shared pieces (`components/ui`)

One set. `components/screens/shared/ui.tsx` is merged in and deleted;
duplicates resolve to one.

| Piece | Variants / rules |
|---|---|
| `Button` | `primary` (orange, white bold) · `secondary` (white, border, dark text) · `quiet` (no fill, dark text) · `danger` (red, white) · `link` (dark bold text + chevron). Sizes `sm`/`md`/`lg`; min height 44px on touch; `loading` and `disabled` built in; `asChild` kept. |
| `Badge` | `neutral` · `brand` · `success` · `warning` · `danger` · `info` — soft background, dark text, optional solid dot. Replaces `Pill`, `LinkedBadge` and hand-rolled pill spans. |
| `Card`, `SectionCard`, `StatTile` | One radius, border and shadow. |
| `Input`, `Textarea`, `Select`, `Field`, `SegmentedTabs` | Merged; orange focus ring. Active tab = dark text + orange indicator. |
| `EmptyState`, `LoadError`, `Skeleton`, `Spinner`, `Dialog`/`Sheet`, `ConfirmDialog` | One each; `Modal` from shared/ui folds into `Dialog`. |
| `SwipeRow` | New — see §4. |

A development-only style guide page (`/styleguide`, 404 in production) shows
every token and piece on one screen for review before screens move.

## 3. The sweep

Batches, each built, reviewed and gated before the next:

1. Tokens, pieces, style guide.
2. Resident screens (Home, pets, care, community, my vets, alerts, profile…).
3. Sign-in, set-password, landing page.
4. Manager screens.
5. Clinic screens.
6. Admin screens, `/report`, and anything left (grep proves zero raw-colour hits).
7. Lint rule on.

Rules for every batch: a styled button becomes `Button`; a pill becomes
`Badge`; orange text becomes dark text (with an orange icon or indicator
where it marked something tappable or active); teal becomes orange or info;
opacity tints become `-soft`. Unstyled `<button>` used as a tappable row may
stay.

**Lint rule** (custom ESLint rule in the repo): in `className` strings and
`cn()` arguments, fail on hex/rgb/hsl literals, Tailwind palette colours
(`orange-500`, `amber-800`, `stone-*`…), removed tokens, and opacity
modifiers on colour utilities, except an explicit allow-list (e.g.
`bg-black/40` for overlays). Positive grammar: the rule lists the allowed
colour utilities.

## 4. Notification swipe actions

**Database** (migration `20261018000001_ui_system.sql`):
- `notifications.snoozed_until timestamptz`, `notifications.dismissed_at timestamptz`.
- `snooze_notification(p_id uuid, p_until timestamptz) returns jsonb` — definer;
  the row must belong to `auth.uid()` (NULL-safe); `p_until` must be in the
  future and within 7 days (22023 otherwise); sets `snoozed_until` and clears
  `read_at` so it returns unread.
- `dismiss_notification(p_id uuid)` and `restore_notification(p_id uuid)` —
  set / clear `dismissed_at` for the caller's own row.
- Every inbox read (Alerts screen, bell count, console inbox, notification
  store) filters `dismissed_at is null and (snoozed_until is null or snoozed_until <= now())`.
- The push/email dispatcher skips dismissed rows; a snoozed row not yet sent
  is sent when it wakes, not before.
- Rows are hidden, never erased, so delivery bookkeeping stays intact and
  Undo works.

**Interaction:**
- Mobile: swipe a row left to reveal **Snooze** and **Delete** (144px). One
  row open at a time; tapping elsewhere or scrolling closes it. Built on
  pointer events, no new library.
- **Snooze** opens a small sheet: **In 1 hour · This evening (6 PM)** (only
  before 5 PM) **· Tomorrow morning (8 AM)**, in the person's timezone
  (`profiles.timezone`, falling back to the device zone).
- **Delete** hides the row and shows a toast "Notification deleted" with
  **Undo** for 5 seconds (calls `restore_notification`).
- Desktop / keyboard: the same two buttons appear on hover and on focus of the
  row; they are real buttons in the DOM, reachable by Tab, with labels.
- Applies to the resident Alerts screen and the manager/clinic console inbox
  (shared `notification-row.tsx`).

## Testing

- Pure helpers with vitest: snooze option list for a given time and zone
  (before/after 5 PM, DST day), swipe threshold decision, lint rule (valid /
  invalid class strings).
- SQL checks in `supabase/tests/part-j.sql`: owner can snooze/dismiss/restore
  own row; stranger gets forbidden; past or >7-day snooze → 22023; inbox
  filter excludes dismissed and sleeping rows.
- Every batch: tests, tsc, lint, build. A grep after each batch for the
  removed tokens and hex literals in the batch's files.
- Manual checks per batch listed in reports (screens to eyeball), plus the
  style guide page.

## Out of scope

Resident billing; layout or flow changes; new illustrations; dark-mode
redesign beyond mapping the same token names.

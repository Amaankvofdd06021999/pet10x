/**
 * Pet10x — Community: the pure half.
 *
 * No React, no Supabase import, no "use client" — so vitest's
 * `environment: "node"` can reach every line of it, which is the only kind of
 * testing this repo has. The hooks and mutations live in `./live`.
 *
 * Everything here replaces string surgery that was being done inline in
 * `components/screens/community-screen.tsx`, where it could not be tested and
 * where each of the four expressions had a silent failure mode:
 *
 *   `event.date.split(", ")[1]?.split(" ")[1]`  -> undefined for any string
 *                                                  without ", " in it
 *   `(attendees / maxAttendees) * 100`          -> Infinity for a null cap,
 *                                                  rendered as `width: Infinity%`
 *   `CATEGORY_COLORS[category]`                 -> undefined, which React then
 *                                                  renders as the LITERAL class
 *                                                  name "undefined"
 *   the share text                              -> did not exist; the button
 *                                                  toasted "Link copied" and
 *                                                  copied nothing
 */

import { parseDbDate } from "@/lib/dates"
import type { LostFoundType, Species } from "./types"

/**
 * The seven category names the screen knows how to colour.
 *
 * `community_posts_category_check` and `events_category_check`
 * (20260826000000) constrain the database to exactly this list. The constraint
 * and `categoryClass`'s fallback below are NOT the same defence and neither
 * replaces the other: the constraint stops a bad value being stored, the
 * fallback stops the screen breaking if this list ever grows ahead of the
 * client.
 */
export const CATEGORY_COLORS: Record<string, string> = {
  General: "bg-muted text-muted-foreground",
  Recommendation: "bg-info/10 text-info",
  Warning: "bg-destructive/10 text-destructive",
  Question: "bg-primary/10 text-primary",
  Social: "bg-primary/10 text-primary",
  Health: "bg-accent/10 text-accent",
  Building: "bg-info/10 text-info",
}

export const POST_CATEGORIES = Object.keys(CATEGORY_COLORS)

/**
 * The badge classes for a category, falling back to General for anything else.
 *
 * `Object.hasOwn`, NOT `CATEGORY_COLORS[category] ?? …`. A plain index into an
 * object literal reaches Object.prototype, so `categoryClass("toString")`
 * returned the FUNCTION `Object.prototype.toString` — `??` does not fire for it,
 * and React renders a function into className as its whole source text. Caught
 * by the test below, not by reading. `lib/navigation.ts`'s `isScreenKey` guards
 * the identical hole for screen ids; this is the same class in a second place.
 */
export function categoryClass(category: string | null | undefined): string {
  if (!category) return CATEGORY_COLORS.General
  return Object.hasOwn(CATEGORY_COLORS, category) ? CATEGORY_COLORS[category] : CATEGORY_COLORS.General
}

export interface EventDateParts {
  /** "Fri" — the weekday chip. */
  day: string
  /** "27" — the day number under it. */
  date: string
  /** "Fri, Jun 27 · 6:00 PM" — the full line. */
  full: string
  /** "6:00 PM". */
  time: string
}

/**
 * `events.starts_at` is a `timestamptz`, i.e. an INSTANT, so it is rendered in
 * the viewer's zone — which is correct for an instant and is why this goes
 * through `parseDbDate` rather than a fifth spelling of the parsing rule. See
 * lib/dates.ts for why there is exactly one home for that.
 *
 * Returns em-dashes rather than "Invalid Date" or "NaN" when the value cannot
 * be parsed. `starts_at` is NOT NULL as of 20260826000000, so the empty branch
 * should be unreachable from the database — it exists because a caller can
 * still hand this an empty string.
 */
export function formatEventDate(startsAt: string | null | undefined): EventDateParts {
  const d = parseDbDate(startsAt ?? null)
  if (d === null) return { day: "—", date: "—", full: "—", time: "—" }
  const day = d.toLocaleDateString("en-US", { weekday: "short" })
  const date = String(d.getDate())
  const month = d.toLocaleDateString("en-US", { month: "short" })
  const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
  return { day, date, time, full: `${day}, ${month} ${date} · ${time}` }
}

/**
 * How full an event is, 0-100, or `null` when there is no cap.
 *
 * `null` means NO BAR — not a full bar and not `Infinity`. `events.max_attendees`
 * is nullable and the screen's old expression `(attendees / maxAttendees) * 100`
 * yields `Infinity` for it, which React renders as `width: Infinity%`. That has
 * never fired only because no event has ever existed.
 *
 * Clamped at 100 so an over-subscribed event does not overflow its track.
 */
export function attendancePercent(going: number, cap: number | null | undefined): number | null {
  if (cap === null || cap === undefined || !Number.isFinite(cap) || cap <= 0) return null
  const pct = (going / cap) * 100
  if (!Number.isFinite(pct)) return null
  return Math.max(0, Math.min(100, pct))
}

/**
 * A reward badge, or `null` for no badge.
 *
 * `null` and `0` both mean no reward — a literal 0 in the column would look
 * like a decision somebody made rather than an absence, and `report_lost_found`
 * refuses to store one for exactly that reason.
 */
export function formatReward(cents: number | null | undefined): string | null {
  if (cents === null || cents === undefined) return null
  if (!Number.isFinite(cents) || cents <= 0) return null
  const dollars = cents / 100
  return `$${dollars.toLocaleString("en-US", { minimumFractionDigits: dollars % 1 === 0 ? 0 : 2, maximumFractionDigits: 2 })}`
}

export interface LostFoundShareInput {
  type: LostFoundType
  petName: string | null
  species: Species | null
  breed: string | null
  color: string | null
  lastSeen: string | null
  buildingName: string | null
  rewardCents: number | null
}

const SPECIES_LABEL: Record<Species, string> = {
  dog: "Dog",
  cat: "Cat",
  bird: "Bird",
  small_mammal: "Small pet",
  fish: "Fish",
  reptile: "Reptile",
  other: "Pet",
}

/**
 * The text a lost-pet notice shares. THIS IS A SECURITY BOUNDARY, and its test
 * is a security test.
 *
 * A lost-pet notice is MEANT to leave the building — that is the whole point of
 * sharing one — so what it may carry is stated positively, as a closed list:
 *
 *     pet name, species, breed, colour, last-seen text, the building NAME,
 *     and the reward if there is one.
 *
 * What it must NEVER carry, and why:
 *
 *   * the BUILDING CODE. Possession of a lobby code authorises
 *     `resolve_building_code` and, through it, the building's pet roster
 *     (Phase 0). A code in a message forwarded to a neighbourhood group is the
 *     roster in that group.
 *   * a UNIT NUMBER. That is a home address.
 *   * a URL of any kind. A signed storage URL carries the object path verbatim,
 *     and these paths embed an auth uid.
 *   * a UUID. Building ids, profile ids and object ids are all uuids and none
 *     of them is anybody's business outside the app.
 *
 * None of those four is an input to this function, which is the actual defence:
 * a field that is never passed cannot be leaked. The test asserts the output
 * anyway, because "it isn't a parameter" is a claim about today's signature.
 *
 * THE ONE THING THIS FUNCTION CANNOT GUARANTEE: `lastSeen` and `petName` are
 * free text a resident typed. If a resident writes their own unit number into
 * "last seen", it goes out — that is their sentence about their own home, and
 * redacting a neighbour's prose would be a different and worse feature. What is
 * guaranteed is that nothing the PLATFORM knows is added.
 */
export function lostFoundShareText(item: LostFoundShareInput): string {
  const name = item.petName?.trim() || "A pet"
  const species = item.species ? SPECIES_LABEL[item.species] : null
  const descriptors = [species, item.breed?.trim() || null, item.color?.trim() || null].filter(
    (x): x is string => !!x,
  )

  const lines: string[] = []
  lines.push(item.type === "lost" ? `LOST PET: ${name}` : `FOUND PET: ${name}`)
  if (descriptors.length) lines.push(descriptors.join(" · "))
  if (item.lastSeen?.trim()) {
    lines.push(item.type === "lost" ? `Last seen: ${item.lastSeen.trim()}` : `Found: ${item.lastSeen.trim()}`)
  }
  if (item.buildingName?.trim()) lines.push(`Near ${item.buildingName.trim()}`)
  const reward = formatReward(item.rewardCents)
  if (reward) lines.push(`Reward: ${reward}`)
  lines.push(
    item.type === "lost"
      ? "If you see them, please contact the building."
      : "If this is your pet, please contact the building.",
  )
  return lines.join("\n")
}

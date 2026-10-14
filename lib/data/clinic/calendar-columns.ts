/**
 * The columns of the day grid: one per bookable clinician, then one for any
 * other staff member who has an appointment in view ("(not bookable)": they
 * left, or stopped taking bookings, but their appointments still exist), then
 * "Unassigned" whenever an appointment has no clinician or nobody is bookable.
 * Every appointment therefore lands in a column; none vanish from the grid.
 */
export function calendarColumns(
  staff: { id: string; name: string; bookable: boolean }[],
  appts: { staffId: string | null }[],
): { id: string | null; name: string }[] {
  const columns: { id: string | null; name: string }[] = staff
    .filter((s) => s.bookable)
    .map((s) => ({ id: s.id, name: s.name }))
  for (const s of staff) {
    if (!s.bookable && appts.some((a) => a.staffId === s.id)) {
      columns.push({ id: s.id, name: `${s.name} (not bookable)` })
    }
  }
  // An appointment for someone we don't know (deleted staff) has no column of
  // its own, so it falls into Unassigned rather than vanishing.
  const known = new Set(staff.map((s) => s.id))
  if (columns.length === 0 || appts.some((a) => a.staffId === null || !known.has(a.staffId))) {
    columns.push({ id: null, name: "Unassigned" })
  }
  return columns
}

/**
 * The columns of the day grid: one per bookable clinician, plus "Unassigned"
 * whenever an appointment has no clinician (it would otherwise match no column
 * and silently vanish from the grid) or when nobody is bookable (so the grid
 * is never column-less).
 */
export function calendarColumns(
  staff: { id: string; name: string; bookable: boolean }[],
  appts: { staffId: string | null }[],
): { id: string | null; name: string }[] {
  const columns: { id: string | null; name: string }[] = staff
    .filter((s) => s.bookable)
    .map((s) => ({ id: s.id, name: s.name }))
  if (columns.length === 0 || appts.some((a) => a.staffId === null)) {
    columns.push({ id: null, name: "Unassigned" })
  }
  return columns
}

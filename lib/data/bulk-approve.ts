/**
 * The bulk-approve dialog lists what it will approve, grouped by building, so a
 * manager of several buildings sees which one each approval lands in.
 */
export function groupBulkByBuilding(
  items: { buildingId: string | null; bulkLabel: string }[],
  nameFor: (buildingId: string | null | undefined) => string,
): { building: string; labels: string[] }[] {
  const groups = new Map<string, string[]>()
  for (const i of items) {
    const building = nameFor(i.buildingId)
    const labels = groups.get(building)
    if (labels) labels.push(i.bulkLabel)
    else groups.set(building, [i.bulkLabel])
  }
  return [...groups].map(([building, labels]) => ({ building, labels }))
}

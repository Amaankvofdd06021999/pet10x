/** A species glyph for record rows. Decorative: the row names the pet. */
export function SpeciesIcon({ species }: { species: string | null }) {
  const glyph = species === "cat" ? "🐈" : species === "bird" ? "🐦" : species === "dog" ? "🐕" : "🐾"
  return (
    <span aria-hidden="true" className="text-body">
      {glyph}
    </span>
  )
}

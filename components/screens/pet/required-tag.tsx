/** A word, not only an asterisk: the asterisk alone is easy to miss and says
    nothing to a screen reader. Shared so every form marks required the same way. */
export function RequiredTag() {
  return (
    <span className="rounded bg-destructive/10 px-1.5 py-0.5 text-[10px] font-semibold normal-case tracking-normal text-destructive">
      Required
    </span>
  )
}

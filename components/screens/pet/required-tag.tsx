import { Badge } from "@/components/ui/badge"
/** A word, not only an asterisk: the asterisk alone is easy to miss and says
    nothing to a screen reader. Shared so every form marks required the same way. */
export function RequiredTag() {
  return (
    <Badge variant="danger" className="normal-case tracking-normal">
      Required
    </Badge>
  )
}

import { Badge } from "@/components/ui/badge"

/** Whether a clinic patient is tied to a resident's Pet10x account. */
export function LinkedBadge({ linked }: { linked: boolean }) {
  return linked ? (
    <Badge variant="brand" title="This patient is linked to a Pet10x account">
      Pet10x
    </Badge>
  ) : (
    <Badge variant="neutral" title="Not linked to a Pet10x account — the practice holds this record on its own">
      Local
    </Badge>
  )
}

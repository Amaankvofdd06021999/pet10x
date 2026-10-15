/**
 * The `type` a Button renders with. A native <button> with no type is a
 * submit button, so a Button dropped inside a form would submit it. Default to
 * "button" and let a caller opt in with type="submit". With `asChild` the
 * element is not necessarily a <button> (a link, say), so nothing is added.
 */
export function buttonType(
  asChild: boolean,
  type: "button" | "submit" | "reset" | undefined,
): "button" | "submit" | "reset" | undefined {
  if (asChild) return undefined
  return type ?? "button"
}

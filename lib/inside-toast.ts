/**
 * Toasts are not "outside" a dialog.
 *
 * Error toasts appear exactly when a save failed and the sheet stays open. A
 * Radix layer treats a tap on one as an outside interaction and dismisses —
 * discarding whatever was typed. Every Radix layer chains this into its
 * `onInteractOutside` so a tap on a toast is ignored for dismissal.
 */

const TOASTER = "[data-sonner-toaster]"

export function isInsideToast(target: EventTarget | null): boolean {
  const el = target as { closest?: (selector: string) => unknown } | null
  return typeof el?.closest === "function" && el.closest(TOASTER) != null
}

/** Wraps a caller's `onInteractOutside` (if any) so toasts never dismiss the layer. */
export function keepOpenForToasts<E extends { target: EventTarget | null; preventDefault: () => void }>(
  onInteractOutside?: (event: E) => void,
): (event: E) => void {
  return (event) => {
    if (isInsideToast(event.target)) event.preventDefault()
    onInteractOutside?.(event)
  }
}

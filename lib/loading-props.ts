/**
 * The loading contract every Button shares: while loading it is disabled and
 * says so to assistive tech (`aria-busy`); when idle, `aria-busy` is left off
 * entirely rather than rendered as "false", and `disabled` is the caller's.
 */
export function loadingProps(
  loading: boolean,
  disabled: boolean | undefined,
): { disabled: boolean | undefined; 'aria-busy': true | undefined } {
  return { disabled: loading || disabled, 'aria-busy': loading || undefined }
}

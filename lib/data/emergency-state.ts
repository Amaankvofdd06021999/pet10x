/**
 * What the emergency page keeps on screen across re-checks.
 *
 * The page re-validates the token every minute so a revoked link dies while
 * open. In a stairwell the signal drops, and a dropped connection is not a
 * revoked link: only the server's explicit "valid: false" ends access. A
 * transport failure keeps the last good list, marked stale, because a
 * responder would rather read a list from five minutes ago than a dead end.
 */

export type EmergencyCheck<Data> =
  | { kind: "valid"; data: Data }
  | { kind: "denied" }
  | { kind: "network" }

export interface EmergencyViewState<Data> {
  data: Data | null
  /** The data on screen is older than the latest check (that check failed to reach the server). */
  stale: boolean
  /** The server said the code is invalid, expired or revoked. */
  denied: boolean
  /** Epoch ms of the last check that returned data; null before the first. */
  lastOk: number | null
}

export function nextEmergencyState<Data>(
  prev: EmergencyViewState<Data>,
  result: EmergencyCheck<Data>,
  now: number,
): EmergencyViewState<Data> {
  switch (result.kind) {
    case "valid":
      return { data: result.data, stale: false, denied: false, lastOk: now }
    case "denied":
      return { data: null, stale: false, denied: true, lastOk: null }
    case "network":
      // Nothing to keep: the page shows "Couldn't connect" with Retry.
      if (!prev.data) return { data: null, stale: false, denied: false, lastOk: prev.lastOk }
      return { ...prev, stale: true, denied: false }
  }
}

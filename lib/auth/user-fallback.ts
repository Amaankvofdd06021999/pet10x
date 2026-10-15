/**
 * Which user to keep when my_app_user fails or times out.
 *
 * A token refresh or a slow network used to rebuild the user from the auth
 * record alone — `onboarded: false`, no building — which threw an onboarded
 * owner back into onboarding and, persisted, kept them there. The user already
 * on screen, or the one cached for this same account, is a better answer than
 * any guess. Null means there is nothing of this account's to keep (a first
 * load), and the caller may build a minimal, unpersisted fallback.
 */
export function userToKeepOnLoadError<T extends { id: string }>(
  authUserId: string,
  current: T | null,
  cached: T | null,
): T | null {
  if (current?.id === authUserId) return current
  if (cached?.id === authUserId) return cached
  return null
}

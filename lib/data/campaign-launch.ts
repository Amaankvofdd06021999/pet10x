/**
 * Pet10x — can this business launch a campaign yet?
 *
 * Campaigns reach residents near the business and only verified businesses
 * appear to residents at all, so a campaign launched without a location or
 * before verification would run to nobody. The Launch button stays disabled
 * and says which of the two is missing, rather than letting the insert
 * succeed into an empty audience.
 */

export type CampaignReadiness = {
  latitude: number | null
  longitude: number | null
  isVerified: boolean
}

/**
 * Null when the business can launch, otherwise the sentence to show under the
 * disabled button. The location comes first: it is the step the owner can
 * take now, while verification waits on Pet10x.
 */
export function campaignLaunchBlock(b: CampaignReadiness): string | null {
  if (b.latitude == null || b.longitude == null) return "Add your location first"
  if (!b.isVerified) return "Campaigns start once you're verified"
  return null
}

import { describe, expect, it } from "vitest"
import { campaignLaunchBlock } from "./campaign-launch"

describe("campaignLaunchBlock", () => {
  const ready = { latitude: 49.26, longitude: -123.14, isVerified: true }
  it("lets a verified business with a location launch", () => {
    expect(campaignLaunchBlock(ready)).toBeNull()
  })
  it("treats 0 as a real coordinate", () => {
    expect(campaignLaunchBlock({ ...ready, latitude: 0, longitude: 0 })).toBeNull()
  })
  it("asks for a location when either coordinate is missing", () => {
    expect(campaignLaunchBlock({ ...ready, latitude: null })).toBe("Add your location first")
    expect(campaignLaunchBlock({ ...ready, longitude: null })).toBe("Add your location first")
  })
  it("waits for verification", () => {
    expect(campaignLaunchBlock({ ...ready, isVerified: false })).toBe("Campaigns start once you're verified")
  })
  it("asks for the location first when both are missing — it's the step you can take now", () => {
    expect(campaignLaunchBlock({ latitude: null, longitude: null, isVerified: false })).toBe("Add your location first")
  })
})

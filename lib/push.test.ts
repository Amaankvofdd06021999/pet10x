import { describe, expect, it } from "vitest"
import { isPushConfigured, isPushSupported, urlBase64ToUint8Array } from "./push"

describe("urlBase64ToUint8Array", () => {
  it("decodes base64url without padding, as `web-push generate-vapid-keys` prints it", () => {
    // "-_8" is base64url for 0xfb 0xff; standard base64 would spell it "+/8=".
    expect(Array.from(urlBase64ToUint8Array("-_8"))).toEqual([0xfb, 0xff])
    expect(Array.from(urlBase64ToUint8Array("AQID"))).toEqual([1, 2, 3])
    expect(Array.from(urlBase64ToUint8Array("AQ"))).toEqual([1])
  })

  it("yields the 65 bytes of an uncompressed P-256 public key", () => {
    // A real VAPID public key is 87 base64url characters.
    const key = "BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U"
    expect(urlBase64ToUint8Array(key).length).toBe(65)
  })
})

describe("feature detection", () => {
  it("is off without a VAPID key and outside a browser — so no switch renders", () => {
    expect(isPushConfigured()).toBe(false)
    expect(isPushSupported()).toBe(false)
  })
})

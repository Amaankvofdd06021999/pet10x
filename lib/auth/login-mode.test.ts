import { describe, it, expect } from "vitest"
import { readLoginMode } from "./login-mode"

describe("readLoginMode", () => {
  it("opens Sign up only for the literal mode=signup", () => {
    expect(readLoginMode("?mode=signup")).toBe("signup")
    expect(readLoginMode("mode=signup")).toBe("signup")
  })
  it("treats any other spelling or value as Sign in", () => {
    expect(readLoginMode("?mode=SIGNUP")).toBe("signin")
    expect(readLoginMode("?mode=signin")).toBe("signin")
    expect(readLoginMode("?mode=")).toBe("signin")
    expect(readLoginMode("")).toBe("signin")
  })
  it("survives alongside next", () => {
    expect(readLoginMode("?mode=signup&next=/app")).toBe("signup")
    expect(readLoginMode("?next=%2Fapp&mode=signup")).toBe("signup")
  })
})

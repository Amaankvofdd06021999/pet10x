import { describe, expect, it } from "vitest"
import { backTarget, fromLegacyTarget, routeToSearch, searchToRoute } from "./app-route"

const PET = "3f2b8c1e-1a2b-4c3d-8e9f-0a1b2c3d4e5f"

describe("app routes", () => {
  it("round-trips a pet on a tab", () => {
    const s = routeToSearch({ screen: "pet-detail", id: PET, tab: "documents" })
    expect(s).toBe(`?screen=pet-detail&id=${PET}&tab=documents`)
    expect(searchToRoute(s, "resident")).toEqual({ screen: "pet-detail", id: PET, tab: "documents" })
  })
  it("a tab root is the bare path", () => {
    expect(routeToSearch({ screen: "home" })).toBe("")
  })
  it("only a tab root is bare; any other screen keeps ?screen=", () => {
    expect(routeToSearch({ screen: "add-pet" })).toBe("?screen=add-pet")
    expect(routeToSearch({ screen: "community", tab: "events" })).toBe("?screen=community&tab=events")
  })
  it("refuses screens the surface cannot render", () => {
    expect(searchToRoute("?screen=approvals", "resident")).toBeNull()
    expect(searchToRoute("?screen=dashboard", "manager")).toEqual({ screen: "dashboard" })
  })
  it("refuses unknown screens and malformed ids", () => {
    expect(searchToRoute("?screen=evil", "resident")).toBeNull()
    expect(searchToRoute("?screen=pet-detail&id=<script>", "resident")).toBeNull()
  })
  it("accepts a care kind as the pet-care id", () => {
    expect(searchToRoute(`?screen=pet-care&id=food&pet=${PET}`, "resident")).toEqual({ screen: "pet-care", id: "food", petId: PET })
  })
  it("reads legacy ?target= links", () => {
    expect(fromLegacyTarget(`?target=pet-detail:${PET}`, "resident")).toMatchObject({ screen: "pet-detail", id: PET })
  })
  it("back with no in-app history goes to the tab root, never out of the app", () => {
    expect(backTarget(0, "home")).toEqual({ screen: "home" })
    expect(backTarget(2, "home")).toBe("history")
  })
  it("requires an id where the screen's subject is the id", () => {
    expect(searchToRoute("?screen=pet-detail", "resident")).toBeNull()
    expect(searchToRoute("?screen=business-detail", "resident")).toBeNull()
  })
  it("accepts an id only on screens that consume one", () => {
    expect(searchToRoute(`?screen=home&id=${PET}`, "resident")).toBeNull()
    expect(searchToRoute(`?screen=ai-chat&id=${PET}`, "resident")).toEqual({ screen: "ai-chat", id: PET })
    expect(searchToRoute(`?screen=my-cases&id=${PET}`, "resident")).toEqual({ screen: "my-cases", id: PET })
    expect(searchToRoute("?screen=ai-chat", "resident")).toEqual({ screen: "ai-chat" })
  })
  it("accepts pet only on pet-care", () => {
    expect(searchToRoute(`?screen=pet-detail&id=${PET}&pet=${PET}`, "resident")).toBeNull()
  })
  it("validates tab against the screen's own tabs", () => {
    expect(searchToRoute("?screen=my-vets&tab=bills", "resident")).toEqual({ screen: "my-vets", tab: "bills" })
    expect(searchToRoute("?screen=my-vets&tab=nope", "resident")).toBeNull()
    expect(searchToRoute("?screen=community&tab=events", "resident")).toEqual({ screen: "community", tab: "events" })
    expect(searchToRoute("?screen=home&tab=events", "resident")).toBeNull()
  })
})

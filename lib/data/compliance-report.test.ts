import { describe, expect, it } from "vitest"
import { buildComplianceReport, complianceCensusCsv, currentRecords, nextExpiry, type ReportPet } from "./compliance-report"

const pet = (over: Partial<ReportPet>): ReportPet => ({
  id: "p",
  name: "Pepper",
  species: "dog",
  breed: "Beagle",
  unit: "204",
  registrationStatus: "approved",
  neutered: true,
  vax: [],
  docs: [],
  ...over,
})

const rules = { require_rabies: true, require_license: true }
const today = "2026-10-07"

describe("buildComplianceReport", () => {
  const report = buildComplianceReport({
    rules,
    today,
    openCaseStages: ["open", "warning", "warning", "fine_2"],
    pets: [
      pet({
        id: "a",
        name: "Pepper",
        vax: [{ name: "Rabies", status: "current", expiresOn: "2026-10-20" }],
        docs: [{ kind: "municipal_license", status: "current", expiresOn: "2027-03-01" }],
      }),
      pet({
        id: "b",
        name: "Miso",
        registrationStatus: "pending",
        vax: [{ name: "Rabies", status: "expired", expiresOn: "2026-09-01" }],
      }),
      pet({ id: "c", name: "Juno", registrationStatus: "info_requested" }),
    ],
  })

  it("counts registration and compliance", () => {
    expect(report.pets).toBe(3)
    expect(report.registered).toBe(1)
    expect(report.pending).toBe(2)
    expect(report.compliant).toBe(1)
    expect(report.nonCompliant).toBe(2)
  })

  it("counts missing items across pets, largest first", () => {
    expect(report.missingByItem).toEqual([
      { item: "License", pets: 2 },
      { item: "Rabies", pets: 2 },
    ])
  })

  it("lists expired and within-30-day expiries, soonest first, and nothing later", () => {
    expect(report.expiring.map((e) => [e.pet, e.item, e.expiresOn, e.expired])).toEqual([
      ["Miso", "Rabies", "2026-09-01", true],
      ["Pepper", "Rabies", "2026-10-20", false],
    ])
  })

  it("counts open cases on every open rung, including the empty ones", () => {
    expect(report.openByStage).toEqual([
      { stage: "open", count: 1 },
      { stage: "warning", count: 2 },
      { stage: "fine_1", count: 0 },
      { stage: "fine_2", count: 1 },
    ])
  })

  it("agrees with computeCompliance on each row", () => {
    expect(report.rows.find((r) => r.id === "a")).toMatchObject({ compliancePct: 100, missing: [] })
    expect(report.rows.find((r) => r.id === "b")).toMatchObject({ compliancePct: 0, missing: ["Rabies", "License"] })
  })

  it("is all-compliant with no rules", () => {
    const r = buildComplianceReport({ rules: {}, today, openCaseStages: [], pets: [pet({})] })
    expect(r.compliant).toBe(1)
    expect(r.missingByItem).toEqual([])
  })
})

describe("complianceCensusCsv", () => {
  const rows = [
    { name: "Pepper", species: "dog", breed: null, compliancePct: 50, missing: ["Rabies", "License"], unit: "204", registrationStatus: "info_requested", nextExpiry: "2026-10-20" },
  ]
  it("writes the board pack's five columns by default", () => {
    expect(complianceCensusCsv(rows)).toBe("Pet,Species,Breed,Compliance %,Missing requirements\nPepper,dog,—,50,Rabies; License")
  })
  it("adds unit, registration and next expiry for the building report", () => {
    expect(complianceCensusCsv(rows, { detailed: true }).split("\n")).toEqual([
      "Pet,Species,Breed,Compliance %,Missing requirements,Unit,Registration,Next expiry",
      "Pepper,dog,—,50,Rabies; License,204,info requested,2026-10-20",
    ])
  })
})

describe("nextExpiry", () => {
  it("is the soonest date on any record, or null", () => {
    expect(
      nextExpiry({
        vax: [{ name: "Rabies", status: "current", expiresOn: "2027-01-01" }],
        docs: [{ kind: "other", status: "current", expiresOn: "2026-12-01" }],
      }),
    ).toBe("2026-12-01")
    expect(nextExpiry({ vax: [], docs: [] })).toBeNull()
  })
})

describe("superseded and rejected records", () => {
  const renewed = pet({
    id: "r",
    name: "Biscuit",
    vax: [
      { name: "Rabies", status: "expired", expiresOn: "2026-09-01", recordedAt: "2025-09-01" },
      { name: "rabies ", status: "current", expiresOn: "2027-09-01", recordedAt: "2026-09-02" },
      { name: "DHPP", status: "rejected", expiresOn: "2026-10-10", recordedAt: "2026-10-01" },
    ],
    docs: [
      { kind: "municipal_license", status: "expired", expiresOn: "2026-08-01", recordedAt: "2025-08-01T10:00:00Z" },
      { kind: "municipal_license", status: "current", expiresOn: "2027-08-01", recordedAt: "2026-08-02T10:00:00Z" },
      { kind: "liability_insurance", status: "rejected", expiresOn: "2026-10-09", recordedAt: "2026-10-01T10:00:00Z" },
    ],
  })

  it("keeps only the latest non-rejected record per vaccine and per document kind", () => {
    const s = currentRecords(renewed)
    expect(s.vax.map((v) => v.expiresOn)).toEqual(["2027-09-01"])
    expect(s.docs.map((d) => d.expiresOn)).toEqual(["2027-08-01"])
  })

  it("does not report a renewed or rejected record as expired or expiring", () => {
    const r = buildComplianceReport({ rules, today, openCaseStages: [], pets: [renewed] })
    expect(r.expiring).toEqual([])
  })

  it("takes the next expiry from standing records only", () => {
    expect(nextExpiry(renewed)).toBe("2027-08-01")
  })

  it("lets a dated record replace an undated one", () => {
    const s = currentRecords({
      vax: [
        { name: "Rabies", status: "current", expiresOn: "2026-01-01" },
        { name: "Rabies", status: "current", expiresOn: "2028-01-01", recordedAt: "2027-01-01" },
      ],
      docs: [],
    })
    expect(s.vax.map((v) => v.expiresOn)).toEqual(["2028-01-01"])
  })
})

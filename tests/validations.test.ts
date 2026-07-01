import { describe, it, expect } from "vitest";
import {
  signupSchema,
  championshipCreateSchema,
  timeInputSchema,
  bibRangeSchema,
  paymentInitializeSchema,
  contactFormSchema,
} from "@/lib/validations";

describe("signupSchema", () => {
  const base = {
    accountType: "SCHOOL" as const,
    organizationName: "Starehe Boys Centre",
    contactName: "Jane Doe",
    email: "jane@example.com",
    phone: "0712345678",
    county: "Nairobi",
    subcounty: "Starehe",
    gameCategory: "ATHLETICS" as const,
    password: "Passw0rd!",
    confirmPassword: "Passw0rd!",
  };

  it("accepts a fully valid signup payload", () => {
    expect(signupSchema.safeParse(base).success).toBe(true);
  });

  it("rejects mismatched passwords", () => {
    const result = signupSchema.safeParse({ ...base, confirmPassword: "Different1" });
    expect(result.success).toBe(false);
  });

  it("rejects a password without an uppercase letter or number", () => {
    const result = signupSchema.safeParse({ ...base, password: "lowercase", confirmPassword: "lowercase" });
    expect(result.success).toBe(false);
  });

  it("rejects an invalid email", () => {
    const result = signupSchema.safeParse({ ...base, email: "not-an-email" });
    expect(result.success).toBe(false);
  });

  it("rejects a missing county", () => {
    const result = signupSchema.safeParse({ ...base, county: "" });
    expect(result.success).toBe(false);
  });
});

describe("championshipCreateSchema", () => {
  const base = {
    name: "Zone Athletics Championship",
    level: "ZONE" as const,
    schoolLevel: "SECONDARY" as const,
    category: "ATHLETICS" as const,
    county: "Nairobi",
    location: "Nairobi Stadium",
    startDate: "2026-08-01",
    endDate: "2026-08-03",
    isPublished: false,
  };

  it("accepts a valid championship payload", () => {
    expect(championshipCreateSchema.safeParse(base).success).toBe(true);
  });

  it("rejects an end date before the start date", () => {
    const result = championshipCreateSchema.safeParse({ ...base, startDate: "2026-08-05", endDate: "2026-08-01" });
    expect(result.success).toBe(false);
  });
});

describe("timeInputSchema", () => {
  it.each(["12.06", "0:12.06", "1:23.45", "45"])("accepts %s", (value) => {
    expect(timeInputSchema.safeParse(value).success).toBe(true);
  });

  it.each(["abc", "1:2:3", "1:60.00", "-5"])("rejects %s", (value) => {
    expect(timeInputSchema.safeParse(value).success).toBe(false);
  });
});

describe("bibRangeSchema", () => {
  it("accepts a valid ascending range", () => {
    const result = bibRangeSchema.safeParse({
      championshipId: "11111111-1111-1111-1111-111111111111",
      schoolId: "22222222-2222-2222-2222-222222222222",
      rangeStart: 100,
      rangeEnd: 149,
    });
    expect(result.success).toBe(true);
  });

  it("rejects rangeEnd before rangeStart", () => {
    const result = bibRangeSchema.safeParse({
      championshipId: "11111111-1111-1111-1111-111111111111",
      schoolId: "22222222-2222-2222-2222-222222222222",
      rangeStart: 150,
      rangeEnd: 100,
    });
    expect(result.success).toBe(false);
  });
});

describe("paymentInitializeSchema", () => {
  it("accepts a subscription-mode payload", () => {
    const result = paymentInitializeSchema.safeParse({
      mode: "subscription",
      planId: "11111111-1111-1111-1111-111111111111",
    });
    expect(result.success).toBe(true);
  });

  it("accepts a team_fee-mode payload", () => {
    const result = paymentInitializeSchema.safeParse({
      mode: "team_fee",
      feeId: "11111111-1111-1111-1111-111111111111",
      teamName: "Thunder FC",
      teamCode: "THU",
      contactEmail: "team@example.com",
    });
    expect(result.success).toBe(true);
  });

  it("rejects an unknown mode", () => {
    const result = paymentInitializeSchema.safeParse({ mode: "refund" });
    expect(result.success).toBe(false);
  });
});

describe("contactFormSchema", () => {
  it("rejects a too-short message", () => {
    const result = contactFormSchema.safeParse({
      name: "John",
      email: "john@example.com",
      subject: "Hi",
      message: "hi",
    });
    expect(result.success).toBe(false);
  });

  it("accepts a well-formed contact submission", () => {
    const result = contactFormSchema.safeParse({
      name: "John Doe",
      email: "john@example.com",
      subject: "Question about registration",
      message: "How do I register my school for the county championship?",
    });
    expect(result.success).toBe(true);
  });
});

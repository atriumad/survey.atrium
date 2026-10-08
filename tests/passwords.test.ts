import { describe, expect, it } from "vitest";
import { generatePassword } from "@/lib/passwords";

describe("generatePassword", () => {
  it("defaults to 16 characters", () => {
    expect(generatePassword()).toHaveLength(16);
  });

  it("honors a custom length", () => {
    expect(generatePassword(24)).toHaveLength(24);
  });

  it("avoids ambiguous characters", () => {
    for (let i = 0; i < 50; i++) {
      expect(generatePassword()).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789]+$/);
    }
  });

  it("does not repeat", () => {
    expect(generatePassword()).not.toBe(generatePassword());
  });
});

import { describe, expect, it } from "vitest";
import { describeDbError } from "@/lib/db-errors";

describe("describeDbError", () => {
  it("explains a duplicate slug", () => {
    expect(
      describeDbError(
        { code: "23505", message: 'duplicate key value violates unique constraint "locations_slug_key"' },
        "Could not save"
      )
    ).toBe("That slug is already in use. Choose a different one.");
  });

  it("explains other duplicates", () => {
    expect(describeDbError({ code: "23505", message: "duplicate key ... profiles_pkey" }, "Could not save")).toBe(
      "That record already exists."
    );
  });

  it("explains a missing related record", () => {
    expect(describeDbError({ code: "23503", message: "violates foreign key" }, "Could not save")).toBe(
      "A related record was not found."
    );
  });

  it("falls back for unknown errors without leaking the message", () => {
    expect(describeDbError({ code: "XX000", message: "secret internals" }, "Could not save")).toBe("Could not save");
  });
});

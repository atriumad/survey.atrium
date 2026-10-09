import { describe, expect, it } from "vitest";
import { detectImageType } from "@/lib/image-type";

const bytes = (...values: number[]) => new Uint8Array(values);

describe("detectImageType", () => {
  it("detects PNG", () => {
    expect(detectImageType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0))).toBe("image/png");
  });
  it("detects JPEG", () => {
    expect(detectImageType(bytes(0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0))).toBe("image/jpeg");
  });
  it("detects WebP", () => {
    // "RIFF" size "WEBP"
    expect(detectImageType(bytes(0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50))).toBe("image/webp");
  });
  it("rejects SVG/text and short input", () => {
    expect(detectImageType(new TextEncoder().encode("<svg xmlns='http://www.w3.org/2000/svg'></svg>"))).toBeNull();
    expect(detectImageType(bytes(0x89, 0x50))).toBeNull();
    expect(detectImageType(new Uint8Array())).toBeNull();
  });
  it("rejects RIFF that is not WebP", () => {
    expect(detectImageType(bytes(0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x41, 0x56, 0x45))).toBeNull();
  });
});

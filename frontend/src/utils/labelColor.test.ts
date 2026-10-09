import { describe, expect, it } from "vitest";
import { normalizeHexColor, readableTextColor } from "./labelColor";

describe("labelColor", () => {
  it("normalizes hex forms", () => {
    expect(normalizeHexColor("D73A4A")).toBe("#d73a4a");
    expect(normalizeHexColor("#fc0")).toBe("#ffcc00");
    expect(normalizeHexColor("red")).toBe("#cccccc");
    expect(normalizeHexColor(undefined)).toBe("#cccccc");
  });

  it("picks text by brightness, not by the hex number", () => {
    expect(readableTextColor("#00ff00")).toBe("#111827");
    expect(readableTextColor("#ffff00")).toBe("#111827");
    expect(readableTextColor("#cccccc")).toBe("#111827");
    expect(readableTextColor("#0000ff")).toBe("#ffffff");
    expect(readableTextColor("#b60205")).toBe("#ffffff");
    expect(readableTextColor("#800080")).toBe("#ffffff");
  });
});

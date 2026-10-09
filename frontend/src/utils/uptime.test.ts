import { describe, expect, it } from "vitest";
import { localizeUptime } from "./uptime";

describe("localizeUptime", () => {
  it("rewrites the backend's Russian units in English", () => {
    expect(localizeUptime("2 д 3 ч", "en")).toBe("2d 3h");
    expect(localizeUptime("3 ч 12 мин", "en")).toBe("3h 12m");
    expect(localizeUptime("45 мин", "en")).toBe("45m");
  });

  it("leaves Russian and foreign formats alone", () => {
    expect(localizeUptime("3 ч 12 мин", "ru")).toBe("3 ч 12 мин");
    expect(localizeUptime("1 hour, 2 minutes", "en")).toBe("1 hour, 2 minutes");
  });
});

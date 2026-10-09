import { describe, expect, it } from "vitest";
import { localizeFeedItem } from "./studentFeedText";
import type { StudentActivityFeedItem } from "../api/studentDashboardApi";

const base: StudentActivityFeedItem = {
  id: "x",
  type: "repo",
  text: "Создан репозиторий ",
  bold: "lab-1",
  text_after: null,
  time_label: "5 мин назад",
  created_at: new Date(Date.now() - 5 * 60_000).toISOString(),
  badge: null,
  badge_variant: null,
  href: null,
};

describe("localizeFeedItem", () => {
  it("renders keyed rows in the UI language and computes the time locally", () => {
    const out = localizeFeedItem({ ...base, i18n_key: "repoCreated", i18n_params: { repo: "lab-1" } }, "en");
    expect(out.text).toBe("Created repository ");
    expect(out.bold).toBe("lab-1");
    expect(out.time).not.toContain("мин");
  });

  it("translates the badge and keeps user content", () => {
    const out = localizeFeedItem(
      { ...base, type: "comment", bold: "Лаба 1", badge: "Новое", i18n_key: "teacherComment", i18n_params: { assignment: "Лаба 1", preview: "Хорошо" } },
      "en",
    );
    expect(out.bold).toBe("Лаба 1");
    expect(out.after).toBe(": “Хорошо”");
    expect(out.badge).toBe("New");
  });

  it("falls back to server text without a key", () => {
    expect(localizeFeedItem(base, "en").text).toBe("Создан репозиторий ");
  });
});

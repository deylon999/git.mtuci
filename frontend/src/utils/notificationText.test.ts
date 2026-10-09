import { describe, expect, it } from "vitest";
import { localizeNotification } from "./notificationText";

const stored = { title: "Новая оценка", message: "Lab 1 · Networks: 8 баллов" };

describe("localizeNotification", () => {
  it("renders a known key in the requested language with plurals", () => {
    const n = { ...stored, i18n_key: "gradePosted", i18n_params: { assignment: "Lab 1", course: "Networks", points: 1 } };
    expect(localizeNotification(n, "en")).toEqual({ title: "New grade", message: "Lab 1 · Networks: 1 point" });
    expect(localizeNotification({ ...n, i18n_params: { ...n.i18n_params, points: 3 } }, "ru").message).toBe(
      "Lab 1 · Networks: 3 балла",
    );
  });

  it("keeps the stored text for rows without a key or with an unknown key", () => {
    expect(localizeNotification({ ...stored, i18n_key: null }, "en")).toEqual(stored);
    expect(localizeNotification({ ...stored, i18n_key: "fromNewerBackend", i18n_params: {} }, "en")).toEqual(stored);
  });
});

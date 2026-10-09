import { describe, expect, it } from "vitest";
import { activityMessageText } from "./activityText";

describe("activityMessageText", () => {
  it("re-renders backend-generated messages in the UI language", () => {
    expect(activityMessageText("push", "3 commits", "ru")).toBe("3 коммита");
    expect(activityMessageText("push", "1 commit", "en")).toBe("1 commit");
    expect(activityMessageText("pr_merge", "Merged PR #5", "ru")).toBe("PR #5");
    expect(activityMessageText("pr_comment", "PR #5: комментарий от ivan", "en")).toBe("PR #5, comment by ivan");
    expect(activityMessageText("pr_comment", "PR #7 от ivan: looks good", "en")).toBe("PR #7, ivan: looks good");
  });

  it("hides messages that repeat the action and keeps user content", () => {
    expect(activityMessageText("repo_created", "Repository created", "ru")).toBeNull();
    expect(activityMessageText("commit", "", "en")).toBeNull();
    expect(activityMessageText("commit", "fix: 3 commits squashed", "en")).toBe("fix: 3 commits squashed");
    expect(activityMessageText("pull_request", "Add login page", "ru")).toBe("Add login page");
  });
});

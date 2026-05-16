import fs from "fs";
import path from "path";
const files = [
  "src/components/repo/RepoSettingsPanel.tsx",
  "src/components/FeaturePlaceholder.tsx",
  "src/pages/StudentCoursesPage.tsx",
];
const tag = "motionWrap";
for (const f of files) {
  let t = fs.readFileSync(f, "utf8");
  t = t.split("<" + tag).join("<div");
  t = t.split("</" + tag + ">").join("</div>");
  fs.writeFileSync(f, t);
  console.log("fixed", f);
}

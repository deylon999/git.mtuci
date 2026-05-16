/** Monaco / display language from file path */
export function monacoLanguageFromPath(filepath: string): string {
  const name = filepath.toLowerCase().split("/").pop() ?? "";
  const ext = name.includes(".") ? name.split(".").pop()! : "";
  const map: Record<string, string> = {
    py: "python",
    pyw: "python",
    js: "javascript",
    jsx: "javascript",
    mjs: "javascript",
    cjs: "javascript",
    ts: "typescript",
    tsx: "typescript",
    json: "json",
    yaml: "yaml",
    yml: "yaml",
    html: "html",
    htm: "html",
    css: "css",
    scss: "scss",
    less: "less",
    md: "markdown",
    sql: "sql",
    sh: "shell",
    bash: "shell",
    go: "go",
    rs: "rust",
    java: "java",
    c: "c",
    h: "c",
    cpp: "cpp",
    cc: "cpp",
    hpp: "cpp",
    cs: "csharp",
    php: "php",
    rb: "ruby",
    xml: "xml",
    vue: "html",
  };
  return map[ext] ?? "plaintext";
}

export function displayLanguageLabel(filepath: string): string {
  const id = monacoLanguageFromPath(filepath);
  const labels: Record<string, string> = {
    python: "Python",
    javascript: "JavaScript",
    typescript: "TypeScript",
    json: "JSON",
    yaml: "YAML",
    html: "HTML",
    css: "CSS",
    markdown: "Markdown",
    shell: "Shell",
    go: "Go",
    rust: "Rust",
    java: "Java",
    plaintext: "Text",
  };
  return labels[id] ?? id.charAt(0).toUpperCase() + id.slice(1);
}

/** Backend lint for these; Monaco handles JS/TS/CSS/HTML/JSON natively */
export function usesServerLint(filepath: string): boolean {
  const lang = monacoLanguageFromPath(filepath);
  return ["python", "yaml", "shell"].includes(lang);
}

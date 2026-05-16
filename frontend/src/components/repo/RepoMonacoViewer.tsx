import { useCallback, useEffect, useRef, useState } from "react";
import Editor, { type OnMount } from "@monaco-editor/react";
import type { editor } from "monaco-editor";
import { AlertCircle, CheckCircle2, CircleDashed, Loader2 } from "lucide-react";
import { lintStudentRepoFile, type StudentRepoLintDiagnostic } from "../../api/studentDashboardApi";
import { displayLanguageLabel, monacoLanguageFromPath, usesServerLint } from "../../utils/codeLanguage";
import type { ThemeColors } from "../../theme";

interface RepoMonacoViewerProps {
  repoId: string;
  filepath: string;
  content: string;
  isDarkTheme?: boolean;
  theme: ThemeColors;
}

type LintTone = "idle" | "loading" | "ok" | "warn" | "error" | "muted";

interface LintBarState {
  tone: LintTone;
  label: string;
  errors: number;
  warnings: number;
}

function severityToMonaco(
  monaco: typeof import("monaco-editor"),
  severity: string,
): number {
  if (severity === "warning") return monaco.MarkerSeverity.Warning;
  if (severity === "info") return monaco.MarkerSeverity.Info;
  return monaco.MarkerSeverity.Error;
}

function applyMarkers(
  editorInstance: editor.IStandaloneCodeEditor,
  monaco: typeof import("monaco-editor"),
  diagnostics: StudentRepoLintDiagnostic[],
  owner: string,
) {
  const model = editorInstance.getModel();
  if (!model) return;
  monaco.editor.setModelMarkers(
    model,
    owner,
    diagnostics.map((d) => ({
      startLineNumber: d.line,
      startColumn: d.column,
      endLineNumber: d.end_line,
      endColumn: d.end_column,
      message: d.message,
      severity: severityToMonaco(monaco, d.severity),
    })),
  );
}

function stateFromCounts(errors: number, warnings: number, skipped?: string | null): LintBarState {
  if (skipped) {
    return { tone: "muted", label: skipped, errors: 0, warnings: 0 };
  }
  if (errors > 0) {
    return {
      tone: "error",
      label: `${errors} ${errors === 1 ? "ошибка" : errors < 5 ? "ошибки" : "ошибок"}${
        warnings ? ` · ${warnings} предупр.` : ""
      }`,
      errors,
      warnings,
    };
  }
  if (warnings > 0) {
    return {
      tone: "warn",
      label: `${warnings} ${warnings === 1 ? "предупреждение" : "предупреждений"}`,
      errors: 0,
      warnings,
    };
  }
  return { tone: "ok", label: "Замечаний нет", errors: 0, warnings: 0 };
}

function LintStatusBar({ theme, state, languageLabel }: { theme: ThemeColors; state: LintBarState; languageLabel: string }) {
  const toneStyles: Record<LintTone, { bg: string; color: string; border: string }> = {
    idle: { bg: theme.bg4, color: theme.text3, border: theme.border },
    loading: { bg: theme.bg4, color: theme.text2, border: theme.border },
    ok: { bg: `${theme.success}12`, color: theme.success, border: `${theme.success}33` },
    warn: { bg: `${theme.warning}14`, color: theme.warning, border: `${theme.warning}40` },
    error: { bg: `${theme.danger}14`, color: theme.danger, border: `${theme.danger}40` },
    muted: { bg: theme.bg4, color: theme.text3, border: theme.border },
  };
  const s = toneStyles[state.tone];

  const Icon =
    state.tone === "loading"
      ? Loader2
      : state.tone === "ok"
        ? CheckCircle2
        : state.tone === "error" || state.tone === "warn"
          ? AlertCircle
          : CircleDashed;

  return (
    <div
      className="flex items-center justify-between gap-3 px-3 py-2 border-t text-xs shrink-0"
      style={{ borderColor: s.border, backgroundColor: s.bg }}
    >
      <span
        className="inline-flex items-center rounded-md border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide"
        style={{ borderColor: theme.border, color: theme.text2, backgroundColor: theme.bg3 }}
      >
        {languageLabel}
      </span>
      <span className="inline-flex items-center gap-1.5 min-w-0" style={{ color: s.color }}>
        <Icon
          className={`h-3.5 w-3.5 shrink-0 ${state.tone === "loading" ? "animate-spin" : ""}`}
          aria-hidden
        />
        <span className="truncate">{state.label}</span>
      </span>
    </div>
  );
}

export default function RepoMonacoViewer({
  repoId,
  filepath,
  content,
  isDarkTheme = false,
  theme,
}: RepoMonacoViewerProps) {
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<typeof import("monaco-editor") | null>(null);
  const [lintBar, setLintBar] = useState<LintBarState>({ tone: "idle", label: "—", errors: 0, warnings: 0 });

  const language = monacoLanguageFromPath(filepath);
  const languageLabel = displayLanguageLabel(filepath);
  const editorHeight = Math.min(640, Math.max(320, content.split("\n").length * 20 + 80));

  const updateFromMarkers = useCallback(
    (monaco: typeof import("monaco-editor"), editorInstance: editor.IStandaloneCodeEditor) => {
      const model = editorInstance.getModel();
      if (!model) return;
      const markers = monaco.editor.getModelMarkers({ resource: model.uri });
      const errors = markers.filter((m) => m.severity === monaco.MarkerSeverity.Error).length;
      const warnings = markers.filter((m) => m.severity === monaco.MarkerSeverity.Warning).length;
      setLintBar(stateFromCounts(errors, warnings));
    },
    [],
  );

  const runServerLint = useCallback(async () => {
    if (!usesServerLint(filepath) || !editorRef.current || !monacoRef.current) {
      return;
    }
    setLintBar({ tone: "loading", label: "Проверяем файл…", errors: 0, warnings: 0 });
    try {
      const res = await lintStudentRepoFile(repoId, filepath, content);
      applyMarkers(editorRef.current, monacoRef.current, res.diagnostics, "mtuci-lint");
      const errors = res.diagnostics.filter((d) => d.severity === "error").length;
      const warnings = res.diagnostics.length - errors;
      setLintBar(
        stateFromCounts(errors, warnings, res.skipped ? res.message ?? "Проверка пропущена" : null),
      );
    } catch {
      setLintBar({ tone: "muted", label: "Линтер недоступен", errors: 0, warnings: 0 });
    }
  }, [repoId, filepath, content]);

  const handleMount: OnMount = (editorInstance, monaco) => {
    editorRef.current = editorInstance;
    monacoRef.current = monaco;

    if (language === "json") {
      monaco.languages.json.jsonDefaults.setDiagnosticsOptions({
        validate: true,
        allowComments: false,
        schemas: [],
      });
    }

    if (usesServerLint(filepath)) {
      void runServerLint();
    } else {
      setLintBar({ tone: "loading", label: "Проверяем файл…", errors: 0, warnings: 0 });
      requestAnimationFrame(() => updateFromMarkers(monaco, editorInstance));
    }

    editorInstance.onDidChangeModelDecorations(() => {
      if (usesServerLint(filepath)) return;
      updateFromMarkers(monaco, editorInstance);
    });
  };

  useEffect(() => {
    if (!usesServerLint(filepath)) return;
    const t = window.setTimeout(() => void runServerLint(), 300);
    return () => window.clearTimeout(t);
  }, [filepath, content, runServerLint]);

  return (
    <div className="flex flex-col min-h-0">
      <Editor
        height={editorHeight}
        language={language}
        value={content}
        theme={isDarkTheme ? "vs-dark" : "vs"}
        onMount={handleMount}
        loading={
          <div className="flex items-center justify-center py-16 text-sm" style={{ color: theme.text2 }}>
            Редактор…
          </div>
        }
        options={{
          readOnly: true,
          domReadOnly: true,
          minimap: { enabled: content.length > 8000 },
          scrollBeyondLastLine: false,
          fontSize: 13,
          lineNumbers: "on",
          wordWrap: "on",
          automaticLayout: true,
          renderValidationDecorations: "on",
          padding: { top: 12, bottom: 12 },
        }}
      />
      <LintStatusBar theme={theme} state={lintBar} languageLabel={languageLabel} />
    </div>
  );
}

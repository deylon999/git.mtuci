import type { ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import SyntaxHighlighter from "react-syntax-highlighter/dist/esm/prism-async-light";
import { oneDark, oneLight } from "react-syntax-highlighter/dist/esm/styles/prism";
import bash from "react-syntax-highlighter/dist/esm/languages/prism/bash";
import c from "react-syntax-highlighter/dist/esm/languages/prism/c";
import cpp from "react-syntax-highlighter/dist/esm/languages/prism/cpp";
import csharp from "react-syntax-highlighter/dist/esm/languages/prism/csharp";
import css from "react-syntax-highlighter/dist/esm/languages/prism/css";
import java from "react-syntax-highlighter/dist/esm/languages/prism/java";
import javascript from "react-syntax-highlighter/dist/esm/languages/prism/javascript";
import json from "react-syntax-highlighter/dist/esm/languages/prism/json";
import jsx from "react-syntax-highlighter/dist/esm/languages/prism/jsx";
import markdown from "react-syntax-highlighter/dist/esm/languages/prism/markdown";
import python from "react-syntax-highlighter/dist/esm/languages/prism/python";
import sql from "react-syntax-highlighter/dist/esm/languages/prism/sql";
import tsx from "react-syntax-highlighter/dist/esm/languages/prism/tsx";
import typescript from "react-syntax-highlighter/dist/esm/languages/prism/typescript";
import type { ThemeColors } from "../theme";

SyntaxHighlighter.registerLanguage("bash", bash);
SyntaxHighlighter.registerLanguage("sh", bash);
SyntaxHighlighter.registerLanguage("c", c);
SyntaxHighlighter.registerLanguage("cpp", cpp);
SyntaxHighlighter.registerLanguage("csharp", csharp);
SyntaxHighlighter.registerLanguage("cs", csharp);
SyntaxHighlighter.registerLanguage("css", css);
SyntaxHighlighter.registerLanguage("java", java);
SyntaxHighlighter.registerLanguage("javascript", javascript);
SyntaxHighlighter.registerLanguage("js", javascript);
SyntaxHighlighter.registerLanguage("json", json);
SyntaxHighlighter.registerLanguage("jsx", jsx);
SyntaxHighlighter.registerLanguage("markdown", markdown);
SyntaxHighlighter.registerLanguage("md", markdown);
SyntaxHighlighter.registerLanguage("python", python);
SyntaxHighlighter.registerLanguage("py", python);
SyntaxHighlighter.registerLanguage("sql", sql);
SyntaxHighlighter.registerLanguage("typescript", typescript);
SyntaxHighlighter.registerLanguage("ts", typescript);
SyntaxHighlighter.registerLanguage("tsx", tsx);

interface RepoMarkdownProps {
  content: string;
  theme: ThemeColors;
}

export default function RepoMarkdown({ content, theme }: RepoMarkdownProps) {
  const flattenText = (node: ReactNode): string => {
    if (node == null) return "";
    if (typeof node === "string" || typeof node === "number") return String(node);
    if (Array.isArray(node)) return node.map(flattenText).join(" ");
    if (typeof node === "object" && "props" in (node as any)) {
      return flattenText((node as any).props?.children);
    }
    return "";
  };

  const headingToId = (children: ReactNode): string => {
    const text = flattenText(children)
      .toLowerCase()
      .replace(/[^\w\u0400-\u04ff\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-");
    return text || "section";
  };

  return (
    <div className="repo-markdown text-sm leading-relaxed max-w-none" style={{ color: theme.text }}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => (
            <h1
              id={headingToId(children)}
              className="text-2xl font-bold pb-2 mb-4 border-b"
              style={{ borderColor: theme.border, color: theme.text }}
            >
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 id={headingToId(children)} className="text-xl font-semibold mt-6 mb-3" style={{ color: theme.text }}>
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 id={headingToId(children)} className="text-base font-semibold mt-4 mb-2" style={{ color: theme.text }}>
              {children}
            </h3>
          ),
          p: ({ children }) => (
            <p className="my-3" style={{ color: theme.text2 }}>
              {children}
            </p>
          ),
          a: ({ href, children }) => (
            <a
              href={href}
              target={href?.startsWith("#") ? undefined : "_blank"}
              rel={href?.startsWith("#") ? undefined : "noopener noreferrer"}
              className="underline underline-offset-2 hover:opacity-90"
              style={{ color: theme.accent2 }}
            >
              {children}
            </a>
          ),
          ul: ({ children }) => (
            <ul className="my-3 pl-5 list-disc space-y-1" style={{ color: theme.text2 }}>
              {children}
            </ul>
          ),
          ol: ({ children }) => (
            <ol className="my-3 pl-5 list-decimal space-y-1" style={{ color: theme.text2 }}>
              {children}
            </ol>
          ),
          li: ({ children }) => <li className="leading-relaxed">{children}</li>,
          input: ({ type, checked, disabled }) => {
            if (type === "checkbox") {
              return (
                <input
                  type="checkbox"
                  checked={!!checked}
                  disabled={disabled ?? true}
                  readOnly
                  className="mr-2 align-middle"
                />
              );
            }
            return <input type={type} checked={checked} disabled={disabled} readOnly />;
          },
          blockquote: ({ children }) => (
            <blockquote
              className="my-4 pl-4 border-l-4 italic rounded-r-lg py-2 pr-3"
              style={{
                borderColor: theme.accent,
                backgroundColor: `${theme.accent}12`,
                color: theme.text2,
              }}
            >
              {children}
            </blockquote>
          ),
          code: ({ className, children, ...props }) => {
            const match = /language-(\w+)/.exec(className || "");
            if (match) {
              return (
                <SyntaxHighlighter
                  language={match[1]}
                  style={theme.bg === "#0f0f10" ? oneDark : oneLight}
                  customStyle={{ margin: 0, background: "transparent", padding: 0 }}
                  PreTag="div"
                >
                  {children}
                </SyntaxHighlighter>
              );
            }
            return (
              <code
                className="px-1.5 py-0.5 rounded text-xs font-mono"
                style={{ backgroundColor: theme.bg4, color: theme.accent2 }}
                {...props}
              >
                {children}
              </code>
            );
          },
          pre: ({ children }) => (
            <pre
              className="my-4 p-4 rounded-lg overflow-x-auto text-xs font-mono border"
              style={{
                backgroundColor: theme.bg,
                borderColor: theme.border,
                color: theme.text,
              }}
            >
              {children}
            </pre>
          ),
          table: ({ children }) => (
            <div className="my-4 overflow-x-auto rounded-lg border" style={{ borderColor: theme.border }}>
              <table className="w-full text-xs border-collapse">{children}</table>
            </div>
          ),
          th: ({ children }) => (
            <th
              className="px-3 py-2 text-left font-semibold border-b"
              style={{ borderColor: theme.border, backgroundColor: theme.bg4, color: theme.text }}
            >
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="px-3 py-2 border-b" style={{ borderColor: theme.borderLight, color: theme.text2 }}>
              {children}
            </td>
          ),
          hr: () => <hr className="my-6" style={{ borderColor: theme.border }} />,
          img: ({ src, alt }) => (
            <img
              src={src}
              alt={alt ?? ""}
              className="my-4 max-w-full rounded-lg border"
              style={{ borderColor: theme.border }}
            />
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

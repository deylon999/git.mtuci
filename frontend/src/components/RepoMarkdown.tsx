import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ThemeColors } from "../theme";

interface RepoMarkdownProps {
  content: string;
  theme: ThemeColors;
}

export default function RepoMarkdown({ content, theme }: RepoMarkdownProps) {
  return (
    <div className="repo-markdown text-sm leading-relaxed max-w-none" style={{ color: theme.text }}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => (
            <h1
              className="text-2xl font-bold pb-2 mb-4 border-b"
              style={{ borderColor: theme.border, color: theme.text }}
            >
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 className="text-xl font-semibold mt-6 mb-3" style={{ color: theme.text }}>
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="text-base font-semibold mt-4 mb-2" style={{ color: theme.text }}>
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
              target="_blank"
              rel="noopener noreferrer"
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
            const isBlock = className?.includes("language-");
            if (isBlock) {
              return (
                <code
                  className={`${className ?? ""} block text-xs font-mono leading-relaxed`}
                  {...props}
                >
                  {children}
                </code>
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

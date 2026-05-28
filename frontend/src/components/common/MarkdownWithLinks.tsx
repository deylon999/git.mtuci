import React from 'react';
import ReactMarkdown from 'react-markdown';
import { Link } from 'react-router-dom';
import { Box } from '@mui/material';

interface MarkdownWithLinksProps {
  content: string;
  repositoryOwner?: string;
  repositoryName?: string;
  repositoryId?: string;
}

/**
 * Render markdown with syntax highlighting and cross-links
 */
export const MarkdownWithLinks: React.FC<MarkdownWithLinksProps> = ({
  content,
  repositoryOwner,
  repositoryName,
  repositoryId,
}) => {
  const [syntaxHighlighter, setSyntaxHighlighter] = React.useState<
    React.ComponentType<any> | null
  >(null);
  const [syntaxStyle, setSyntaxStyle] = React.useState<any>(null);

  React.useEffect(() => {
    if (!/```|~~~/.test(content)) return;
    let cancelled = false;
    void (async () => {
      const [
        { default: PrismAsyncLight },
        prismStyles,
        { default: bash },
        { default: c },
        { default: cpp },
        { default: csharp },
        { default: css },
        { default: java },
        { default: javascript },
        { default: json },
        { default: jsx },
        { default: markdown },
        { default: python },
        { default: sql },
        { default: tsx },
        { default: typescript },
      ] = await Promise.all([
        import('react-syntax-highlighter/dist/esm/prism-async-light'),
        import('react-syntax-highlighter/dist/esm/styles/prism'),
        import('react-syntax-highlighter/dist/esm/languages/prism/bash'),
        import('react-syntax-highlighter/dist/esm/languages/prism/c'),
        import('react-syntax-highlighter/dist/esm/languages/prism/cpp'),
        import('react-syntax-highlighter/dist/esm/languages/prism/csharp'),
        import('react-syntax-highlighter/dist/esm/languages/prism/css'),
        import('react-syntax-highlighter/dist/esm/languages/prism/java'),
        import('react-syntax-highlighter/dist/esm/languages/prism/javascript'),
        import('react-syntax-highlighter/dist/esm/languages/prism/json'),
        import('react-syntax-highlighter/dist/esm/languages/prism/jsx'),
        import('react-syntax-highlighter/dist/esm/languages/prism/markdown'),
        import('react-syntax-highlighter/dist/esm/languages/prism/python'),
        import('react-syntax-highlighter/dist/esm/languages/prism/sql'),
        import('react-syntax-highlighter/dist/esm/languages/prism/tsx'),
        import('react-syntax-highlighter/dist/esm/languages/prism/typescript'),
      ]);
      if (cancelled) return;
      PrismAsyncLight.registerLanguage('bash', bash);
      PrismAsyncLight.registerLanguage('sh', bash);
      PrismAsyncLight.registerLanguage('c', c);
      PrismAsyncLight.registerLanguage('cpp', cpp);
      PrismAsyncLight.registerLanguage('csharp', csharp);
      PrismAsyncLight.registerLanguage('cs', csharp);
      PrismAsyncLight.registerLanguage('css', css);
      PrismAsyncLight.registerLanguage('java', java);
      PrismAsyncLight.registerLanguage('javascript', javascript);
      PrismAsyncLight.registerLanguage('js', javascript);
      PrismAsyncLight.registerLanguage('json', json);
      PrismAsyncLight.registerLanguage('jsx', jsx);
      PrismAsyncLight.registerLanguage('markdown', markdown);
      PrismAsyncLight.registerLanguage('md', markdown);
      PrismAsyncLight.registerLanguage('python', python);
      PrismAsyncLight.registerLanguage('py', python);
      PrismAsyncLight.registerLanguage('sql', sql);
      PrismAsyncLight.registerLanguage('tsx', tsx);
      PrismAsyncLight.registerLanguage('typescript', typescript);
      PrismAsyncLight.registerLanguage('ts', typescript);
      setSyntaxHighlighter(() => PrismAsyncLight);
      setSyntaxStyle((prismStyles as any).vscDarkPlus);
    })();
    return () => {
      cancelled = true;
    };
  }, [content]);

  const issueBase = repositoryId
    ? `/repositories/${repositoryId}/issues`
    : `/repositories/${repositoryOwner || ''}/${repositoryName || ''}/issues`;
  const commitBase = repositoryId
    ? `/repositories/${repositoryId}/commits`
    : `/repositories/${repositoryOwner || ''}/${repositoryName || ''}/commit`;
  // Process text nodes to add cross-links
  const processTextNode = (text: string): React.ReactNode => {
    // Match #123 for issues/PRs
    const issueRegex = /#(\d+)/g;
    // Match commit SHAs (7-40 hex characters)
    const commitRegex = /\b([0-9a-f]{7,40})\b/gi;

    const parts: React.ReactNode[] = [];
    let lastIndex = 0;
    const matches: Array<{ index: number; length: number; node: React.ReactNode }> = [];

    // Find all issue references
    let match;
    while ((match = issueRegex.exec(text)) !== null) {
      matches.push({
        index: match.index,
        length: match[0].length,
        node: (
          <Link
            key={`issue-${match.index}`}
            to={`${issueBase}/${match[1]}`}
            style={{ color: '#0969da', textDecoration: 'none' }}
          >
            {match[0]}
          </Link>
        ),
      });
    }

    // Find all commit references
    while ((match = commitRegex.exec(text)) !== null) {
      // Avoid matching inside issue references
      const isInsideIssue = matches.some(
        (m) => match.index >= m.index && match.index < m.index + m.length
      );
      if (!isInsideIssue) {
        matches.push({
          index: match.index,
          length: match[0].length,
          node: (
            <Link
              key={`commit-${match.index}`}
              to={`${commitBase}/${match[1]}`}
              style={{ color: '#0969da', textDecoration: 'none', fontFamily: 'monospace' }}
            >
              {match[1].substring(0, 7)}
            </Link>
          ),
        });
      }
    }

    // Sort by index
    matches.sort((a, b) => a.index - b.index);

    // Build the result
    matches.forEach((m) => {
      if (m.index > lastIndex) {
        parts.push(text.substring(lastIndex, m.index));
      }
      parts.push(m.node);
      lastIndex = m.index + m.length;
    });

    if (lastIndex < text.length) {
      parts.push(text.substring(lastIndex));
    }

    return parts.length > 0 ? <>{parts}</> : text;
  };

  return (
    <Box
      sx={{
        '& p': { mb: 2 },
        '& pre': { mb: 2 },
        '& ul, & ol': { mb: 2, pl: 3 },
        '& blockquote': {
          borderLeft: '4px solid',
          borderColor: 'divider',
          pl: 2,
          color: 'text.secondary',
          mb: 2,
        },
        '& code': {
          backgroundColor: 'grey.100',
          px: 0.5,
          py: 0.25,
          borderRadius: 0.5,
          fontFamily: 'monospace',
          fontSize: '0.875em',
        },
        '& a': {
          color: 'primary.main',
          textDecoration: 'none',
          '&:hover': {
            textDecoration: 'underline',
          },
        },
      }}
    >
      <ReactMarkdown
        components={{
          code({ node, inline, className, children, ...props }) {
            const match = /language-(\w+)/.exec(className || '');
            if (!inline && match) {
              const codeText = String(children).replace(/\n$/, '');
              if (syntaxHighlighter && syntaxStyle) {
                const Highlighter = syntaxHighlighter;
                return (
                  <Highlighter
                    style={syntaxStyle}
                    language={match[1]}
                    PreTag="div"
                    {...props}
                  >
                    {codeText}
                  </Highlighter>
                );
              }
              return (
                <pre
                  style={{
                    background: '#0d1117',
                    color: '#c9d1d9',
                    borderRadius: 6,
                    padding: '12px',
                    overflowX: 'auto',
                  }}
                >
                  <code className={className}>{codeText}</code>
                </pre>
              );
            }
            return (
              <code className={className} {...props}>
                {children}
              </code>
            )
          },
          p({ children }) {
            // Process text nodes for cross-links
            const processedChildren = React.Children.map(children, (child) => {
              if (typeof child === 'string') {
                return processTextNode(child);
              }
              return child;
            });
            return <p>{processedChildren}</p>;
          },
          li({ children }) {
            // Process text nodes for cross-links
            const processedChildren = React.Children.map(children, (child) => {
              if (typeof child === 'string') {
                return processTextNode(child);
              }
              return child;
            });
            return <li>{processedChildren}</li>;
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </Box>
  );
};

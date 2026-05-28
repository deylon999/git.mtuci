import React from 'react';
import { Link } from 'react-router-dom';

interface CrossLinkMatch {
  type: 'issue' | 'pr' | 'commit';
  number?: number;
  sha?: string;
  fullMatch: string;
}

/**
 * Parse text for cross-references:
 * - #123 -> issue/PR number
 * - commit SHA (7+ hex chars)
 */
export function parseCrossLinks(text: string): CrossLinkMatch[] {
  const matches: CrossLinkMatch[] = [];

  // Match #123 for issues/PRs
  const issueRegex = /#(\d+)/g;
  let match;
  while ((match = issueRegex.exec(text)) !== null) {
    matches.push({
      type: 'issue',
      number: parseInt(match[1], 10),
      fullMatch: match[0],
    });
  }

  // Match commit SHAs (7-40 hex characters, word boundary)
  const commitRegex = /\b([0-9a-f]{7,40})\b/gi;
  while ((match = commitRegex.exec(text)) !== null) {
    matches.push({
      type: 'commit',
      sha: match[1],
      fullMatch: match[0],
    });
  }

  return matches;
}

interface RenderCrossLinksProps {
  text: string;
  repositoryOwner: string;
  repositoryName: string;
}

/**
 * Render text with clickable cross-links
 */
export const RenderCrossLinks: React.FC<RenderCrossLinksProps> = ({
  text,
  repositoryOwner,
  repositoryName,
}) => {
  const matches = parseCrossLinks(text);

  if (matches.length === 0) {
    return <>{text}</>;
  }

  // Sort matches by position in text
  const sortedMatches = matches
    .map((m) => ({
      ...m,
      index: text.indexOf(m.fullMatch),
    }))
    .filter((m) => m.index !== -1)
    .sort((a, b) => a.index - b.index);

  const parts: React.ReactNode[] = [];
  let lastIndex = 0;

  sortedMatches.forEach((match, idx) => {
    // Add text before the match
    if (match.index > lastIndex) {
      parts.push(text.substring(lastIndex, match.index));
    }

    // Add the link
    if (match.type === 'issue' || match.type === 'pr') {
      parts.push(
        <Link
          key={`link-${idx}`}
          to={`/repositories/${repositoryOwner}/${repositoryName}/issues/${match.number}`}
          style={{ color: '#0969da', textDecoration: 'none' }}
          onMouseEnter={(e) => {
            e.currentTarget.style.textDecoration = 'underline';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.textDecoration = 'none';
          }}
        >
          {match.fullMatch}
        </Link>
      );
    } else if (match.type === 'commit') {
      parts.push(
        <Link
          key={`link-${idx}`}
          to={`/repositories/${repositoryOwner}/${repositoryName}/commit/${match.sha}`}
          style={{ color: '#0969da', textDecoration: 'none', fontFamily: 'monospace' }}
          onMouseEnter={(e) => {
            e.currentTarget.style.textDecoration = 'underline';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.textDecoration = 'none';
          }}
        >
          {match.sha?.substring(0, 7)}
        </Link>
      );
    }

    lastIndex = match.index + match.fullMatch.length;
  });

  // Add remaining text
  if (lastIndex < text.length) {
    parts.push(text.substring(lastIndex));
  }

  return <>{parts}</>;
};

/**
 * Hook to detect cross-links in text
 */
export function useCrossLinks(text: string) {
  return React.useMemo(() => parseCrossLinks(text), [text]);
}

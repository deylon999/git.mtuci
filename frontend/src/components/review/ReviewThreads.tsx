import React, { useState, useEffect } from 'react';
import {
  Box,
  Paper,
  Typography,
  Button,
  IconButton,
  TextField,
  Collapse,
  Chip,
  Alert,
} from '@mui/material';
import {
  CheckCircle as ResolveIcon,
  Undo as UnresolveIcon,
  Comment as CommentIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
} from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import {
  getThreads,
  updateThread,
  createThreadComment,
  getThreadComments,
  ReviewThread,
  ReviewComment,
  CreateCommentRequest,
} from '../../api/reviewsApi';

interface ReviewThreadsProps {
  repositoryId: string;
  pullNumber: number;
  onThreadsChange?: () => void;
}

export const ReviewThreads: React.FC<ReviewThreadsProps> = ({
  repositoryId,
  pullNumber,
  onThreadsChange,
}) => {
  const { t } = useTranslation();
  const [threads, setThreads] = useState<ReviewThread[]>([]);
  const [comments, setComments] = useState<Record<string, ReviewComment[]>>({});
  const [expandedThreads, setExpandedThreads] = useState<Set<string>>(new Set());
  const [replyText, setReplyText] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showResolved, setShowResolved] = useState(false);

  useEffect(() => {
    loadThreads();
  }, [repositoryId, pullNumber, showResolved]);

  const loadThreads = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await getThreads(repositoryId, pullNumber, showResolved ? undefined : false);
      setThreads(response.data);

      // Load comments for each thread
      for (const thread of response.data) {
        await loadThreadComments(thread.id);
      }
    } catch (err: any) {
      setError(err.response?.data?.detail || t('repo.review.threads.loadFailed', 'Failed to load threads'));
    } finally {
      setLoading(false);
    }
  };

  const loadThreadComments = async (threadId: string) => {
    try {
      const response = await getThreadComments(threadId);
      setComments((prev) => ({ ...prev, [threadId]: response.data }));
    } catch (err) {
      console.error('Failed to load comments:', err);
    }
  };

  const handleResolve = async (threadId: string, resolve: boolean) => {
    try {
      await updateThread(threadId, { is_resolved: resolve });
      await loadThreads();
      onThreadsChange?.();
    } catch (err: any) {
      setError(err.response?.data?.detail || t('repo.review.threads.updateFailed', 'Failed to update thread'));
    }
  };

  const handleReply = async (threadId: string) => {
    const text = replyText[threadId]?.trim();
    if (!text) return;

    try {
      const data: CreateCommentRequest = { body: text };
      await createThreadComment(threadId, data);
      await loadThreadComments(threadId);
      setReplyText((prev) => ({ ...prev, [threadId]: '' }));
    } catch (err: any) {
      setError(err.response?.data?.detail || t('repo.review.threads.commentFailed', 'Failed to add comment'));
    }
  };

  const toggleThread = (threadId: string) => {
    setExpandedThreads((prev) => {
      const next = new Set(prev);
      if (next.has(threadId)) {
        next.delete(threadId);
      } else {
        next.add(threadId);
      }
      return next;
    });
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h6">
          {t('repo.review.threads.title', 'Review Threads')}
        </Typography>
        <Button
          size="small"
          onClick={() => setShowResolved(!showResolved)}
          variant="outlined"
        >
          {showResolved
            ? t('repo.review.threads.hideResolved', 'Hide Resolved')
            : t('repo.review.threads.showResolved', 'Show Resolved')}
        </Button>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {threads.length === 0 && !loading && (
        <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 4 }}>
          {t('repo.review.threads.empty', 'No review threads')}
        </Typography>
      )}

      {threads.map((thread) => {
        const isExpanded = expandedThreads.has(thread.id);
        const threadComments = comments[thread.id] || [];

        return (
          <Paper key={thread.id} sx={{ mb: 2, p: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
              <Box sx={{ flexGrow: 1 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                  <Typography variant="subtitle2" sx={{ fontFamily: 'monospace' }}>
                    {thread.file_path}
                    {thread.line_number && `:${thread.line_number}`}
                  </Typography>
                  {thread.is_resolved && (
                    <Chip
                      label={t('repo.review.threads.resolved', 'Resolved')}
                      size="small"
                      color="success"
                      icon={<ResolveIcon />}
                    />
                  )}
                </Box>

                {thread.diff_hunk && (
                  <Box
                    sx={{
                      backgroundColor: 'grey.100',
                      p: 1,
                      borderRadius: 1,
                      fontFamily: 'monospace',
                      fontSize: '0.875rem',
                      whiteSpace: 'pre-wrap',
                      mb: 1,
                    }}
                  >
                    {thread.diff_hunk}
                  </Box>
                )}

                <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                  <Button
                    size="small"
                    startIcon={isExpanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                    onClick={() => toggleThread(thread.id)}
                  >
                    {threadComments.length} {t('repo.review.threads.comments', 'comments')}
                  </Button>
                  {!thread.is_resolved ? (
                    <Button
                      size="small"
                      startIcon={<ResolveIcon />}
                      onClick={() => handleResolve(thread.id, true)}
                      color="success"
                    >
                      {t('repo.review.threads.resolve', 'Resolve')}
                    </Button>
                  ) : (
                    <Button
                      size="small"
                      startIcon={<UnresolveIcon />}
                      onClick={() => handleResolve(thread.id, false)}
                    >
                      {t('repo.review.threads.unresolve', 'Unresolve')}
                    </Button>
                  )}
                </Box>
              </Box>
            </Box>

            <Collapse in={isExpanded}>
              <Box sx={{ mt: 2, pl: 2, borderLeft: '2px solid', borderColor: 'divider' }}>
                {threadComments.map((comment) => (
                  <Box key={comment.id} sx={{ mb: 2 }}>
                    <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                      {comment.body}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {new Date(comment.created_at).toLocaleString()}
                    </Typography>
                  </Box>
                ))}

                <Box sx={{ display: 'flex', gap: 1, mt: 2 }}>
                  <TextField
                    fullWidth
                    size="small"
                    placeholder={t('repo.review.threads.replyPlaceholder', 'Add a reply...')}
                    value={replyText[thread.id] || ''}
                    onChange={(e) =>
                      setReplyText((prev) => ({ ...prev, [thread.id]: e.target.value }))
                    }
                    multiline
                    rows={2}
                  />
                  <Button
                    variant="contained"
                    size="small"
                    onClick={() => handleReply(thread.id)}
                    disabled={!replyText[thread.id]?.trim()}
                  >
                    {t('common.reply', 'Reply')}
                  </Button>
                </Box>
              </Box>
            </Collapse>
          </Paper>
        );
      })}
    </Box>
  );
};

import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import {
  Box,
  Paper,
  Typography,
  Button,
  Chip,
  TextField,
  Divider,
  Alert,
  CircularProgress,
} from '@mui/material';
import {
  Close as CloseIcon,
  CheckCircle as CheckCircleIcon,
  Flag as MilestoneIcon,
} from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import {
  getIssueByNumber,
  updateIssue,
  createComment,
  getComments,
  Issue,
  IssueComment,
  IssueTimelineEvent,
  UpdateIssueRequest,
  CreateCommentRequest,
  getIssueTimeline,
} from '../../api/issuesApi';
import { MarkdownWithLinks } from '../common/MarkdownWithLinks';

export const IssueDetail: React.FC = () => {
  const { repoId, number } = useParams<{ repoId: string; number: string }>();
  const { t } = useTranslation();
  const [issue, setIssue] = useState<Issue | null>(null);
  const [comments, setComments] = useState<IssueComment[]>([]);
  const [timeline, setTimeline] = useState<IssueTimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [commentText, setCommentText] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (repoId && number) {
      void loadIssue();
    }
  }, [repoId, number]);

  useEffect(() => {
    if (issue?.id) {
      void loadComments();
    }
  }, [issue?.id]);

  const loadIssue = async () => {
    if (!repoId || !number) return;

    setLoading(true);
    setError(null);
    try {
      const response = await getIssueByNumber(repoId, parseInt(number, 10));
      setIssue(response.data);
      const timelineResp = await getIssueTimeline(repoId, parseInt(number, 10));
      setTimeline(timelineResp.data);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to load issue');
    } finally {
      setLoading(false);
    }
  };

  const loadComments = async () => {
    if (!issue?.id) return;

    try {
      const response = await getComments(issue.id);
      setComments(response.data);
    } catch (err) {
      console.error('Failed to load comments:', err);
    }
  };

  const handleStateChange = async (newState: 'open' | 'closed') => {
    if (!issue) return;

    try {
      const updateData: UpdateIssueRequest = { state: newState };
      await updateIssue(issue.id, updateData);
      await loadIssue();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to update issue');
    }
  };

  const handleAddComment = async () => {
    if (!issue || !commentText.trim()) return;

    setSubmitting(true);
    try {
      const data: CreateCommentRequest = { body: commentText };
      await createComment(issue.id, data);
      await loadComments();
      if (repoId && number) {
        const timelineResp = await getIssueTimeline(repoId, parseInt(number, 10));
        setTimeline(timelineResp.data);
      }
      setCommentText('');
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to add comment');
    } finally {
      setSubmitting(false);
    }
  };

  const getLabelColor = (color: string) => {
    const brightness = parseInt(color.slice(1), 16) > 0xffffff / 2;
    return brightness ? '#000' : '#fff';
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error || !issue) {
    return (
      <Alert severity="error" sx={{ m: 2 }}>
        {error || 'Issue not found'}
      </Alert>
    );
  }

  return (
    <Box sx={{ maxWidth: 1200, mx: 'auto', p: 3 }}>
      <Paper sx={{ p: 3 }}>
        {/* Header */}
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2, mb: 3 }}>
          <Box sx={{ flexGrow: 1 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
              <Typography variant="h5">
                {issue.title}
              </Typography>
              <Typography variant="h6" color="text.secondary">
                #{issue.number}
              </Typography>
            </Box>

            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
              {issue.state === 'open' ? (
                <Chip
                  icon={<CheckCircleIcon />}
                  label={t('repo.issues.open', 'Open')}
                  color="success"
                  size="small"
                />
              ) : (
                <Chip
                  icon={<CloseIcon />}
                  label={t('repo.issues.closed', 'Closed')}
                  color="default"
                  size="small"
                />
              )}

              {issue.labels.map((label) => (
                <Chip
                  key={label.id}
                  label={label.name}
                  size="small"
                  sx={{
                    backgroundColor: label.color,
                    color: getLabelColor(label.color),
                  }}
                />
              ))}

              {issue.milestone_id && (
                <Chip
                  icon={<MilestoneIcon />}
                  label="Milestone"
                  size="small"
                  variant="outlined"
                />
              )}
            </Box>
          </Box>

          <Box sx={{ display: 'flex', gap: 1 }}>
            {issue.state === 'open' ? (
              <Button
                startIcon={<CloseIcon />}
                onClick={() => handleStateChange('closed')}
                variant="outlined"
              >
                {t('repo.issues.close', 'Close')}
              </Button>
            ) : (
              <Button
                startIcon={<CheckCircleIcon />}
                onClick={() => handleStateChange('open')}
                variant="outlined"
                color="success"
              >
                {t('repo.issues.reopen', 'Reopen')}
              </Button>
            )}
          </Box>
        </Box>

        <Divider sx={{ mb: 3 }} />

        {/* Body with cross-links */}
        {issue.body && (
          <Box sx={{ mb: 3 }}>
            <MarkdownWithLinks
              content={issue.body}
              repositoryId={repoId}
            />
          </Box>
        )}

        {/* Metadata */}
        <Box sx={{ mb: 3 }}>
          <Typography variant="caption" color="text.secondary">
            Created {new Date(issue.created_at).toLocaleString()}
            {issue.assignees.length > 0 && (
              <> • Assigned to: {issue.assignees.map((a) => a.login).join(', ')}</>
            )}
          </Typography>
        </Box>

        <Divider sx={{ mb: 3 }} />

        <Typography variant="h6" sx={{ mb: 2 }}>
          Timeline ({timeline.length})
        </Typography>

        {timeline.map((ev) => (
          <Paper key={ev.id} variant="outlined" sx={{ p: 1.5, mb: 1.5 }}>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
              {ev.type} • {new Date(ev.created_at).toLocaleString()}
            </Typography>
            {ev.reference_type && ev.reference_value ? (
              <Typography variant="body2" sx={{ mt: 0.5 }}>
                {ev.reference_type}: {ev.reference_value}
                {ev.target_exists === false ? ' (not found)' : ''}
              </Typography>
            ) : null}
          </Paper>
        ))}

        <Divider sx={{ mb: 3 }} />

        {/* Comments */}
        <Typography variant="h6" sx={{ mb: 2 }}>
          {t('repo.issues.comments', 'Comments')} ({comments.length})
        </Typography>

        {comments.map((comment) => (
          <Paper key={comment.id} variant="outlined" sx={{ p: 2, mb: 2 }}>
            <MarkdownWithLinks
              content={comment.body}
              repositoryId={repoId}
            />
            <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
              {new Date(comment.created_at).toLocaleString()}
            </Typography>
          </Paper>
        ))}

        {/* Add comment */}
        <Box sx={{ mt: 3 }}>
          <TextField
            fullWidth
            multiline
            rows={4}
            placeholder={t('repo.issues.addComment', 'Add a comment...')}
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
            sx={{ mb: 2 }}
          />
          <Button
            variant="contained"
            onClick={handleAddComment}
            disabled={submitting || !commentText.trim()}
          >
            {t('common.comment', 'Comment')}
          </Button>
        </Box>
      </Paper>
    </Box>
  );
};

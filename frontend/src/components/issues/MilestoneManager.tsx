import React, { useState, useEffect } from 'react';
import {
  Box,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  IconButton,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  Typography,
  Alert,
  Chip,
  LinearProgress,
} from '@mui/material';
import { Edit as EditIcon, Delete as DeleteIcon, Add as AddIcon } from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import { getTheme } from '../../theme';
import {
  getMilestones,
  createMilestone,
  updateMilestone,
  deleteMilestone,
  IssueMilestone,
  CreateMilestoneRequest,
  UpdateMilestoneRequest,
} from '../../api/issuesApi';
import {
  issueDialogBackdropSx,
  issueDialogContentSx,
  issueDialogPaperSx,
  issueFieldSx,
  issueOutlinedButtonSx,
  issuePrimaryButtonSx,
  issueTextButtonSx,
} from './issueMuiStyles';

interface MilestoneManagerProps {
  repositoryId: string;
  open: boolean;
  onClose: () => void;
  onMilestonesChange?: () => void;
  isDarkTheme?: boolean;
}

export const MilestoneManager: React.FC<MilestoneManagerProps> = ({
  repositoryId,
  open,
  onClose,
  onMilestonesChange,
  isDarkTheme = false,
}) => {
  const { t } = useTranslation();
  const theme = getTheme(isDarkTheme);
  const [milestones, setMilestones] = useState<IssueMilestone[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingMilestone, setEditingMilestone] = useState<IssueMilestone | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [formData, setFormData] = useState<CreateMilestoneRequest>({
    title: '',
    description: '',
    state: 'open',
    due_date: undefined,
  });

  useEffect(() => {
    if (open) {
      loadMilestones();
    }
  }, [open, repositoryId]);

  const loadMilestones = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await getMilestones(repositoryId);
      setMilestones(response.data);
    } catch (err: any) {
      setError(err.response?.data?.detail || t('repo.issues.milestones.loadFailed', 'Failed to load milestones'));
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!formData.title.trim()) {
      setError(t('repo.issues.milestones.titleRequired', 'Milestone title is required'));
      return;
    }

    setLoading(true);
    setError(null);
    try {
      await createMilestone(repositoryId, formData);
      await loadMilestones();
      setIsCreating(false);
      setFormData({ title: '', description: '', state: 'open', due_date: undefined });
      onMilestonesChange?.();
    } catch (err: any) {
      setError(err.response?.data?.detail || t('repo.issues.milestones.createFailed', 'Failed to create milestone'));
    } finally {
      setLoading(false);
    }
  };

  const handleUpdate = async () => {
    if (!editingMilestone) return;

    setLoading(true);
    setError(null);
    try {
      const updateData: UpdateMilestoneRequest = {
        title: formData.title,
        description: formData.description,
        state: formData.state,
        due_date: formData.due_date,
      };
      await updateMilestone(editingMilestone.id, updateData);
      await loadMilestones();
      setEditingMilestone(null);
      setFormData({ title: '', description: '', state: 'open', due_date: undefined });
      onMilestonesChange?.();
    } catch (err: any) {
      setError(err.response?.data?.detail || t('repo.issues.milestones.updateFailed', 'Failed to update milestone'));
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (milestoneId: string) => {
    if (!confirm(t('repo.issues.milestones.deleteConfirm', 'Are you sure you want to delete this milestone?'))) return;

    setLoading(true);
    setError(null);
    try {
      await deleteMilestone(milestoneId);
      await loadMilestones();
      onMilestonesChange?.();
    } catch (err: any) {
      setError(err.response?.data?.detail || t('repo.issues.milestones.deleteFailed', 'Failed to delete milestone'));
    } finally {
      setLoading(false);
    }
  };

  const startEdit = (milestone: IssueMilestone) => {
    setEditingMilestone(milestone);
    setFormData({
      title: milestone.title,
      description: milestone.description || '',
      state: milestone.state,
      due_date: milestone.due_date,
    });
    setIsCreating(false);
  };

  const startCreate = () => {
    setIsCreating(true);
    setEditingMilestone(null);
    setFormData({ title: '', description: '', state: 'open', due_date: undefined });
  };

  const cancelEdit = () => {
    setIsCreating(false);
    setEditingMilestone(null);
    setFormData({ title: '', description: '', state: 'open', due_date: undefined });
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return null;
    return new Date(dateString).toLocaleDateString();
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      slotProps={{
        backdrop: { sx: issueDialogBackdropSx(isDarkTheme) },
        paper: { sx: issueDialogPaperSx(theme) },
      }}
    >
      <DialogTitle sx={{ color: theme.text }}>
        {t('repo.issues.milestones.manage', 'Manage Milestones')}
      </DialogTitle>
      <DialogContent sx={issueDialogContentSx(theme)}>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        {(isCreating || editingMilestone) && (
          <Box sx={{ mb: 3, p: 2, border: '1px solid', borderColor: theme.border, borderRadius: 1, bgcolor: theme.bg }}>
            <Typography variant="subtitle2" sx={{ mb: 2 }}>
              {editingMilestone
                ? t('repo.issues.milestones.edit', 'Edit Milestone')
                : t('repo.issues.milestones.create', 'Create Milestone')}
            </Typography>
            <TextField
              fullWidth
              label={t('repo.issues.milestones.title', 'Title')}
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              sx={issueFieldSx(theme, { mb: 2 })}
              required
            />
            <TextField
              fullWidth
              label={t('repo.issues.milestones.description', 'Description')}
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              multiline
              rows={3}
              sx={issueFieldSx(theme, { mb: 2 })}
            />
            <TextField
              fullWidth
              label={t('repo.issues.milestones.dueDate', 'Due Date')}
              type="date"
              value={formData.due_date ? formData.due_date.split('T')[0] : ''}
              onChange={(e) =>
                setFormData({ ...formData, due_date: e.target.value ? new Date(e.target.value).toISOString() : undefined })
              }
              InputLabelProps={{ shrink: true }}
              sx={issueFieldSx(theme, { mb: 2 })}
            />
            <Box sx={{ display: 'flex', gap: 1 }}>
              <Button onClick={cancelEdit} disabled={loading} sx={issueTextButtonSx(theme)}>
                {t('common.cancel', 'Cancel')}
              </Button>
              <Button
                variant="contained"
                onClick={editingMilestone ? handleUpdate : handleCreate}
                disabled={loading || !formData.title.trim()}
                sx={issuePrimaryButtonSx(theme)}
              >
                {editingMilestone ? t('common.save', 'Save') : t('common.create', 'Create')}
              </Button>
            </Box>
          </Box>
        )}

        {!isCreating && !editingMilestone && (
          <Button
            startIcon={<AddIcon />}
            onClick={startCreate}
            variant="outlined"
            sx={{ ...issueOutlinedButtonSx(theme), mb: 2 }}
          >
            {t('repo.issues.milestones.new', 'New Milestone')}
          </Button>
        )}

        <List sx={{ color: theme.text }}>
          {milestones.map((milestone) => (
            <ListItem key={milestone.id} divider sx={{ borderColor: theme.border }}>
              <ListItemText
                primary={
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Typography variant="subtitle1" sx={{ color: theme.text }}>{milestone.title}</Typography>
                    <Chip
                      label={milestone.state === 'open'
                        ? t('repo.issues.milestones.stateOpen', 'Open')
                        : t('repo.issues.milestones.stateClosed', 'Closed')}
                      size="small"
                      color={milestone.state === 'open' ? 'success' : 'default'}
                    />
                  </Box>
                }
                secondary={
                  <Box>
                    {milestone.description && (
                      <Typography variant="body2" sx={{ color: theme.text2 }}>
                        {milestone.description}
                      </Typography>
                    )}
                    {milestone.due_date && (
                      <Typography variant="caption" sx={{ color: theme.text2 }}>
                        {t('repo.issues.milestones.duePrefix', 'Due')}: {formatDate(milestone.due_date)}
                      </Typography>
                    )}
                  </Box>
                }
              />
              <ListItemSecondaryAction>
                <IconButton edge="end" onClick={() => startEdit(milestone)} sx={{ mr: 1, color: theme.text2 }}>
                  <EditIcon />
                </IconButton>
                <IconButton edge="end" onClick={() => handleDelete(milestone.id)} sx={{ color: theme.danger }}>
                  <DeleteIcon />
                </IconButton>
              </ListItemSecondaryAction>
            </ListItem>
          ))}
          {milestones.length === 0 && !loading && (
            <Typography variant="body2" sx={{ p: 2, textAlign: 'center', color: theme.text2 }}>
              {t('repo.issues.milestones.empty', 'No milestones yet')}
            </Typography>
          )}
        </List>
      </DialogContent>
      <DialogActions sx={{ borderTop: `1px solid ${theme.border}` }}>
        <Button onClick={onClose} sx={issueTextButtonSx(theme)}>
          {t('common.close', 'Close')}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

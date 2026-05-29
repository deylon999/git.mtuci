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
  Chip,
  Typography,
  Alert,
} from '@mui/material';
import { Edit as EditIcon, Delete as DeleteIcon, Add as AddIcon } from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import { getTheme } from '../../theme';
import {
  getLabels,
  createLabel,
  updateLabel,
  deleteLabel,
  IssueLabel,
  CreateLabelRequest,
  UpdateLabelRequest,
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

interface LabelManagerProps {
  repositoryId: string;
  open: boolean;
  onClose: () => void;
  onLabelsChange?: () => void;
  isDarkTheme?: boolean;
}

const DEFAULT_COLORS = [
  '#d73a4a', '#0075ca', '#cfd3d7', '#a2eeef', '#7057ff',
  '#008672', '#e4e669', '#d876e3', '#ffffff', '#000000',
];

export const LabelManager: React.FC<LabelManagerProps> = ({
  repositoryId,
  open,
  onClose,
  onLabelsChange,
  isDarkTheme = false,
}) => {
  const { t } = useTranslation();
  const theme = getTheme(isDarkTheme);
  const [labels, setLabels] = useState<IssueLabel[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingLabel, setEditingLabel] = useState<IssueLabel | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [formData, setFormData] = useState<CreateLabelRequest>({
    name: '',
    color: '#cccccc',
    description: '',
  });

  useEffect(() => {
    if (open) {
      loadLabels();
    }
  }, [open, repositoryId]);

  const loadLabels = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await getLabels(repositoryId);
      setLabels(response.data);
    } catch (err: any) {
      setError(err.response?.data?.detail || t('repo.issues.labels.loadFailed', 'Failed to load labels'));
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!formData.name.trim()) {
      setError(t('repo.issues.labels.nameRequired', 'Label name is required'));
      return;
    }

    setLoading(true);
    setError(null);
    try {
      await createLabel(repositoryId, formData);
      await loadLabels();
      setIsCreating(false);
      setFormData({ name: '', color: '#cccccc', description: '' });
      onLabelsChange?.();
    } catch (err: any) {
      setError(err.response?.data?.detail || t('repo.issues.labels.createFailed', 'Failed to create label'));
    } finally {
      setLoading(false);
    }
  };

  const handleUpdate = async () => {
    if (!editingLabel) return;

    setLoading(true);
    setError(null);
    try {
      const updateData: UpdateLabelRequest = {
        name: formData.name,
        color: formData.color,
        description: formData.description,
      };
      await updateLabel(editingLabel.id, updateData);
      await loadLabels();
      setEditingLabel(null);
      setFormData({ name: '', color: '#cccccc', description: '' });
      onLabelsChange?.();
    } catch (err: any) {
      setError(err.response?.data?.detail || t('repo.issues.labels.updateFailed', 'Failed to update label'));
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (labelId: string) => {
    if (!confirm(t('repo.issues.labels.deleteConfirm', 'Are you sure you want to delete this label?'))) return;

    setLoading(true);
    setError(null);
    try {
      await deleteLabel(labelId);
      await loadLabels();
      onLabelsChange?.();
    } catch (err: any) {
      setError(err.response?.data?.detail || t('repo.issues.labels.deleteFailed', 'Failed to delete label'));
    } finally {
      setLoading(false);
    }
  };

  const startEdit = (label: IssueLabel) => {
    setEditingLabel(label);
    setFormData({
      name: label.name,
      color: label.color,
      description: label.description || '',
    });
    setIsCreating(false);
  };

  const startCreate = () => {
    setIsCreating(true);
    setEditingLabel(null);
    setFormData({ name: '', color: '#cccccc', description: '' });
  };

  const cancelEdit = () => {
    setIsCreating(false);
    setEditingLabel(null);
    setFormData({ name: '', color: '#cccccc', description: '' });
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
        {t('repo.issues.labels.manage', 'Manage Labels')}
      </DialogTitle>
      <DialogContent sx={issueDialogContentSx(theme)}>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        {(isCreating || editingLabel) && (
          <Box sx={{ mb: 3, p: 2, border: '1px solid', borderColor: theme.border, borderRadius: 1, bgcolor: theme.bg }}>
            <Typography variant="subtitle2" sx={{ mb: 2 }}>
              {editingLabel ? t('repo.issues.labels.edit', 'Edit Label') : t('repo.issues.labels.create', 'Create Label')}
            </Typography>
            <TextField
              fullWidth
              label={t('repo.issues.labels.name', 'Name')}
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              sx={issueFieldSx(theme, { mb: 2 })}
              required
            />
            <TextField
              fullWidth
              label={t('repo.issues.labels.description', 'Description')}
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              multiline
              rows={2}
              sx={issueFieldSx(theme, { mb: 2 })}
            />
            <Box sx={{ mb: 2 }}>
              <Typography variant="body2" sx={{ mb: 1 }}>
                {t('repo.issues.labels.color', 'Color')}
              </Typography>
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 1 }}>
                {DEFAULT_COLORS.map((color) => (
                  <Box
                    key={color}
                    onClick={() => setFormData({ ...formData, color })}
                    sx={{
                      width: 32,
                      height: 32,
                      backgroundColor: color,
                      border: formData.color === color ? '3px solid' : '1px solid',
                      borderColor: formData.color === color ? theme.accent2 : theme.border,
                      borderRadius: 1,
                      cursor: 'pointer',
                      '&:hover': { opacity: 0.8 },
                    }}
                  />
                ))}
              </Box>
              <TextField
                fullWidth
                label={t('repo.issues.labels.customColor', 'Custom Color (hex)')}
                value={formData.color}
                onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                placeholder="#cccccc"
                sx={issueFieldSx(theme)}
              />
            </Box>
            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
              <Chip
                label={formData.name || t('repo.issues.labels.preview', 'Preview')}
                sx={{
                  backgroundColor: formData.color,
                  color: parseInt(formData.color.slice(1), 16) > 0xffffff / 2 ? '#000' : '#fff',
                }}
              />
              <Box sx={{ flexGrow: 1 }} />
              <Button onClick={cancelEdit} disabled={loading} sx={issueTextButtonSx(theme)}>
                {t('common.cancel', 'Cancel')}
              </Button>
              <Button
                variant="contained"
                onClick={editingLabel ? handleUpdate : handleCreate}
                disabled={loading || !formData.name.trim()}
                sx={issuePrimaryButtonSx(theme)}
              >
                {editingLabel ? t('common.save', 'Save') : t('common.create', 'Create')}
              </Button>
            </Box>
          </Box>
        )}

        {!isCreating && !editingLabel && (
          <Button
            startIcon={<AddIcon />}
            onClick={startCreate}
            variant="outlined"
            sx={{ ...issueOutlinedButtonSx(theme), mb: 2 }}
          >
            {t('repo.issues.labels.new', 'New Label')}
          </Button>
        )}

        <List sx={{ color: theme.text }}>
          {labels.map((label) => (
            <ListItem key={label.id} divider sx={{ borderColor: theme.border }}>
              <ListItemText
                primary={
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Chip
                      label={label.name}
                      size="small"
                      sx={{
                        backgroundColor: label.color,
                        color: parseInt(label.color.slice(1), 16) > 0xffffff / 2 ? '#000' : '#fff',
                      }}
                    />
                  </Box>
                }
                secondary={label.description}
                secondaryTypographyProps={{ sx: { color: theme.text2 } }}
              />
              <ListItemSecondaryAction>
                <IconButton edge="end" onClick={() => startEdit(label)} sx={{ mr: 1, color: theme.text2 }}>
                  <EditIcon />
                </IconButton>
                <IconButton edge="end" onClick={() => handleDelete(label.id)} sx={{ color: theme.danger }}>
                  <DeleteIcon />
                </IconButton>
              </ListItemSecondaryAction>
            </ListItem>
          ))}
          {labels.length === 0 && !loading && (
            <Typography variant="body2" sx={{ p: 2, textAlign: 'center', color: theme.text2 }}>
              {t('repo.issues.labels.empty', 'No labels yet')}
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

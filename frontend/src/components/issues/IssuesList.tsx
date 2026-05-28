import React, { useState, useEffect } from 'react';
import {
  Box,
  Button,
  TextField,
  Typography,
  Paper,
  List,
  ListItem,
  ListItemText,
  Chip,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  OutlinedInput,
  Autocomplete,
  Tabs,
  Tab,
  Alert,
} from '@mui/material';
import {
  Add as AddIcon,
  Label as LabelIcon,
  Flag as MilestoneIcon,
  Close as CloseIcon,
  CheckCircle as CheckCircleIcon,
} from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import {
  getIssues,
  createIssue,
  updateIssue,
  getLabels,
  getMilestones,
  IssueListItem,
  IssueLabel,
  IssueMilestone,
  CreateIssueRequest,
  UpdateIssueRequest,
} from '../../api/issuesApi';
import { LabelManager } from './LabelManager';
import { MilestoneManager } from './MilestoneManager';

interface IssuesListProps {
  repositoryId: string;
}

export const IssuesList: React.FC<IssuesListProps> = ({
  repositoryId,
}) => {
  const { t } = useTranslation();
  const [issues, setIssues] = useState<IssueListItem[]>([]);
  const [labels, setLabels] = useState<IssueLabel[]>([]);
  const [milestones, setMilestones] = useState<IssueMilestone[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [labelManagerOpen, setLabelManagerOpen] = useState(false);
  const [milestoneManagerOpen, setMilestoneManagerOpen] = useState(false);
  const [stateFilter, setStateFilter] = useState<'open' | 'closed' | 'all'>('open');
  const [searchQuery, setSearchQuery] = useState('');
  const [formData, setFormData] = useState<CreateIssueRequest>({
    title: '',
    body: '',
    label_ids: [],
    assignee_ids: [],
    milestone_id: undefined,
  });

  useEffect(() => {
    loadIssues();
    loadLabels();
    loadMilestones();
  }, [repositoryId, stateFilter, searchQuery]);

  const loadIssues = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = {
        ...(stateFilter === 'all' ? {} : { state: stateFilter }),
        ...(searchQuery.trim() ? { q: searchQuery.trim() } : {}),
      };
      const response = await getIssues(repositoryId, params);
      setIssues(response.data);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to load issues');
    } finally {
      setLoading(false);
    }
  };

  const loadLabels = async () => {
    try {
      const response = await getLabels(repositoryId);
      setLabels(response.data);
    } catch (err) {
      console.error('Failed to load labels:', err);
    }
  };

  const loadMilestones = async () => {
    try {
      const response = await getMilestones(repositoryId);
      setMilestones(response.data);
    } catch (err) {
      console.error('Failed to load milestones:', err);
    }
  };

  const handleCreate = async () => {
    if (!formData.title.trim()) {
      setError('Issue title is required');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      await createIssue(repositoryId, formData);
      await loadIssues();
      setCreateDialogOpen(false);
      setFormData({
        title: '',
        body: '',
        label_ids: [],
        assignee_ids: [],
        milestone_id: undefined,
      });
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to create issue');
    } finally {
      setLoading(false);
    }
  };

  const handleStateChange = async (issueId: string, newState: 'open' | 'closed') => {
    try {
      const updateData: UpdateIssueRequest = { state: newState };
      await updateIssue(issueId, updateData);
      await loadIssues();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to update issue');
    }
  };

  const getLabelColor = (color: string) => {
    const brightness = parseInt(color.slice(1), 16) > 0xffffff / 2;
    return brightness ? '#000' : '#fff';
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h5">
          {t('repo.issues.title', 'Issues')}
        </Typography>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button
            startIcon={<LabelIcon />}
            onClick={() => setLabelManagerOpen(true)}
            variant="outlined"
            size="small"
          >
            {t('repo.issues.labels.manage', 'Labels')}
          </Button>
          <Button
            startIcon={<MilestoneIcon />}
            onClick={() => setMilestoneManagerOpen(true)}
            variant="outlined"
            size="small"
          >
            {t('repo.issues.milestones.manage', 'Milestones')}
          </Button>
          <Button
            startIcon={<AddIcon />}
            onClick={() => setCreateDialogOpen(true)}
            variant="contained"
          >
            {t('repo.issues.new', 'New Issue')}
          </Button>
        </Box>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      <Tabs value={stateFilter} onChange={(_, v) => setStateFilter(v)} sx={{ mb: 2 }}>
        <Tab label={t('repo.issues.open', 'Open')} value="open" />
        <Tab label={t('repo.issues.closed', 'Closed')} value="closed" />
        <Tab label={t('repo.issues.all', 'All')} value="all" />
      </Tabs>

      <TextField
        fullWidth
        size="small"
        placeholder={t('repo.issues.search', 'Search issues by title or description')}
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        sx={{ mb: 2 }}
      />

      <List>
        {issues.map((issue) => (
          <Paper key={issue.id} sx={{ mb: 1 }}>
            <ListItem>
              <ListItemText
                primary={
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    {issue.state === 'open' ? (
                      <CheckCircleIcon color="success" fontSize="small" />
                    ) : (
                      <CloseIcon color="disabled" fontSize="small" />
                    )}
                    <Typography variant="subtitle1">
                      #{issue.number} {issue.title}
                    </Typography>
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
                  </Box>
                }
                secondary={
                  <Typography variant="caption" color="text.secondary">
                    {new Date(issue.created_at).toLocaleDateString()}
                    {issue.assignees.length > 0 && (
                      <> • Assigned to: {issue.assignees.map((a) => a.login).join(', ')}</>
                    )}
                  </Typography>
                }
              />
              <IconButton
                onClick={() => handleStateChange(issue.id, issue.state === 'open' ? 'closed' : 'open')}
                size="small"
              >
                {issue.state === 'open' ? <CloseIcon /> : <CheckCircleIcon />}
              </IconButton>
            </ListItem>
          </Paper>
        ))}
        {issues.length === 0 && !loading && (
          <Typography variant="body2" color="text.secondary" sx={{ p: 2, textAlign: 'center' }}>
            {t('repo.issues.empty', 'No issues found')}
          </Typography>
        )}
      </List>

      {/* Create Issue Dialog */}
      <Dialog open={createDialogOpen} onClose={() => setCreateDialogOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>{t('repo.issues.create', 'Create Issue')}</DialogTitle>
        <DialogContent>
          <TextField
            fullWidth
            label={t('repo.issues.form.title', 'Title')}
            value={formData.title}
            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
            sx={{ mt: 2, mb: 2 }}
            required
          />
          <TextField
            fullWidth
            label={t('repo.issues.form.description', 'Description')}
            value={formData.body}
            onChange={(e) => setFormData({ ...formData, body: e.target.value })}
            multiline
            rows={6}
            sx={{ mb: 2 }}
          />
          <Autocomplete
            multiple
            options={labels}
            getOptionLabel={(option) => option.name}
            value={labels.filter((l) => formData.label_ids?.includes(l.id))}
            onChange={(_, newValue) =>
              setFormData({ ...formData, label_ids: newValue.map((l) => l.id) })
            }
            renderInput={(params) => (
              <TextField {...params} label={t('repo.issues.form.labels', 'Labels')} />
            )}
            renderTags={(value, getTagProps) =>
              value.map((option, index) => (
                <Chip
                  {...getTagProps({ index })}
                  key={option.id}
                  label={option.name}
                  size="small"
                  sx={{
                    backgroundColor: option.color,
                    color: getLabelColor(option.color),
                  }}
                />
              ))
            }
            sx={{ mb: 2 }}
          />
          <FormControl fullWidth sx={{ mb: 2 }}>
            <InputLabel>{t('repo.issues.form.milestone', 'Milestone')}</InputLabel>
            <Select
              value={formData.milestone_id || ''}
              onChange={(e) =>
                setFormData({ ...formData, milestone_id: e.target.value || undefined })
              }
              label={t('repo.issues.form.milestone', 'Milestone')}
            >
              <MenuItem value="">
                <em>{t('common.none', 'None')}</em>
              </MenuItem>
              {milestones
                .filter((m) => m.state === 'open')
                .map((milestone) => (
                  <MenuItem key={milestone.id} value={milestone.id}>
                    {milestone.title}
                  </MenuItem>
                ))}
            </Select>
          </FormControl>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateDialogOpen(false)}>
            {t('common.cancel', 'Cancel')}
          </Button>
          <Button
            variant="contained"
            onClick={handleCreate}
            disabled={loading || !formData.title.trim()}
          >
            {t('common.create', 'Create')}
          </Button>
        </DialogActions>
      </Dialog>

      <LabelManager
        repositoryId={repositoryId}
        open={labelManagerOpen}
        onClose={() => setLabelManagerOpen(false)}
        onLabelsChange={loadLabels}
      />

      <MilestoneManager
        repositoryId={repositoryId}
        open={milestoneManagerOpen}
        onClose={() => setMilestoneManagerOpen(false)}
        onMilestonesChange={loadMilestones}
      />
    </Box>
  );
};

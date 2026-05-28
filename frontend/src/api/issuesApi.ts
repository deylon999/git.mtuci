import api from './index';

export interface IssueLabel {
  id: string;
  repository_id: string;
  name: string;
  color: string;
  description?: string;
  created_at: string;
  updated_at: string;
}

export interface IssueMilestone {
  id: string;
  repository_id: string;
  title: string;
  description?: string;
  state: 'open' | 'closed';
  due_date?: string;
  created_at: string;
  updated_at: string;
  closed_at?: string;
}

export interface IssueUser {
  id: string;
  login: string;
  full_name?: string;
  avatar_url?: string;
}

export interface Issue {
  id: string;
  repository_id: string;
  number: number;
  title: string;
  body?: string;
  state: 'open' | 'closed';
  author_id?: string;
  milestone_id?: string;
  locked: boolean;
  created_at: string;
  updated_at: string;
  closed_at?: string;
  labels: IssueLabel[];
  assignees: IssueUser[];
}

export interface IssueListItem {
  id: string;
  repository_id: string;
  number: number;
  title: string;
  state: 'open' | 'closed';
  author_id?: string;
  created_at: string;
  updated_at: string;
  labels: IssueLabel[];
  assignees: IssueUser[];
}

export interface IssueComment {
  id: string;
  issue_id: string;
  author_id?: string;
  body: string;
  created_at: string;
  updated_at: string;
}

export interface IssueReaction {
  id: string;
  issue_id?: string;
  comment_id?: string;
  user_id: string;
  reaction: string;
  created_at: string;
}

export interface IssueTimelineEvent {
  id: string;
  type: 'created' | 'comment' | 'cross_reference' | string;
  created_at: string;
  author_id?: string | null;
  author_login?: string | null;
  body?: string | null;
  reference_type?: 'issue' | 'pr' | 'commit' | string | null;
  reference_value?: string | null;
  target_exists?: boolean | null;
  target_url?: string | null;
}

export interface CreateLabelRequest {
  name: string;
  color?: string;
  description?: string;
}

export interface UpdateLabelRequest {
  name?: string;
  color?: string;
  description?: string;
}

export interface CreateMilestoneRequest {
  title: string;
  description?: string;
  state?: 'open' | 'closed';
  due_date?: string;
}

export interface UpdateMilestoneRequest {
  title?: string;
  description?: string;
  state?: 'open' | 'closed';
  due_date?: string;
}

export interface CreateIssueRequest {
  title: string;
  body?: string;
  label_ids?: string[];
  assignee_ids?: string[];
  milestone_id?: string;
}

export interface UpdateIssueRequest {
  title?: string;
  body?: string;
  state?: 'open' | 'closed';
  label_ids?: string[];
  assignee_ids?: string[];
  milestone_id?: string;
  locked?: boolean;
}

export interface CreateCommentRequest {
  body: string;
}

export interface UpdateCommentRequest {
  body: string;
}

export interface CreateReactionRequest {
  reaction: string;
}

// Labels
export const createLabel = (repositoryId: string, data: CreateLabelRequest) =>
  api.post<IssueLabel>(`/repositories/${repositoryId}/labels`, data);

export const getLabels = (repositoryId: string) =>
  api.get<IssueLabel[]>(`/repositories/${repositoryId}/labels`);

export const getLabel = (labelId: string) =>
  api.get<IssueLabel>(`/labels/${labelId}`);

export const updateLabel = (labelId: string, data: UpdateLabelRequest) =>
  api.patch<IssueLabel>(`/labels/${labelId}`, data);

export const deleteLabel = (labelId: string) =>
  api.delete(`/labels/${labelId}`);

// Milestones
export const createMilestone = (repositoryId: string, data: CreateMilestoneRequest) =>
  api.post<IssueMilestone>(`/repositories/${repositoryId}/milestones`, data);

export const getMilestones = (repositoryId: string, state?: 'open' | 'closed') =>
  api.get<IssueMilestone[]>(`/repositories/${repositoryId}/milestones`, { params: { state } });

export const getMilestone = (milestoneId: string) =>
  api.get<IssueMilestone>(`/milestones/${milestoneId}`);

export const updateMilestone = (milestoneId: string, data: UpdateMilestoneRequest) =>
  api.patch<IssueMilestone>(`/milestones/${milestoneId}`, data);

export const deleteMilestone = (milestoneId: string) =>
  api.delete(`/milestones/${milestoneId}`);

// Issues
export const createIssue = (repositoryId: string, data: CreateIssueRequest) =>
  api.post<Issue>(`/repositories/${repositoryId}/issues`, data);

export const getIssues = (
  repositoryId: string,
  params?: {
    state?: 'open' | 'closed';
    author_id?: string;
    assignee_id?: string;
    milestone_id?: string;
    q?: string;
  }
) =>
  api.get<IssueListItem[]>(`/repositories/${repositoryId}/issues`, { params });

export const getIssueByNumber = (repositoryId: string, number: number) =>
  api.get<Issue>(`/repositories/${repositoryId}/issues/${number}`);

export const getIssueTimeline = (repositoryId: string, number: number) =>
  api.get<IssueTimelineEvent[]>(`/repositories/${repositoryId}/issues/${number}/timeline`);

export const updateIssue = (issueId: string, data: UpdateIssueRequest) =>
  api.patch<Issue>(`/issues/${issueId}`, data);

export const deleteIssue = (issueId: string) =>
  api.delete(`/issues/${issueId}`);

// Comments
export const createComment = (issueId: string, data: CreateCommentRequest) =>
  api.post<IssueComment>(`/issues/${issueId}/comments`, data);

export const getComments = (issueId: string) =>
  api.get<IssueComment[]>(`/issues/${issueId}/comments`);

export const updateComment = (commentId: string, data: UpdateCommentRequest) =>
  api.patch<IssueComment>(`/comments/${commentId}`, data);

export const deleteComment = (commentId: string) =>
  api.delete(`/comments/${commentId}`);

// Reactions
export const addIssueReaction = (issueId: string, data: CreateReactionRequest) =>
  api.post<IssueReaction>(`/issues/${issueId}/reactions`, data);

export const addCommentReaction = (commentId: string, data: CreateReactionRequest) =>
  api.post<IssueReaction>(`/comments/${commentId}/reactions`, data);

export const getIssueReactions = (issueId: string) =>
  api.get<IssueReaction[]>(`/issues/${issueId}/reactions`);

export const deleteReaction = (reactionId: string) =>
  api.delete(`/reactions/${reactionId}`);

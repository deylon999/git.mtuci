import api from './index';

export interface PullRequestReview {
  id: string;
  pull_request_id: string;
  reviewer_id?: string;
  state: 'approved' | 'changes_requested' | 'commented';
  body?: string;
  commit_sha?: string;
  created_at: string;
  updated_at: string;
}

export interface ReviewThread {
  id: string;
  pull_request_id: string;
  review_id?: string;
  file_path: string;
  line_number?: number;
  diff_hunk?: string;
  is_resolved: boolean;
  resolved_by_id?: string;
  resolved_at?: string;
  created_at: string;
  updated_at: string;
}

export interface ReviewComment {
  id: string;
  thread_id: string;
  author_id?: string;
  body: string;
  created_at: string;
  updated_at: string;
}

export interface CreateReviewRequest {
  state: 'approved' | 'changes_requested' | 'commented';
  body?: string;
  commit_sha?: string;
}

export interface CreateThreadRequest {
  review_id?: string;
  file_path: string;
  line_number?: number;
  diff_hunk?: string;
}

export interface UpdateThreadRequest {
  is_resolved: boolean;
}

export interface CreateCommentRequest {
  body: string;
}

export interface UpdateCommentRequest {
  body: string;
}

// Reviews
export const createReview = (repositoryId: string, pullNumber: number, data: CreateReviewRequest) =>
  api.post<PullRequestReview>(`/repositories/${repositoryId}/pulls/${pullNumber}/reviews`, data);

export const getReviews = (repositoryId: string, pullNumber: number) =>
  api.get<PullRequestReview[]>(`/repositories/${repositoryId}/pulls/${pullNumber}/reviews`);

export const getReview = (reviewId: string) =>
  api.get<PullRequestReview>(`/reviews/${reviewId}`);

// Threads
export const createThread = (repositoryId: string, pullNumber: number, data: CreateThreadRequest) =>
  api.post<ReviewThread>(`/repositories/${repositoryId}/pulls/${pullNumber}/threads`, data);

export const getThreads = (repositoryId: string, pullNumber: number, resolved?: boolean) =>
  api.get<ReviewThread[]>(`/repositories/${repositoryId}/pulls/${pullNumber}/threads`, { params: { resolved } });

export const getThread = (threadId: string) =>
  api.get<ReviewThread>(`/threads/${threadId}`);

export const updateThread = (threadId: string, data: UpdateThreadRequest) =>
  api.patch<ReviewThread>(`/threads/${threadId}`, data);

export const deleteThread = (threadId: string) =>
  api.delete(`/threads/${threadId}`);

// Comments
export const createThreadComment = (threadId: string, data: CreateCommentRequest) =>
  api.post<ReviewComment>(`/threads/${threadId}/comments`, data);

export const getThreadComments = (threadId: string) =>
  api.get<ReviewComment[]>(`/threads/${threadId}/comments`);

export const updateThreadComment = (commentId: string, data: UpdateCommentRequest) =>
  api.patch<ReviewComment>(`/comments/${commentId}`, data);

export const deleteThreadComment = (commentId: string) =>
  api.delete(`/comments/${commentId}`);

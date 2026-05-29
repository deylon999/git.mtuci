import React from 'react';
import { useParams } from 'react-router-dom';
import { Box } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { ReviewThreads } from '../components/review/ReviewThreads';

interface ReviewsPageProps {
  isDarkTheme?: boolean;
}

export const ReviewsPage: React.FC<ReviewsPageProps> = ({ isDarkTheme }) => {
  const { repoId, prNumber } = useParams<{ repoId: string; prNumber: string }>();
  const { t } = useTranslation();

  if (!repoId || !prNumber) {
    return <Box sx={{ p: 3 }}>{t('repo.review.notFound', 'Pull request not found')}</Box>;
  }
  const prNum = Number.parseInt(prNumber, 10);
  if (!Number.isFinite(prNum) || prNum <= 0) {
    return <Box sx={{ p: 3 }}>{t('repo.review.notFound', 'Pull request not found')}</Box>;
  }

  return (
    <Box sx={{ p: 3 }}>
      <ReviewThreads repositoryId={repoId} pullNumber={prNum} />
    </Box>
  );
};

export default ReviewsPage;

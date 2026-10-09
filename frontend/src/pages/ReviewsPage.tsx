import React from 'react';
import { useParams } from 'react-router-dom';
import { Box } from '@mui/material';
import { useUserPreferences } from '../context/UserPreferencesContext';
import { ReviewThreads } from '../components/review/ReviewThreads';
import MuiThemeScope from '../components/common/MuiThemeScope';

interface ReviewsPageProps {
  isDarkTheme?: boolean;
}

export const ReviewsPage: React.FC<ReviewsPageProps> = ({ isDarkTheme = false }) => {
  const { repoId, prNumber } = useParams<{ repoId: string; prNumber: string }>();
  const { t } = useUserPreferences();

  if (!repoId || !prNumber) {
    return <Box sx={{ p: 3 }}>{t('repo.review.notFound')}</Box>;
  }
  const prNum = Number.parseInt(prNumber, 10);
  if (!Number.isFinite(prNum) || prNum <= 0) {
    return <Box sx={{ p: 3 }}>{t('repo.review.notFound')}</Box>;
  }

  return (
    <MuiThemeScope isDarkTheme={isDarkTheme}>
      <Box sx={{ p: 3 }}>
        <ReviewThreads repositoryId={repoId} pullNumber={prNum} />
      </Box>
    </MuiThemeScope>
  );
};

export default ReviewsPage;

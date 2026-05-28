import React from 'react';
import { useParams } from 'react-router-dom';
import { Box } from '@mui/material';
import { IssuesList } from '../components/issues/IssuesList';

interface IssuesPageProps {
  isDarkTheme?: boolean;
}

export const IssuesPage: React.FC<IssuesPageProps> = ({ isDarkTheme }) => {
  const { repoId } = useParams<{ repoId: string }>();

  if (!repoId) {
    return <Box sx={{ p: 3 }}>Repository not found</Box>;
  }

  return (
    <Box sx={{ p: 3 }}>
      <IssuesList repositoryId={repoId} />
    </Box>
  );
};

export default IssuesPage;

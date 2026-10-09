import React from 'react';
import { useParams } from 'react-router-dom';
import { useUserPreferences } from '../context/UserPreferencesContext';
import { IssuesList } from '../components/issues/IssuesList';
import MuiThemeScope from '../components/common/MuiThemeScope';

interface IssuesPageProps {
  isDarkTheme?: boolean;
}

export const IssuesPage: React.FC<IssuesPageProps> = ({ isDarkTheme }) => {
  const { repoId } = useParams<{ repoId: string }>();
  const { t } = useUserPreferences();

  if (!repoId) {
    return <p className="py-8 text-center text-sm">{t('repo.route.repositoryNotFound')}</p>;
  }

  return (
    <MuiThemeScope isDarkTheme={isDarkTheme}>
      <IssuesList repositoryId={repoId} isDarkTheme={isDarkTheme} />
    </MuiThemeScope>
  );
};

export default IssuesPage;

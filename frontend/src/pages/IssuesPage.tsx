import React from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { IssuesList } from '../components/issues/IssuesList';

interface IssuesPageProps {
  isDarkTheme?: boolean;
}

export const IssuesPage: React.FC<IssuesPageProps> = ({ isDarkTheme }) => {
  const { repoId } = useParams<{ repoId: string }>();
  const { t } = useTranslation();

  if (!repoId) {
    return <p className="py-8 text-center text-sm">{t('repo.route.repositoryNotFound', 'Repository not found')}</p>;
  }

  return <IssuesList repositoryId={repoId} isDarkTheme={isDarkTheme} />;
};

export default IssuesPage;

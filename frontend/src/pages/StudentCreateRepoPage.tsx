import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus } from "lucide-react";
import CreateRepositoryModal from "../components/CreateRepositoryModal";
import { getTheme } from "../theme";

interface StudentCreateRepoPageProps {
  isDarkTheme?: boolean;
}

export default function StudentCreateRepoPage({ isDarkTheme = false }: StudentCreateRepoPageProps) {
  const theme = getTheme(isDarkTheme);
  const navigate = useNavigate();
  const [open, setOpen] = useState(true);

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center px-4" style={{ color: theme.text }}>
      <p className="mb-4 text-sm" style={{ color: theme.text2 }}>
        Мастер создания репозитория с настройками видимости и начальными файлами.
      </p>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white"
        style={{ backgroundColor: theme.accent }}
      >
        <Plus className="h-4 w-4" />
        Создать репозиторий
      </button>
      <CreateRepositoryModal
        isOpen={open}
        isDarkTheme={isDarkTheme}
        onClose={() => {
          setOpen(false);
          navigate("/repositories");
        }}
        onCreated={() => navigate("/repositories")}
      />
    </div>
  );
}

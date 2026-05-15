import { useState } from "react";
import { Loader2 } from "lucide-react";
import { createRepository } from "../api/repositoriesApi";
import { getTheme } from "../theme";

interface CreateRepositoryModalProps {
  isOpen: boolean;
  isDarkTheme?: boolean;
  onClose: () => void;
  onCreated: () => void;
}

export default function CreateRepositoryModal({
  isOpen,
  isDarkTheme = false,
  onClose,
  onCreated,
}: CreateRepositoryModalProps) {
  const theme = getTheme(isDarkTheme);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Укажите имя репозитория");
      return;
    }
    if (!/^[a-zA-Z0-9._-]+$/.test(trimmed)) {
      setError("Имя: только латиница, цифры, точка, дефис и подчёркивание");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      await createRepository({
        name: trimmed,
        description: description.trim() || undefined,
      });
      setName("");
      setDescription("");
      onCreated();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось создать репозиторий");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md rounded-xl border p-6 shadow-xl"
        style={{ backgroundColor: theme.bg3, borderColor: theme.border }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-1 text-lg font-semibold" style={{ color: theme.text }}>
          Новый репозиторий
        </h2>
        <p className="mb-4 text-sm" style={{ color: theme.text2 }}>
          Репозиторий будет создан в Gitea и привязан к вашему аккаунту.
        </p>

        <label className="mb-3 block">
          <span className="mb-1 block text-xs font-medium" style={{ color: theme.text2 }}>
            Имя
          </span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="my-project"
            autoFocus
            className="w-full rounded-lg border px-3 py-2 text-sm outline-none"
            style={{
              backgroundColor: theme.bg2,
              borderColor: theme.border,
              color: theme.text,
            }}
          />
        </label>

        <label className="mb-4 block">
          <span className="mb-1 block text-xs font-medium" style={{ color: theme.text2 }}>
            Описание (необязательно)
          </span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            className="w-full resize-none rounded-lg border px-3 py-2 text-sm outline-none"
            style={{
              backgroundColor: theme.bg2,
              borderColor: theme.border,
              color: theme.text,
            }}
          />
        </label>

        {error ? (
          <p className="mb-3 text-xs" style={{ color: theme.danger }}>
            {error}
          </p>
        ) : null}

        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="flex-1 rounded-lg border px-4 py-2 text-sm font-medium disabled:opacity-60"
            style={{ borderColor: theme.border, color: theme.text }}
          >
            Отмена
          </button>
          <button
            type="submit"
            disabled={loading}
            className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
            style={{ backgroundColor: theme.accent }}
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Создать
          </button>
        </div>
      </form>
    </div>
  );
}

import React from 'react'
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import "./styles/index.css";

const CHUNK_RELOAD_KEY = "mtuci:chunk-reload-at";
const CHUNK_RELOAD_TTL_MS = 60_000;

function canAttemptChunkReload() {
  try {
    const raw = sessionStorage.getItem(CHUNK_RELOAD_KEY);
    if (!raw) return true;
    const ts = Number(raw);
    if (!Number.isFinite(ts)) return true;
    return Date.now() - ts > CHUNK_RELOAD_TTL_MS;
  } catch {
    return true;
  }
}

function reloadForChunkError() {
  if (!canAttemptChunkReload()) return;
  try {
    sessionStorage.setItem(CHUNK_RELOAD_KEY, String(Date.now()));
  } catch {
    // Ignore storage failures and still try reload.
  }
  window.location.reload();
}

function isChunkLoadErrorMessage(message: string) {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("failed to fetch dynamically imported module") ||
    normalized.includes("error loading dynamically imported module") ||
    normalized.includes("importing a module script failed")
  );
}

window.addEventListener("vite:preloadError", (event) => {
  event.preventDefault();
  reloadForChunkError();
});

window.addEventListener("unhandledrejection", (event) => {
  const reason = event.reason;
  const message =
    typeof reason === "string"
      ? reason
      : reason && typeof reason === "object" && "message" in reason
        ? String((reason as { message?: unknown }).message ?? "")
        : "";

  if (message && isChunkLoadErrorMessage(message)) {
    event.preventDefault();
    reloadForChunkError();
  }
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);

import type { CSSProperties } from "react";

/**
 * Единая палитра админ-страниц (эталон — UsersPage).
 * Tailwind-классы для разметки + colors для inline-стилей.
 */
export type AdminPageTheme = {
  pageWrapper: string;
  textPrimary: string;
  textSecondary: string;
  textTertiary: string;
  tableBg: string;
  tableBorder: string;
  tableHeaderText: string;
  tableRowBg: string;
  tableRowHover: string;
  tableCellText: string;
  tableNameText: string;
  cardBg: string;
  cardHover: string;
  inputBg: string;
  iconBg: string;
  iconColor: string;
  actionBtnHover: string;
  actionBtnColor: string;
  paginationBtn: string;
  colors: {
    pageBg: string;
    card: string;
    cardElevated: string;
    border: string;
    borderInput: string;
    input: string;
    text: string;
    textSecondary: string;
    textMuted: string;
    textHeader: string;
    textCell: string;
    textName: string;
    hover: string;
    iconBg: string;
  };
};

export function getAdminPageTheme(isDark: boolean): AdminPageTheme {
  if (isDark) {
    return {
      pageWrapper: "text-white",
      textPrimary: "text-white",
      textSecondary: "text-gray-400",
      textTertiary: "text-[#8b949e]",
      tableBg: "bg-[#111111]",
      tableBorder: "border-[#2d2d2d]",
      tableHeaderText: "text-[#6e7681]",
      tableRowBg: "bg-[#111111]",
      tableRowHover: "hover:bg-[#252525]",
      tableCellText: "text-[#8b949e]",
      tableNameText: "text-[#ccd0d4]",
      cardBg: "bg-[#1e1e1e] border-[#2d2d2d]",
      cardHover: "hover:bg-[#252525]",
      inputBg: "bg-[#0d0d0d] border-[#30363d]",
      iconBg: "bg-[#252525]",
      iconColor: "text-[#6e7681]",
      actionBtnHover: "hover:bg-[#30363d] hover:text-[#ccd0d4]",
      actionBtnColor: "text-[#6e7681]",
      paginationBtn:
        "bg-[#111111] border-[#30363d] text-[#8b949e] hover:text-[#ccd0d4]",
      colors: {
        pageBg: "#0f0f10",
        card: "#111111",
        cardElevated: "#1e1e1e",
        border: "#2d2d2d",
        borderInput: "#30363d",
        input: "#0d0d0d",
        text: "#ffffff",
        textSecondary: "#9ca3af",
        textMuted: "#6e7681",
        textHeader: "#6e7681",
        textCell: "#8b949e",
        textName: "#ccd0d4",
        hover: "#252525",
        iconBg: "#252525",
      },
    };
  }

  return {
    pageWrapper: "text-slate-900",
    textPrimary: "text-slate-900",
    textSecondary: "text-slate-500",
    textTertiary: "text-slate-400",
    tableBg: "bg-slate-100",
    tableBorder: "border-slate-200",
    tableHeaderText: "text-slate-400",
    tableRowBg: "",
    tableRowHover: "hover:bg-slate-200",
    tableCellText: "text-slate-500",
    tableNameText: "text-slate-900",
    cardBg: "bg-slate-100 border-slate-200 shadow-sm",
    cardHover: "hover:bg-slate-200",
    inputBg: "bg-gray-100 border-gray-300",
    iconBg: "bg-gray-200",
    iconColor: "text-gray-500",
    actionBtnHover: "hover:bg-gray-300 hover:text-gray-900",
    actionBtnColor: "text-gray-500",
    paginationBtn: "bg-slate-100 border-gray-300 text-gray-600 hover:text-gray-900",
    colors: {
      pageBg: "#f8fafc",
      card: "#f1f5f9",
      cardElevated: "#f1f5f9",
      border: "#e2e8f0",
      borderInput: "#d1d5db",
      input: "#f3f4f6",
      text: "#0f172a",
      textSecondary: "#64748b",
      textMuted: "#94a3b8",
      textHeader: "#94a3b8",
      textCell: "#64748b",
      textName: "#0f172a",
      hover: "#e2e8f0",
      iconBg: "#e5e7eb",
    },
  };
}

/** Нативные `<select>` в админке — приглушённый текст как у фильтров Users. */
export function getAdminNativeSelectProps(
  isDark: boolean,
  size: "default" | "compact" = "default",
): { className: string; style: CSSProperties; optionStyle: CSSProperties } {
  const ui = getAdminPageTheme(isDark);
  const c = ui.colors;
  const pad = size === "compact" ? "px-2 py-1" : "px-3 py-2";
  return {
    className: `admin-native-select ${pad} rounded-lg border text-sm cursor-pointer ${ui.inputBg} ${ui.tableCellText}`,
    style: {
      backgroundColor: c.input,
      color: c.textCell,
      borderColor: c.borderInput,
      ...(isDark ? { colorScheme: "dark" } : {}),
    },
    optionStyle: {
      backgroundColor: c.card,
      color: c.textName,
    },
  };
}

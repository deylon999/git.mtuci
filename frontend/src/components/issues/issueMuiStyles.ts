import type { ThemeColors } from "../../theme";

export function issueDialogPaperSx(theme: ThemeColors) {
  return {
    borderRadius: 2,
    bgcolor: theme.bg3,
    color: theme.text,
    border: `1px solid ${theme.border}`,
    backgroundImage: "none",
    boxShadow: theme.shadow,
  };
}

export function issueDialogContentSx(theme: ThemeColors) {
  return {
    color: theme.text,
    "& .MuiTypography-root": { color: "inherit" },
    "& .MuiListItem-root": { borderColor: theme.border },
    "& .MuiListItemText-secondary": { color: theme.text2 },
    "& .MuiDialogActions-root": { color: theme.text },
    "& .MuiAlert-standardError": {
      backgroundColor: `${theme.danger}22`,
      color: theme.text,
      border: `1px solid ${theme.danger}55`,
    },
    "& .MuiAlert-standardWarning": {
      backgroundColor: `${theme.warning}22`,
      color: theme.text,
      border: `1px solid ${theme.warning}55`,
    },
    "& .MuiButton-root": { textTransform: "none" },
  };
}

export function issueFieldSx(theme: ThemeColors, extra: object = {}) {
  return {
    "& .MuiInputLabel-root": { color: theme.text2 },
    "& .MuiInputLabel-root.Mui-focused": { color: theme.accent2 },
    "& .MuiOutlinedInput-root": {
      color: theme.text,
      backgroundColor: theme.inputBg,
      "& fieldset": { borderColor: theme.inputBorder },
      "&:hover fieldset": { borderColor: theme.border },
      "&.Mui-focused fieldset": { borderColor: theme.accent2 },
    },
    "&.MuiOutlinedInput-root": {
      color: theme.text,
      backgroundColor: theme.inputBg,
      "& fieldset": { borderColor: theme.inputBorder },
      "&:hover fieldset": { borderColor: theme.border },
      "&.Mui-focused fieldset": { borderColor: theme.accent2 },
    },
    "& .MuiInputBase-input::placeholder": { color: theme.text3, opacity: 1 },
    "& .MuiSelect-icon": { color: theme.text2 },
    "& .MuiAutocomplete-popupIndicator": { color: theme.text2 },
    "& .MuiAutocomplete-clearIndicator": { color: theme.text2 },
    "& .MuiSvgIcon-root": { color: theme.text2 },
    "& input[type='date']::-webkit-calendar-picker-indicator": {
      filter: "invert(0.7)",
    },
    ...extra,
  };
}

export function issueMenuPaperSx(theme: ThemeColors) {
  return {
    bgcolor: theme.bg3,
    color: theme.text,
    border: `1px solid ${theme.border}`,
    backgroundImage: "none",
    "& .MuiMenuItem-root:hover": { bgcolor: theme.hoverBg },
    "& .MuiMenuItem-root.Mui-selected": { bgcolor: theme.bg4 },
  };
}

export function issueDialogBackdropSx(isDarkTheme: boolean) {
  return {
    backgroundColor: isDarkTheme ? "rgba(0, 0, 0, 0.72)" : "rgba(15, 23, 42, 0.45)",
    backdropFilter: "blur(1px)",
  };
}

export function issueTextButtonSx(theme: ThemeColors) {
  return {
    color: theme.text2,
    "&:hover": {
      backgroundColor: theme.hoverBg,
      color: theme.text,
    },
  };
}

export function issueOutlinedButtonSx(theme: ThemeColors) {
  return {
    borderColor: theme.border,
    color: theme.text,
    "&:hover": {
      borderColor: theme.accent2,
      backgroundColor: theme.hoverBg,
    },
  };
}

export function issuePrimaryButtonSx(theme: ThemeColors) {
  return {
    backgroundColor: theme.accent,
    color: "#ffffff",
    "&:hover": {
      backgroundColor: theme.accentHover,
    },
    "&.Mui-disabled": {
      backgroundColor: theme.bg4,
      color: theme.text3,
    },
  };
}

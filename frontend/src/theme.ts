export interface ThemeColors {
  // Background colors
  bg: string;
  bg2: string;
  bg3: string;
  bg4: string;
  bgCard: string;
  
  // Border colors
  border: string;
  borderLight: string;
  divider: string;
  
  // Text colors
  text: string;
  text2: string;
  text3: string;
  
  // Accent colors
  accent: string;
  accent2: string;
  accentHover: string;
  
  // Status colors
  danger: string;
  dangerHover: string;
  success: string;
  successHover: string;
  warning: string;
  warningHover: string;
  
  // Shadows
  shadow: string;
  shadowSm: string;
  
  // Input colors
  inputBg: string;
  inputBorder: string;
  
  // Button colors
  buttonBg: string;
  buttonBorder: string;
  buttonText: string;
  buttonHover: string;
  
  // Hover states
  hoverBg: string;
  hoverText: string;
}

export const darkTheme: ThemeColors = {
  // Background colors
  bg: "#0f0f10",
  bg2: "#111111",
  bg3: "#1e1e1e",
  bg4: "#2a2a2a",
  bgCard: "#0f0f10",
  
  // Border colors
  border: "#30363d",
  borderLight: "#2d2d2d",
  divider: "#30363d",
  
  // Text colors
  text: "#e6e6e6",
  text2: "#888888",
  text3: "#444444",
  
  // Accent colors
  accent: "#2563eb",
  accent2: "#3b82f6",
  accentHover: "#1d4ed8",
  
  // Status colors
  danger: "#ef4444",
  dangerHover: "#dc2626",
  success: "#22c55e",
  successHover: "#16a34a",
  warning: "#f59e0b",
  warningHover: "#d97706",
  
  // Shadows
  shadow: "0 4px 12px rgba(0, 0, 0, 0.3)",
  shadowSm: "0 2px 6px rgba(0, 0, 0, 0.2)",
  
  // Input colors
  inputBg: "#0a0a0a",
  inputBorder: "#30363d",
  
  // Button colors
  buttonBg: "#21262d",
  buttonBorder: "#30363d",
  buttonText: "#8b949e",
  buttonHover: "#30363d",
  
  // Hover states
  hoverBg: "#1a1a1a",
  hoverText: "#ccd0d4",
};

export const lightTheme: ThemeColors = {
  // Background colors - light equivalents
  bg: "#f9fafb",
  bg2: "#ffffff",
  bg3: "#f5f5f5",
  bg4: "#e5e7eb",
  bgCard: "#ffffff",
  
  // Border colors
  border: "#d4d4d4",
  borderLight: "#e5e7eb",
  divider: "#e5e7eb",
  
  // Text colors
  text: "#171717",
  text2: "#737373",
  text3: "#a3a3a3",
  
  // Accent colors
  accent: "#2563eb",
  accent2: "#3b82f6",
  accentHover: "#1d4ed8",
  
  // Status colors
  danger: "#ef4444",
  dangerHover: "#dc2626",
  success: "#22c55e",
  successHover: "#16a34a",
  warning: "#f59e0b",
  warningHover: "#d97706",
  
  // Shadows
  shadow: "0 2px 8px rgba(0, 0, 0, 0.08)",
  shadowSm: "0 1px 4px rgba(0, 0, 0, 0.05)",
  
  // Input colors
  inputBg: "#f5f5f5",
  inputBorder: "#d4d4d4",
  
  // Button colors
  buttonBg: "#f3f4f6",
  buttonBorder: "#d4d4d4",
  buttonText: "#6b7280",
  buttonHover: "#e5e7eb",
  
  // Hover states
  hoverBg: "#f3f4f6",
  hoverText: "#1f2937",
};

export function getTheme(isDarkTheme: boolean): ThemeColors {
  return isDarkTheme ? darkTheme : lightTheme;
}

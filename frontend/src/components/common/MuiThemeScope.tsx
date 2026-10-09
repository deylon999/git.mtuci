import { useMemo, type ReactNode } from "react";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { getTheme } from "../../theme";

/**
 * MUI components (issues, reviews) otherwise render with MUI's default light theme even when the app is dark.
 * Kept out of App so MUI's theming code only loads with the screens that use it.
 */
export default function MuiThemeScope({ isDarkTheme = false, children }: { isDarkTheme?: boolean; children: ReactNode }) {
  const muiTheme = useMemo(() => {
    const colors = getTheme(isDarkTheme);
    return createTheme({
      palette: {
        mode: isDarkTheme ? "dark" : "light",
        primary: { main: "#2563eb" },
        background: { default: colors.bg, paper: colors.bg3 },
        text: { primary: colors.text, secondary: colors.text2 },
        divider: colors.border,
      },
      typography: { fontFamily: "inherit" },
      shape: { borderRadius: 8 },
    });
  }, [isDarkTheme]);

  return <ThemeProvider theme={muiTheme}>{children}</ThemeProvider>;
}

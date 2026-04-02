import { useEffect } from "react";
import { useThemeStore } from "../stores/themeStore";

/** Keeps <html class="dark"> in sync with the persisted theme store. */
export default function ThemeSync() {
  const theme = useThemeStore((s) => s.theme);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  return null;
}

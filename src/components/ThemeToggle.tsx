"use client";

import { useEffect, useState } from "react";

type Theme = "light" | "dark";

export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("light");

  // Applique le thème immédiatement (et évite le flash)
  useEffect(() => {
    // 1) lit la préférence stockée
    const saved = (typeof window !== "undefined" && localStorage.getItem("cm:theme")) as Theme | null;
    // 2) fallback: préfère le thème OS
    const prefersDark =
      typeof window !== "undefined" &&
      window.matchMedia &&
      window.matchMedia("(prefers-color-scheme: dark)").matches;

    const initial: Theme = saved ?? (prefersDark ? "dark" : "light");
    setTheme(initial);
    document.documentElement.classList.toggle("dark", initial === "dark");
  }, []);

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.classList.toggle("dark", next === "dark");
    localStorage.setItem("cm:theme", next);
  }

  return (
    <button
      onClick={toggle}
      className="inline-flex items-center gap-2 px-3 py-1.5 rounded border border-gray-300 dark:border-gray-600 text-sm
                 bg-white hover:bg-gray-50 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-800 dark:text-gray-100"
      aria-label="Basculer le thème clair/sombre"
      title="Basculer le thème clair/sombre"
      type="button"
    >
      {theme === "dark" ? "Sombre" : "Clair"}
    </button>
  );
}

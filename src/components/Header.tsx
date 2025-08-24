"use client";

import Image from "next/image";
import { useState, useEffect } from "react";

export default function Header() {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    if (localStorage.getItem("theme") === "dark") {
      document.documentElement.classList.add("dark");
      setDark(true);
    }
  }, []);

  function toggleDark() {
    const html = document.documentElement;
    if (html.classList.contains("dark")) {
      html.classList.remove("dark");
      localStorage.setItem("theme", "light");
      setDark(false);
    } else {
      html.classList.add("dark");
      localStorage.setItem("theme", "dark");
      setDark(true);
    }
  }

  return (
    <header className="sticky top-0 z-50 flex items-center justify-between bg-white dark:bg-gray-900 shadow px-4 py-3">
      <div className="flex items-center gap-3">
        <Image src="/logo.png" alt="CancelMe logo" width={32} height={32} />
        <span className="font-bold text-xl text-gray-900 dark:text-gray-100">
          CancelMe
        </span>
      </div>
      <button
        onClick={toggleDark}
        className="px-3 py-1 text-sm rounded bg-gray-200 dark:bg-gray-700 text-black dark:text-white hover:bg-gray-300 dark:hover:bg-gray-600"
      >
        {dark ? "☀️ Clair" : "🌙 Sombre"}
      </button>
    </header>
  );
}

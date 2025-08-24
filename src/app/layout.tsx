import type { Metadata } from "next";
import "./globals.css";
import Header from "./components/Header";
import { Analytics } from "@vercel/analytics/react";

export const metadata: Metadata = {
  title: "CancelMe",
  description: "L'appli anonyme où tout peut être cancel 😈",
  icons: { icon: "/favicon.ico" },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <head>
        {/* Applique le thème (dark/light) avant le rendu pour éviter le flash */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
(function() {
  try {
    var s = localStorage.getItem('cm:theme');
    var d = s ? (s === 'dark') : window.matchMedia('(prefers-color-scheme: dark)').matches;
    if (d) document.documentElement.classList.add('dark');
    else document.documentElement.classList.remove('dark');
  } catch(e) {}
})();
`,
          }}
        />
      </head>
      <body className="antialiased">
        {/* Header global (logo + bouton thème) */}
        <Header />

        {/* Contenu des pages */}
        {children}

        {/* Analytics Vercel (optionnel si tu l'as installé) */}
        <Analytics />
      </body>
    </html>
  );
}

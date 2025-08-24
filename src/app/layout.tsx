import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Image from "next/image";
import "./globals.css";
import ThemeToggle from "../components/ThemeToggle"; // 👈 ajout

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "CancelMe",
  description: "L'appli anonyme où tout peut être cancel 😈",
  icons: { icon: "/favicon.ico" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased bg-gray-50 dark:bg-gray-900`}>
        {/* Header */}
        <header className="sticky top-0 z-50 bg-white/80 dark:bg-gray-900/80 backdrop-blur border-b border-gray-200 dark:border-gray-800">
          <div className="mx-auto max-w-4xl px-4 h-14 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <Image src="/logo.png" alt="CancelMe" width={28} height={28} priority />
              <span className="font-semibold text-lg text-gray-900 dark:text-gray-100">CancelMe</span>
            </div>
            <ThemeToggle /> {/* 👈 bouton clair/sombre */}
          </div>
        </header>

        {/* Contenu */}
        <main className="mx-auto max-w-4xl px-4 py-6">{children}</main>
      </body>
    </html>
  );
}

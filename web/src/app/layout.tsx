import type { Metadata } from "next";
import { Archivo, Geist_Mono } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

// Archivo's width axis (62–125%) lets headlines condense, and lets the wordmark react to the cursor.
const archivo = Archivo({ variable: "--font-archivo", subsets: ["latin"], axes: ["wdth"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Argus: the watcher that never sleeps",
  description: "Scan links, files, emails, texts and phone numbers against real threat intelligence.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`dark ${archivo.variable} ${geistMono.variable}`}>
      <body className="min-h-dvh font-sans antialiased">
        {children}
        <div className="grain" aria-hidden />
        <Toaster position="top-center" richColors />
      </body>
    </html>
  );
}

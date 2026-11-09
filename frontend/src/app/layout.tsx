import "./globals.css";
import React from "react";
import { Inter, Fraunces, JetBrains_Mono } from "next/font/google";
import { Providers } from "./providers";

const sans = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const serif = Fraunces({
  subsets: ["latin"],
  variable: "--font-serif",
  display: "swap",
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata = {
  title: "Baton | Evidence-Backed Knowledge Handover",
  description: "Baton rebuilds project history as an evidence graph, asks the leaver only what documents cannot explain, and verifies the successor understood.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`dark ${sans.variable} ${serif.variable} ${mono.variable}`}>
      <body className="min-h-screen bg-background font-sans antialiased text-foreground starfield-bg selection:bg-primary/20 selection:text-primary">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}

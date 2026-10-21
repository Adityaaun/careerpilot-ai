import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "CareerPilot AI — Autonomous Job Matching & Career Agent",
  description:
    "Production-grade conversational career agent with automated resume parsing, real-time job recommendations, explainable match scoring, and direct application tracking.",
  keywords: [
    "AI Job Assistant",
    "Resume Parser",
    "Career Pilot",
    "Job Matching Agent",
    "SDE Assessment",
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${inter.variable} dark h-full`}>
      <body className="min-h-full flex flex-col antialiased bg-[#0b0f19] text-slate-100 selection:bg-indigo-500/30 selection:text-indigo-200">
        {children}
      </body>
    </html>
  );
}

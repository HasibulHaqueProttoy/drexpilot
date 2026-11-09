import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "DrexPilot - AI-Powered Social Media Scheduler",
  description: "Lightweight AI-powered social media scheduler connecting to Claude via Model Context Protocol (MCP).",
  icons: {
    icon: "/logo.png",
    apple: "/logo.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased">
        {children}
      </body>
    </html>
  );
}

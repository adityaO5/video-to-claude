import type { Metadata } from "next";
import { Azeret_Mono, DM_Sans } from "next/font/google";
import "./globals.css";

const azeretMono = Azeret_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "video-to-claude",
  description: "Convert video to Claude Code–ready frames",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${azeretMono.variable} ${dmSans.variable} h-full antialiased dark`}
      style={{ background: "#0d0d0f" }}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}

import type { Metadata } from "next";
import { Poppins } from "next/font/google";
import type { ReactNode } from "react";
import "./globals.css";

const poppins = Poppins({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-poppins",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Album Cover Batch Downloader",
  description: "Batch search and download album covers locally.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className={poppins.variable}>{children}</body>
    </html>
  );
}

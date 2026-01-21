import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "OG Image Generator",
  description: "Generate Open Graph images with text overlay",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

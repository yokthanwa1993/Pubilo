import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "./context/AuthContext";
import AppInitializer from "./components/AppInitializer";
import { StagewiseToolbar } from "@stagewise/toolbar-next";
import ReactPlugin from "@stagewise-plugins/react";


const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "AI Multi-Platform Uploader",
  description: "Upload videos to multiple platforms at once.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <AuthProvider>
          <AppInitializer>
            {children}
          </AppInitializer>
          <StagewiseToolbar config={{ plugins: [ReactPlugin] }} />
        </AuthProvider>
      </body>
    </html>
  );
}

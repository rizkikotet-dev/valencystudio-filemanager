import type { Metadata, Viewport } from "next";
import { IBM_Plex_Sans, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/components/theme-provider";

const valencySans = IBM_Plex_Sans({
  variable: "--font-valency-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const valencyMono = IBM_Plex_Mono({
  variable: "--font-valency-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "ValencyStudio File Manager — Telegram-powered cloud storage",
  description:
    "ValencyStudio File Manager: a file hosting console that stores your files on Telegram — unlimited, secure, with share links, previews and admin analytics.",
  keywords: ["file manager", "telegram storage", "cloud storage", "file sharing", "ValencyStudio"],
  authors: [{ name: "ValencyStudio" }],
  applicationName: "ValencyStudio File Manager",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "ValencyFM",
  },
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  openGraph: {
    title: "ValencyStudio File Manager",
    description: "Unlimited cloud storage powered by Telegram — upload, share, stream.",
    siteName: "ValencyStudio File Manager",
    type: "website",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0b0b0c",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${valencySans.variable} ${valencyMono.variable} antialiased bg-background text-foreground`}
      >
        <ThemeProvider>
          {children}
          <Toaster position="bottom-right" closeButton />
        </ThemeProvider>
      </body>
    </html>
  );
}

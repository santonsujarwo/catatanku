import type { Metadata, Viewport } from "next";
import PwaRegister from "./pwa-register";
import "./globals.css";

export const metadata: Metadata = {
  title: "CatatKu — Catatan Keuangan",
  description: "Catat pemasukan dan pengeluaran cukup dengan satu kalimat.",
  manifest: "/manifest.webmanifest",
  applicationName: "CatatKu",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "CatatKu",
  },
  icons: {
    icon: "/icon.svg",
    shortcut: "/icon.svg",
    apple: "/icon.svg",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#087eaa",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="id"><body><PwaRegister />{children}</body></html>;
}

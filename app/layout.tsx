import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CatatKu — Catatan Keuangan",
  description: "Catat pemasukan dan pengeluaran cukup dengan satu kalimat."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="id"><body>{children}</body></html>;
}
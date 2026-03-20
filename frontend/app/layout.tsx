import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ClientLayout } from "./components/ClientLayout";

export const metadata: Metadata = {
  title: "KALMUS // Film Color Analysis",
  description: "Cinematic barcode generation and color analysis system",
};

export const viewport: Viewport = {
  themeColor: "#0a0a0c",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="font-mono antialiased">
        <ClientLayout>{children}</ClientLayout>
      </body>
    </html>
  );
}

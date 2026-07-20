import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Afterlight Edge",
  description: "Decision support for Kalshi event markets",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

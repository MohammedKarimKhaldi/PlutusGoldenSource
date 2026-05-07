import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Golden Source CRM",
  description: "A private golden-source outreach database for companies and contacts.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

import type { Metadata } from "next";
import "./globals.css";
import { getMode } from "@/lib/mode";
import { EditToolbar } from "@/components/edit/EditToolbar";

export const metadata: Metadata = {
  title: "Scale42",
  description: "Next-generation European Digital Infrastructure",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const mode = getMode();
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Commissioner:wght@300;400;500;600;700&family=Lexend:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body data-mode={mode}>
        {children}
        {mode === "cms" ? <EditToolbar /> : null}
      </body>
    </html>
  );
}

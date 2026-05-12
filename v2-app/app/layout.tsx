import type { Metadata } from "next";
import { getMode } from "@/lib/mode";

export const metadata: Metadata = {
  title: "Scale42",
  description: "Next-generation European Digital Infrastructure",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const mode = getMode();
  return (
    <html lang="en">
      <body data-mode={mode}>{children}</body>
    </html>
  );
}

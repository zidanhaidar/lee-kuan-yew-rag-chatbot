import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "What Would Lee Kuan Yew Do? — RAG Chatbot",
  description:
    "An educational AI emulation of Lee Kuan Yew, grounded in his documented speeches, memoirs, and interviews via retrieval-augmented generation.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

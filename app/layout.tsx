import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Phúc Long RAG Chatbot",
  description: "Trợ lý sản phẩm Phúc Long dùng OpenAI, Supabase vector database và hybrid search.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  );
}

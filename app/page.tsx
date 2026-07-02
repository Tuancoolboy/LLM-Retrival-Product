"use client";

import { FormEvent, useMemo, useRef, useState } from "react";

type Source = {
  productName: string;
  category: string | null;
  priceText: string | null;
  sourceUrl: string | null;
  imageUrl: string | null;
  score: number;
};

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: Source[];
};

const examples = [
  "Gợi ý sản phẩm trà trái cây dễ uống?",
  "Sản phẩm nào phù hợp nếu tôi thích cà phê?",
  "Tôi muốn phản hồi về món Trà Đào, chatbot nên hỏi gì tiếp?",
];

export default function Home() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      role: "assistant",
      content:
        "Xin chào! Mình là trợ lý RAG cho sản phẩm Phúc Long. Hãy hỏi về món uống, danh mục, giá hiển thị hoặc cách ghi nhận phản hồi sản phẩm.",
    },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const history = useMemo(
    () =>
      messages
        .filter((message) => message.id !== "welcome")
        .slice(-6)
        .map(({ role, content }) => ({ role, content })),
    [messages],
  );

  async function sendMessage(content: string) {
    const trimmed = content.trim();
    if (!trimmed || isLoading) return;

    const userMessage: ChatMessage = { id: crypto.randomUUID(), role: "user", content: trimmed };
    setMessages((current) => [...current, userMessage]);
    setInput("");
    setError(null);
    setIsLoading(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: trimmed, history }),
      });
      const data = await response.json();

      if (!response.ok) throw new Error(data.error ?? "Không gọi được API chat");

      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: data.answer,
          sources: data.sources ?? [],
        },
      ]);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Có lỗi không xác định";
      setError(message);
      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: "Mình chưa xử lý được yêu cầu. Vui lòng kiểm tra cấu hình OpenAI/Supabase hoặc thử lại sau.",
        },
      ]);
    } finally {
      setIsLoading(false);
      inputRef.current?.focus();
    }
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void sendMessage(input);
  }

  return (
    <main className="min-h-dvh bg-[radial-gradient(circle_at_top_left,_rgba(15,122,59,0.16),_transparent_34%),linear-gradient(135deg,#f6f1e7_0%,#ffffff_54%,#eef8f1_100%)] px-4 py-6 text-slate-950 sm:px-6 lg:px-8">
      <section className="mx-auto flex min-h-[calc(100dvh-3rem)] max-w-6xl flex-col gap-6 lg:grid lg:grid-cols-[360px_minmax(0,1fr)]">
        <aside className="rounded-[2rem] border border-white/70 bg-white/75 p-6 shadow-soft backdrop-blur">
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-phuclong-700">Phúc Long RAG</p>
          <h1 className="mt-4 text-3xl font-bold leading-tight text-slate-950 sm:text-4xl">
            Chatbot truy xuất sản phẩm bằng OpenAI + Supabase
          </h1>
          <p className="mt-4 text-base leading-7 text-slate-700">
            Hỏi bằng tiếng Việt. Trợ lý sẽ tìm dữ liệu sản phẩm đã crawl, kết hợp hybrid search và trả lời có nguồn tham khảo.
          </p>

          <div className="mt-6 rounded-2xl border border-phuclong-100 bg-phuclong-50/80 p-4">
            <h2 className="text-sm font-semibold text-phuclong-700">Gợi ý câu hỏi</h2>
            <div className="mt-3 grid gap-2">
              {examples.map((example) => (
                <button
                  key={example}
                  type="button"
                  onClick={() => void sendMessage(example)}
                  className="min-h-11 rounded-xl border border-phuclong-100 bg-white px-4 py-3 text-left text-sm font-medium text-slate-800 shadow-sm transition hover:border-phuclong-500 hover:text-phuclong-700 focus:outline-none focus:ring-2 focus:ring-phuclong-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={isLoading}
                >
                  {example}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-6 space-y-3 text-sm text-slate-600">
            <p className="font-semibold text-slate-800">Luồng dữ liệu</p>
            <ol className="list-inside list-decimal space-y-2 leading-6">
              <li>Crawl trang công khai phuclong.com</li>
              <li>Nhúng nội dung bằng OpenAI embeddings</li>
              <li>Lưu vector vào Supabase pgvector</li>
              <li>Truy xuất hybrid search để trả lời</li>
            </ol>
          </div>
        </aside>

        <section className="flex min-h-[640px] flex-col overflow-hidden rounded-[2rem] border border-white/70 bg-white/85 shadow-soft backdrop-blur">
          <header className="border-b border-slate-200/80 px-5 py-4 sm:px-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-bold text-slate-950">Trợ lý sản phẩm</h2>
                <p className="text-sm text-slate-600">Câu trả lời được neo vào dữ liệu truy xuất.</p>
              </div>
              <span className="rounded-full bg-phuclong-50 px-3 py-1 text-xs font-semibold text-phuclong-700">Hybrid search</span>
            </div>
          </header>

          <div className="flex-1 space-y-4 overflow-y-auto px-4 py-5 sm:px-6" aria-live="polite">
            {messages.map((message) => (
              <article key={message.id} className={message.role === "user" ? "ml-auto max-w-[82%]" : "mr-auto max-w-[92%]"}>
                <div
                  className={
                    message.role === "user"
                      ? "rounded-3xl rounded-br-lg bg-phuclong-600 px-5 py-4 text-white shadow-md"
                      : "rounded-3xl rounded-bl-lg border border-slate-200 bg-white px-5 py-4 text-slate-800 shadow-sm"
                  }
                >
                  <p className="whitespace-pre-wrap text-sm leading-6 sm:text-base">{message.content}</p>
                </div>
                {message.sources && message.sources.length > 0 ? <SourceCards sources={message.sources} /> : null}
              </article>
            ))}

            {isLoading ? (
              <div className="mr-auto max-w-[92%] rounded-3xl rounded-bl-lg border border-slate-200 bg-white px-5 py-4 shadow-sm">
                <div className="flex items-center gap-3 text-sm text-slate-600">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-phuclong-600" />
                  Đang truy xuất dữ liệu sản phẩm...
                </div>
              </div>
            ) : null}
          </div>

          {error ? (
            <div className="mx-4 mb-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 sm:mx-6" role="alert">
              {error}
            </div>
          ) : null}

          <form onSubmit={onSubmit} className="border-t border-slate-200/80 bg-white/90 p-4 sm:p-5">
            <label htmlFor="message" className="sr-only">
              Nhập câu hỏi cho chatbot
            </label>
            <div className="flex flex-col gap-3 sm:flex-row">
              <textarea
                ref={inputRef}
                id="message"
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder="Ví dụ: Tôi thích trà trái cây, có món nào nên thử?"
                className="min-h-24 flex-1 resize-none rounded-2xl border border-slate-300 bg-white px-4 py-3 text-base leading-6 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-phuclong-500 focus:ring-2 focus:ring-phuclong-500/20"
                disabled={isLoading}
              />
              <button
                type="submit"
                disabled={isLoading || !input.trim()}
                className="min-h-12 rounded-2xl bg-phuclong-600 px-6 py-3 text-base font-semibold text-white shadow-md transition hover:bg-phuclong-700 focus:outline-none focus:ring-2 focus:ring-phuclong-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                {isLoading ? "Đang gửi" : "Gửi"}
              </button>
            </div>
          </form>
        </section>
      </section>
    </main>
  );
}

function SourceCards({ sources }: { sources: Source[] }) {
  return (
    <div className="mt-3 grid gap-2 sm:grid-cols-2">
      {sources.slice(0, 4).map((source) => (
        <a
          key={`${source.productName}-${source.sourceUrl}`}
          href={source.sourceUrl ?? "#"}
          target="_blank"
          rel="noreferrer"
          className="rounded-2xl border border-phuclong-100 bg-phuclong-50/70 p-3 text-sm transition hover:border-phuclong-500 focus:outline-none focus:ring-2 focus:ring-phuclong-500 focus:ring-offset-2"
          aria-label={`Mở nguồn sản phẩm ${source.productName}`}
        >
          <p className="font-semibold text-phuclong-700">{source.productName}</p>
          <p className="mt-1 text-slate-600">{[source.category, source.priceText].filter(Boolean).join(" • ") || "Nguồn sản phẩm"}</p>
        </a>
      ))}
    </div>
  );
}

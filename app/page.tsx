"use client";

import { ChangeEvent, FormEvent, useMemo, useRef, useState } from "react";

type IconName =
  | "bot"
  | "box"
  | "bolt"
  | "check"
  | "chevron"
  | "clipboard"
  | "database"
  | "engine"
  | "external"
  | "file"
  | "gauge"
  | "info"
  | "link"
  | "paperclip"
  | "plane"
  | "scan"
  | "search"
  | "seal"
  | "spark"
  | "track";

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
  createdAt: string;
  sources?: Source[];
};

type DocumentFormState = {
  title: string;
  category: string;
  sourceUrl: string;
  content: string;
};

type DocumentStatus = {
  type: "success" | "error";
  message: string;
} | null;

const emptyDocumentForm: DocumentFormState = {
  title: "",
  category: "Phụ tùng tự nhập",
  sourceUrl: "",
  content: "",
};

const examples = [
  "Tôi cần bộ xích cho D9R, có sản phẩm nào liên quan?",
  "Bơm thủy lực K3V63DT có thông tin gì?",
  "Có phụ tùng gầm máy nào cho D155A-1?",
];

const categories: Array<{ label: string; icon: IconName; prompt: string }> = [
  { label: "Gầm máy", icon: "track", prompt: "Có phụ tùng gầm máy nào nổi bật?" },
  { label: "Thủy lực", icon: "gauge", prompt: "Bơm thủy lực có những sản phẩm nào?" },
  { label: "Phớt", icon: "seal", prompt: "Tìm giúp tôi các sản phẩm phớt phổ biến." },
  { label: "Động cơ", icon: "engine", prompt: "Có phụ tùng động cơ nào trong danh mục?" },
  { label: "Điện", icon: "bolt", prompt: "Có phụ tùng điện nào phù hợp máy công trình?" },
  { label: "Di chuyển", icon: "track", prompt: "Tôi cần phụ tùng hệ di chuyển." },
];

const ragSteps: Array<{ label: string; caption: string; icon: IconName }> = [
  { label: "Crawl dữ liệu", caption: "Thu thập trang sản phẩm", icon: "database" },
  { label: "Chuẩn hóa", caption: "Tên, mã, dòng máy, giá", icon: "clipboard" },
  { label: "Truy vấn nguồn", caption: "Tìm kiếm theo ngữ cảnh", icon: "search" },
];

function formatTime() {
  return new Date().toLocaleTimeString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function Home() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      role: "assistant",
      createdAt: "Sẵn sàng",
      content:
        "Xin chào! Mình là trợ lý RAG cho danh mục phụ tùng Phúc Long. Hãy hỏi về mã phụ tùng, dòng máy, danh mục, giá hiển thị hoặc cách ghi nhận phản hồi sản phẩm.",
    },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [documentForm, setDocumentForm] = useState<DocumentFormState>(emptyDocumentForm);
  const [documentStatus, setDocumentStatus] = useState<DocumentStatus>(null);
  const [isIndexingDocument, setIsIndexingDocument] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const history = useMemo(
    () =>
      messages
        .filter((message) => message.id !== "welcome")
        .slice(-6)
        .map(({ role, content }) => ({ role, content })),
    [messages],
  );

  const canIndexDocument = documentForm.title.trim().length > 1 && documentForm.content.trim().length >= 20;

  async function sendMessage(content: string) {
    const trimmed = content.trim();
    if (!trimmed || isLoading) return;

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: trimmed,
      createdAt: formatTime(),
    };
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
          createdAt: formatTime(),
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
          createdAt: formatTime(),
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

  async function onDocumentSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canIndexDocument || isIndexingDocument) return;

    setIsIndexingDocument(true);
    setDocumentStatus(null);

    try {
      const response = await fetch("/api/documents", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(documentForm),
      });
      const data = await response.json();

      if (!response.ok) throw new Error(data.error ?? "Không index được tài liệu");

      const chunkCount = data.document?.chunkCount ?? 0;
      const title = data.document?.title ?? documentForm.title.trim();
      setDocumentStatus({ type: "success", message: `Đã index ${chunkCount} đoạn cho ${title}.` });
      setDocumentForm({ ...emptyDocumentForm, category: documentForm.category || emptyDocumentForm.category });
      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          createdAt: formatTime(),
          content: `Đã thêm tài liệu "${title}" vào kho RAG. Bạn có thể hỏi theo tên tài liệu, mã phụ tùng hoặc dòng máy liên quan.`,
        },
      ]);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Có lỗi không xác định";
      setDocumentStatus({ type: "error", message });
    } finally {
      setIsIndexingDocument(false);
    }
  }

  async function onDocumentFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const titleFromFile = file.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ");
      setDocumentForm((current) => ({
        ...current,
        title: current.title || titleFromFile,
        content: current.content ? `${current.content.trim()}\n\n${text.trim()}` : text.trim(),
      }));
      setDocumentStatus(null);
    } catch {
      setDocumentStatus({ type: "error", message: "Không đọc được file tài liệu." });
    } finally {
      event.target.value = "";
    }
  }

  return (
    <main className="min-h-dvh overflow-x-hidden bg-[#f4efe6] px-3 py-3 text-[#10281d] sm:px-5 sm:py-5 lg:px-7">
      <section className="mx-auto grid min-h-[calc(100dvh-1.5rem)] w-full min-w-0 max-w-[1480px] grid-cols-[minmax(0,1fr)] gap-3 lg:min-h-[calc(100dvh-2.5rem)] lg:grid-cols-[390px_minmax(0,1fr)] xl:grid-cols-[410px_minmax(0,1fr)]">
        <aside className="min-w-0 overflow-hidden rounded-lg border border-[#e8ddcb] bg-[#fffdf8]/95 shadow-[0_20px_70px_rgba(24,39,30,0.13)]">
          <div className="px-5 py-6 sm:px-7 lg:py-7">
            <div className="flex items-center gap-3">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-[#0c4d2c] text-white shadow-[0_10px_25px_rgba(12,77,44,0.22)]">
                <Icon name="box" className="h-6 w-6" />
              </span>
              <p className="text-sm font-black uppercase text-[#0c4d2c]">Phúc Long Parts</p>
            </div>

            <h1 className="mt-7 max-w-[11ch] text-4xl font-black leading-[1.06] text-[#103d2a] sm:text-[42px] lg:text-[40px]">
            Trợ lý phụ tùng máy công trình
          </h1>
            <p className="mt-5 max-w-sm text-[15px] leading-7 text-[#314538]">
              Tra cứu phụ tùng từ dữ liệu công khai đã crawl, chuẩn hóa theo tên hàng, mã, dòng máy, danh mục, giá và nguồn tham khảo.
            </p>

            <div className="mt-6 grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-2 sm:grid-cols-[repeat(3,minmax(0,1fr))]">
              {categories.map((category) => (
                <button
                  key={category.label}
                  type="button"
                  onClick={() => void sendMessage(category.prompt)}
                  disabled={isLoading}
                  className="group flex min-h-12 min-w-0 items-center justify-center gap-1.5 rounded-lg border border-[#e7ddcd] bg-white px-2 py-2.5 text-[13px] font-bold text-[#163a2a] shadow-[0_8px_18px_rgba(24,39,30,0.07)] transition hover:-translate-y-0.5 hover:border-[#c99135] hover:bg-[#fffcf5] focus:outline-none focus:ring-2 focus:ring-[#0c6a3c]/25 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Icon name={category.icon} className="h-5 w-5 shrink-0 text-[#0c4d2c]" />
                  <span className="min-w-0 whitespace-nowrap">{category.label}</span>
                </button>
              ))}
            </div>

            <section className="mt-5 border-t border-[#eadfce] pt-5">
              <div className="mb-3 flex items-center gap-2 text-sm font-black text-[#173a2a]">
                <Icon name="spark" className="h-5 w-5 text-[#b7791d]" />
                Gợi ý nhanh
              </div>
              <div className="grid gap-2">
                {examples.map((example) => (
                  <button
                    key={example}
                    type="button"
                    onClick={() => void sendMessage(example)}
                    className="group flex min-h-12 min-w-0 items-center gap-3 rounded-lg border border-[#e8ddcb] bg-white px-4 py-2.5 text-left text-sm font-semibold leading-5 text-[#1e3026] shadow-[0_8px_18px_rgba(24,39,30,0.07)] transition hover:border-[#c99135] hover:bg-[#fffcf6] focus:outline-none focus:ring-2 focus:ring-[#0c6a3c]/25 disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={isLoading}
                  >
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[#eef7f1] text-[#0c4d2c]">
                      <Icon name="scan" className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1 break-words">{example}</span>
                    <Icon name="chevron" className="h-4 w-4 shrink-0 text-[#b7791d] transition group-hover:translate-x-0.5" />
                  </button>
                ))}
              </div>
            </section>

            <section className="mt-5 border-t border-[#eadfce] pt-5">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2 text-sm font-black text-[#173a2a]">
                  <Icon name="file" className="h-5 w-5 text-[#0c4d2c]" />
                  <span className="truncate">Thêm tài liệu RAG</span>
                </div>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-[#e1dbd0] bg-white text-[#657267] transition hover:border-[#0c4d2c] hover:text-[#0c4d2c] focus:outline-none focus:ring-2 focus:ring-[#0c6a3c]/25"
                  aria-label="Chọn file tài liệu"
                >
                  <Icon name="paperclip" className="h-4 w-4" />
                </button>
              </div>
              <form onSubmit={onDocumentSubmit} className="grid gap-2">
                <input
                  value={documentForm.title}
                  onChange={(event) => setDocumentForm((current) => ({ ...current, title: event.target.value }))}
                  placeholder="Tên tài liệu hoặc mã phụ tùng"
                  className="min-h-11 rounded-lg border border-[#e7ddcd] bg-white px-3 text-sm font-semibold text-[#173a2a] outline-none transition placeholder:text-[#9a9f97] focus:border-[#0c6a3c] focus:ring-4 focus:ring-[#0c6a3c]/10"
                  disabled={isIndexingDocument}
                />
                <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:grid-cols-1 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                  <input
                    value={documentForm.category}
                    onChange={(event) => setDocumentForm((current) => ({ ...current, category: event.target.value }))}
                    placeholder="Danh mục"
                    className="min-h-11 min-w-0 rounded-lg border border-[#e7ddcd] bg-white px-3 text-sm font-semibold text-[#173a2a] outline-none transition placeholder:text-[#9a9f97] focus:border-[#0c6a3c] focus:ring-4 focus:ring-[#0c6a3c]/10"
                    disabled={isIndexingDocument}
                  />
                  <input
                    value={documentForm.sourceUrl}
                    onChange={(event) => setDocumentForm((current) => ({ ...current, sourceUrl: event.target.value }))}
                    placeholder="Nguồn URL"
                    className="min-h-11 min-w-0 rounded-lg border border-[#e7ddcd] bg-white px-3 text-sm font-semibold text-[#173a2a] outline-none transition placeholder:text-[#9a9f97] focus:border-[#0c6a3c] focus:ring-4 focus:ring-[#0c6a3c]/10"
                    disabled={isIndexingDocument}
                  />
                </div>
                <textarea
                  value={documentForm.content}
                  onChange={(event) => setDocumentForm((current) => ({ ...current, content: event.target.value }))}
                  placeholder="Dán thông tin phụ tùng, mã hàng, dòng máy, mô tả kỹ thuật..."
                  className="min-h-28 resize-none rounded-lg border border-[#e7ddcd] bg-white px-3 py-3 text-sm font-medium leading-6 text-[#173a2a] outline-none transition placeholder:text-[#9a9f97] focus:border-[#0c6a3c] focus:ring-4 focus:ring-[#0c6a3c]/10"
                  disabled={isIndexingDocument}
                />
                <input ref={fileInputRef} type="file" accept=".txt,.md,.json,.csv" onChange={onDocumentFileChange} className="hidden" />
                <button
                  type="submit"
                  disabled={!canIndexDocument || isIndexingDocument}
                  className="flex min-h-11 items-center justify-center gap-2 rounded-lg bg-[#0c4d2c] px-4 py-2.5 text-sm font-black text-white shadow-[0_10px_22px_rgba(12,77,44,0.18)] transition hover:bg-[#083f24] focus:outline-none focus:ring-2 focus:ring-[#0c6a3c]/35 focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-[#bcc4ba]"
                >
                  <Icon name="database" className="h-4 w-4" />
                  <span>{isIndexingDocument ? "Đang index" : "Index tài liệu"}</span>
                </button>
              </form>
              {documentStatus ? (
                <p
                  className={`mt-3 rounded-lg border px-3 py-2 text-xs font-bold leading-5 ${
                    documentStatus.type === "success"
                      ? "border-[#bfe4ca] bg-[#effaf2] text-[#0c6a3c]"
                      : "border-red-200 bg-red-50 text-red-700"
                  }`}
                >
                  {documentStatus.message}
                </p>
              ) : null}
            </section>

            <section className="mt-5 border-t border-[#eadfce] pt-5">
              <p className="mb-3 text-sm font-black text-[#173a2a]">Cơ chế RAG</p>
              <div className="grid grid-cols-[repeat(3,minmax(0,1fr))] gap-2">
                {ragSteps.map((step, index) => (
                  <div key={step.label} className="relative min-w-0 rounded-lg border border-[#e7ddcd] bg-[#fffaf1] p-2.5">
                    <span className="grid h-6 w-6 place-items-center rounded-full bg-[#0c4d2c] text-xs font-black text-white">
                      {index + 1}
                    </span>
                    <Icon name={step.icon} className="mt-3 h-7 w-7 text-[#0c4d2c]" />
                    <p className="mt-2 text-xs font-black text-[#173a2a]">{step.label}</p>
                    <p className="mt-1 text-[11px] leading-4 text-[#657267]">{step.caption}</p>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </aside>

        <section className="flex min-h-[680px] min-w-0 flex-col overflow-hidden rounded-lg border border-[#e8ddcb] bg-[#fffdf8] shadow-[0_20px_70px_rgba(24,39,30,0.13)] lg:min-h-[calc(100dvh-2.5rem)]">
          <header className="border-b border-[#e8ddcb] bg-white/90 px-4 py-4 backdrop-blur sm:px-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex min-w-0 items-center gap-4">
                <span className="relative grid h-12 w-12 shrink-0 place-items-center rounded-lg bg-[#0c4d2c] text-white shadow-[0_10px_25px_rgba(12,77,44,0.22)]">
                  <Icon name="bot" className="h-7 w-7" />
                  <span className="absolute -right-0.5 -top-0.5 h-3.5 w-3.5 rounded-full border-2 border-white bg-[#2fb463]" />
                </span>
                <div className="min-w-0">
                  <h2 className="truncate text-xl font-black text-[#14251c]">Trợ lý phụ tùng</h2>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-[#758174]">
                    <span className="flex items-center gap-1.5 font-bold text-[#13864f]">
                      <span className="h-2.5 w-2.5 rounded-full bg-[#2fb463]" />
                      Online
                    </span>
                    <span className="hidden h-1 w-1 rounded-full bg-[#c9c2b7] sm:block" />
                    <span>Sẵn sàng hỗ trợ tra cứu phụ tùng</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-[#0c4d2c] px-4 py-2 text-sm font-black text-white shadow-[0_10px_25px_rgba(12,77,44,0.22)]">
                  Parts RAG
                </span>
                <button
                  type="button"
                  className="grid h-10 w-10 place-items-center rounded-full border border-[#d8d3ca] bg-white text-[#657267] transition hover:border-[#0c4d2c] hover:text-[#0c4d2c] focus:outline-none focus:ring-2 focus:ring-[#0c6a3c]/25"
                  aria-label="Thông tin trợ lý"
                >
                  <Icon name="info" className="h-5 w-5" />
                </button>
              </div>
            </div>
          </header>

          <div
            className="flex-1 space-y-5 overflow-y-auto bg-[radial-gradient(circle_at_16%_12%,rgba(12,77,44,0.07),transparent_26%),radial-gradient(circle_at_85%_68%,rgba(183,121,29,0.08),transparent_30%),linear-gradient(180deg,#fffdf8_0%,#fbf8f1_100%)] px-4 py-5 sm:px-6 lg:px-8"
            aria-live="polite"
          >
            {messages.map((message) => (
              <MessageBubble key={message.id} message={message} />
            ))}

            {isLoading ? (
              <div className="flex max-w-[720px] items-start gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-[#0c4d2c] text-white shadow-[0_8px_20px_rgba(12,77,44,0.18)]">
                  <Icon name="bot" className="h-6 w-6" />
                </span>
                <div className="rounded-lg border border-[#e4ded3] bg-white px-4 py-3 shadow-[0_10px_30px_rgba(24,39,30,0.08)]">
                  <div className="flex items-center gap-3 text-sm font-semibold text-[#657267]">
                    <span className="h-2 w-2 animate-pulse rounded-full bg-[#0c4d2c]" />
                    Đang truy xuất danh mục phụ tùng...
                  </div>
                </div>
              </div>
            ) : null}
          </div>

          {error ? (
            <div className="mx-4 mb-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700 sm:mx-6" role="alert">
              {error}
            </div>
          ) : null}

          <form onSubmit={onSubmit} className="border-t border-[#e8ddcb] bg-white/95 p-3 sm:p-4">
            <label htmlFor="message" className="sr-only">
              Nhập câu hỏi cho chatbot
            </label>
            <div className="flex items-end gap-2 rounded-lg border border-[#dfd8cc] bg-white p-2 shadow-[0_12px_35px_rgba(24,39,30,0.08)] focus-within:border-[#0c6a3c] focus-within:ring-4 focus-within:ring-[#0c6a3c]/10">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="grid h-11 w-11 shrink-0 place-items-center rounded-lg border border-[#e1dbd0] bg-[#f8f5ef] text-[#6b756a] transition hover:border-[#0c4d2c] hover:text-[#0c4d2c] focus:outline-none focus:ring-2 focus:ring-[#0c6a3c]/25"
                aria-label="Nạp tài liệu"
              >
                <Icon name="paperclip" className="h-5 w-5" />
              </button>
              <textarea
                ref={inputRef}
                id="message"
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    void sendMessage(input);
                  }
                }}
                placeholder="Nhập câu hỏi về phụ tùng, mã phụ tùng, dòng máy, giá..."
                className="max-h-32 min-h-11 min-w-0 flex-1 resize-none border-0 bg-transparent px-2 py-2.5 text-base leading-6 text-[#1e3026] outline-none placeholder:text-[#8b9189]"
                disabled={isLoading}
              />
              <button
                type="button"
                className="hidden h-11 w-11 shrink-0 place-items-center rounded-lg border border-[#e1dbd0] bg-white text-[#6b756a] transition hover:border-[#0c4d2c] hover:text-[#0c4d2c] focus:outline-none focus:ring-2 focus:ring-[#0c6a3c]/25 sm:grid"
                aria-label="Tìm kiếm"
              >
                <Icon name="search" className="h-5 w-5" />
              </button>
              <button
                type="submit"
                disabled={isLoading || !input.trim()}
                className="flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-lg bg-[#0c4d2c] px-4 py-2.5 text-base font-black text-white shadow-[0_10px_22px_rgba(12,77,44,0.22)] transition hover:bg-[#083f24] focus:outline-none focus:ring-2 focus:ring-[#0c6a3c]/35 focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-[#bcc4ba] sm:px-5"
              >
                <Icon name="plane" className="h-5 w-5" />
                <span>{isLoading ? "Đang gửi" : "Gửi"}</span>
              </button>
            </div>
            <p className="mt-3 text-center text-xs font-medium text-[#8a8f86]">Trả lời dựa trên dữ liệu công khai được thu thập và chuẩn hóa.</p>
          </form>
        </section>
      </section>
    </main>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";

  if (isUser) {
    return (
      <article className="ml-auto flex max-w-[min(620px,88%)] justify-end">
        <div className="rounded-lg border border-[#ead7b8] bg-[#fff4df] px-4 py-3 text-[#1f2f25] shadow-[0_10px_28px_rgba(92,69,35,0.1)]">
          <p className="whitespace-pre-wrap text-sm leading-6 sm:text-base">{message.content}</p>
          <div className="mt-2 flex items-center justify-end gap-2 text-xs font-semibold text-[#8a795f]">
            <span>{message.createdAt}</span>
            <span className="flex text-[#0c4d2c]" aria-label="Đã gửi">
              <Icon name="check" className="h-3.5 w-3.5" />
              <Icon name="check" className="-ml-1 h-3.5 w-3.5" />
            </span>
          </div>
        </div>
      </article>
    );
  }

  return (
    <article className="mr-auto flex max-w-[min(760px,94%)] items-start gap-3">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-[#0c4d2c] text-white shadow-[0_8px_20px_rgba(12,77,44,0.18)]">
        <Icon name="bot" className="h-6 w-6" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="rounded-lg border border-[#e4ded3] bg-white px-4 py-3 text-[#1f2f25] shadow-[0_10px_30px_rgba(24,39,30,0.08)]">
          <p className="whitespace-pre-wrap text-sm leading-6 sm:text-base">{message.content}</p>
          <p className="mt-3 text-xs font-semibold text-[#8a8f86]">{message.createdAt}</p>
        </div>
        {message.sources && message.sources.length > 0 ? <SourceCards sources={message.sources} /> : null}
      </div>
    </article>
  );
}

function SourceCards({ sources }: { sources: Source[] }) {
  return (
    <div className="mt-3 grid gap-3">
      {sources.slice(0, 4).map((source) => (
        <SourceCard key={`${source.productName}-${source.sourceUrl}`} source={source} />
      ))}
    </div>
  );
}

function SourceCard({ source }: { source: Source }) {
  const canOpen = isOpenableSourceUrl(source.sourceUrl);
  const className =
    "group overflow-hidden rounded-lg border border-[#e2dbd0] bg-white text-sm shadow-[0_12px_35px_rgba(24,39,30,0.08)] transition hover:-translate-y-0.5 hover:border-[#c99135] focus:outline-none focus:ring-2 focus:ring-[#0c6a3c]/25 focus:ring-offset-2";
  const content = (
    <>
      <div className="grid gap-0 sm:grid-cols-[148px_minmax(0,1fr)]">
        <ProductImage source={source} />
        <div className="min-w-0 p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <h3 className="min-w-0 flex-1 text-base font-black leading-6 text-[#162a20]">{source.productName}</h3>
            <span className="rounded-full bg-[#eaf7ee] px-3 py-1 text-xs font-black text-[#0c6a3c]">{canOpen ? "Nguồn" : "Nội bộ"}</span>
          </div>
          <dl className="mt-4 grid gap-2 text-[13px] leading-5 text-[#4c5a50]">
            <SourceMeta icon="file" label="Danh mục" value={source.category ?? "Chưa phân loại"} />
            <SourceMeta icon="gauge" label="Giá hiển thị" value={source.priceText ?? "Liên hệ"} />
            <SourceMeta icon="link" label="Website" value={getSourceHost(source.sourceUrl)} />
            <SourceMeta icon="scan" label="Điểm khớp" value={`${Math.round(source.score * 100)}%`} />
          </dl>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#ebe5dc] bg-[#fbf8f1] px-4 py-2.5 text-xs font-semibold text-[#717b71]">
        <span>Nguồn tham khảo</span>
        <span className="flex items-center gap-1 text-[#0c4d2c]">
          {canOpen ? "Mở sản phẩm" : "Tài liệu tự nhập"}
          {canOpen ? <Icon name="external" className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" /> : null}
        </span>
      </div>
    </>
  );

  if (!canOpen) {
    return (
      <div className={className} role="group" aria-label={`Nguồn phụ tùng ${source.productName}`}>
        {content}
      </div>
    );
  }

  return (
    <a href={source.sourceUrl ?? "#"} target="_blank" rel="noreferrer" className={className} aria-label={`Mở nguồn phụ tùng ${source.productName}`}>
      {content}
    </a>
  );
}

function ProductImage({ source }: { source: Source }) {
  const imageUrl = source.imageUrl;
  const isUsefulImage = imageUrl && !imageUrl.includes("like-icon") && !imageUrl.includes("no_image");

  if (!isUsefulImage) {
    return (
      <div className="grid min-h-36 place-items-center bg-[linear-gradient(135deg,#f5e6c8,#fff7e8_48%,#e7f4ec)] p-4">
        <span className="grid h-20 w-20 place-items-center rounded-lg bg-white/80 text-[#0c4d2c] shadow-[0_12px_30px_rgba(24,39,30,0.12)]">
          <Icon name="track" className="h-10 w-10" />
        </span>
      </div>
    );
  }

  return (
    <div className="min-h-36 overflow-hidden bg-[#f5f0e8]">
      <img
        src={imageUrl}
        alt=""
        className="h-full min-h-36 w-full object-cover transition duration-300 group-hover:scale-[1.03]"
        loading="lazy"
      />
    </div>
  );
}

function SourceMeta({ icon, label, value }: { icon: IconName; label: string; value: string }) {
  return (
    <div className="grid grid-cols-[18px_88px_minmax(0,1fr)] items-center gap-2">
      <Icon name={icon} className="h-4 w-4 text-[#657267]" />
      <dt className="font-semibold text-[#657267]">{label}</dt>
      <dd className="truncate font-bold text-[#23372b]">{value}</dd>
    </div>
  );
}

function getSourceHost(sourceUrl: string | null) {
  if (!sourceUrl) return "Nguồn sản phẩm";
  if (sourceUrl.startsWith("manual://")) return "Tài liệu tự nhập";

  try {
    return new URL(sourceUrl).hostname.replace(/^www\./, "");
  } catch {
    return sourceUrl;
  }
}

function isOpenableSourceUrl(sourceUrl: string | null) {
  return /^https?:\/\//i.test(sourceUrl ?? "");
}

function Icon({ name, className = "h-5 w-5" }: { name: IconName; className?: string }) {
  const common = {
    className,
    fill: "none",
    stroke: "currentColor",
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    strokeWidth: 2,
    viewBox: "0 0 24 24",
    "aria-hidden": true,
  };

  switch (name) {
    case "bot":
      return (
        <svg {...common}>
          <path d="M12 7V4" />
          <rect x="5" y="7" width="14" height="12" rx="5" />
          <path d="M8.5 12h.01" />
          <path d="M15.5 12h.01" />
          <path d="M9.5 16c1.5 1 3.5 1 5 0" />
          <path d="M4 13H2" />
          <path d="M22 13h-2" />
        </svg>
      );
    case "box":
      return (
        <svg {...common}>
          <path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z" />
          <path d="M12 12 4.3 7.7" />
          <path d="M12 12v9" />
          <path d="m12 12 7.7-4.3" />
          <path d="m8 5.3 8 4.5" />
        </svg>
      );
    case "bolt":
      return (
        <svg {...common}>
          <path d="m13 2-9 13h7l-1 7 9-13h-7l1-7Z" />
        </svg>
      );
    case "check":
      return (
        <svg {...common}>
          <path d="m5 12 4 4L19 6" />
        </svg>
      );
    case "chevron":
      return (
        <svg {...common}>
          <path d="M5 12h14" />
          <path d="m13 6 6 6-6 6" />
        </svg>
      );
    case "clipboard":
      return (
        <svg {...common}>
          <path d="M9 4h6l1 2h3v15H5V6h3l1-2Z" />
          <path d="M9 10h6" />
          <path d="M9 14h6" />
          <path d="M9 18h4" />
        </svg>
      );
    case "database":
      return (
        <svg {...common}>
          <ellipse cx="12" cy="5" rx="7" ry="3" />
          <path d="M5 5v6c0 1.7 3.1 3 7 3s7-1.3 7-3V5" />
          <path d="M5 11v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6" />
        </svg>
      );
    case "engine":
      return (
        <svg {...common}>
          <path d="M7 10h8l3 3v5H7v-8Z" />
          <path d="M3 13h4" />
          <path d="M18 15h3" />
          <path d="M10 7v3" />
          <path d="M8 7h5" />
          <path d="M10 18v2" />
          <path d="M15 18v2" />
        </svg>
      );
    case "external":
      return (
        <svg {...common}>
          <path d="M14 4h6v6" />
          <path d="m10 14 10-10" />
          <path d="M20 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h5" />
        </svg>
      );
    case "file":
      return (
        <svg {...common}>
          <path d="M7 3h7l4 4v14H7V3Z" />
          <path d="M14 3v5h5" />
          <path d="M9 13h6" />
          <path d="M9 17h4" />
        </svg>
      );
    case "gauge":
      return (
        <svg {...common}>
          <path d="M4 14a8 8 0 1 1 16 0" />
          <path d="M12 14 16 9" />
          <path d="M8 17h8" />
        </svg>
      );
    case "info":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 10v6" />
          <path d="M12 7h.01" />
        </svg>
      );
    case "link":
      return (
        <svg {...common}>
          <path d="M10 13a5 5 0 0 0 7.1 0l1.4-1.4a5 5 0 0 0-7.1-7.1L10.5 5" />
          <path d="M14 11a5 5 0 0 0-7.1 0l-1.4 1.4a5 5 0 0 0 7.1 7.1l.9-.9" />
        </svg>
      );
    case "paperclip":
      return (
        <svg {...common}>
          <path d="m21 11-8.5 8.5a6 6 0 0 1-8.5-8.5L13 2a4 4 0 0 1 5.7 5.7l-9 9a2 2 0 1 1-2.8-2.8L15 5.8" />
        </svg>
      );
    case "plane":
      return (
        <svg {...common}>
          <path d="M22 2 11 13" />
          <path d="m22 2-7 20-4-9-9-4 20-7Z" />
        </svg>
      );
    case "scan":
      return (
        <svg {...common}>
          <path d="M8 3H5a2 2 0 0 0-2 2v3" />
          <path d="M16 3h3a2 2 0 0 1 2 2v3" />
          <path d="M8 21H5a2 2 0 0 1-2-2v-3" />
          <path d="M16 21h3a2 2 0 0 0 2-2v-3" />
          <path d="M7 12h10" />
        </svg>
      );
    case "search":
      return (
        <svg {...common}>
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
      );
    case "seal":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="8" />
          <circle cx="12" cy="12" r="4" />
        </svg>
      );
    case "spark":
      return (
        <svg {...common}>
          <path d="m12 2 1.8 6.2L20 10l-6.2 1.8L12 18l-1.8-6.2L4 10l6.2-1.8L12 2Z" />
          <path d="m19 16 .8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8L19 16Z" />
        </svg>
      );
    case "track":
      return (
        <svg {...common}>
          <rect x="3" y="8" width="18" height="9" rx="4.5" />
          <circle cx="8" cy="12.5" r="1.5" />
          <circle cx="12" cy="12.5" r="1.5" />
          <circle cx="16" cy="12.5" r="1.5" />
          <path d="M7 6h10" />
        </svg>
      );
  }
}

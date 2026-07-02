# Phúc Long RAG Chatbot

Next.js chatbot tiếng Việt dùng OpenAI + Supabase pgvector để truy xuất dữ liệu sản phẩm công khai từ `https://phuclong.com/`.

## Tính năng

- Crawl dữ liệu sản phẩm từ các trang công khai của Phúc Long.
- Chuẩn hóa sản phẩm thành JSON.
- Tạo embeddings bằng OpenAI `text-embedding-3-small`.
- Lưu sản phẩm/chunks vào Supabase Postgres + pgvector.
- Hybrid search: vector similarity + full-text keyword rank + boost theo tên/danh mục.
- API chat RAG trả lời tiếng Việt có nguồn tham khảo.
- UI chat responsive bằng Next.js App Router + Tailwind CSS.

## Cài đặt

```bash
cd /Users/vuhaituan/Downloads/TTNT/phuclong-rag-chatbot
npm install
cp .env.example .env.local
```

Điền biến môi trường trong `.env.local`:

```env
OPENAI_API_KEY=sk-...
OPENAI_CHAT_MODEL=gpt-4.1-mini
OPENAI_EMBEDDING_MODEL=text-embedding-3-small
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
CRAWL_BASE_URL=https://phuclong.com
CRAWL_MAX_PAGES=120
CRAWL_DELAY_MS=800
```

> Không đưa `SUPABASE_SERVICE_ROLE_KEY` lên frontend hoặc public repo.

## Tạo database Supabase

1. Mở Supabase SQL Editor.
2. Chạy toàn bộ file `supabase/schema.sql`.
3. Kiểm tra đã có bảng `products`, `product_chunks` và function `hybrid_search_product_chunks`.

## Crawl dữ liệu công khai

```bash
npm run crawl
```

Output được lưu tại:

```text
data/phuclong-products.json
```

Crawler chỉ truy cập trang public cùng host, bỏ qua các URL đăng nhập, giỏ hàng, checkout, account/admin và có delay giữa requests.

## Ingest vào Supabase

```bash
npm run ingest
```

Lệnh này sẽ:

1. Đọc `data/phuclong-products.json`.
2. Upsert bảng `products` theo `source_url`.
3. Tạo chunks tóm tắt/chi tiết.
4. Gọi OpenAI embeddings.
5. Ghi chunks + vector vào `product_chunks`.

## Chạy app

```bash
npm run dev
```

Mở `http://localhost:3000` và thử:

- `Gợi ý sản phẩm trà trái cây dễ uống?`
- `Sản phẩm nào phù hợp nếu tôi thích cà phê?`
- `Tôi muốn phản hồi về món Trà Đào, chatbot nên hỏi gì tiếp?`

## API

### `POST /api/chat`

Body:

```json
{
  "message": "Gợi ý trà trái cây dễ uống?",
  "history": []
}
```

Response:

```json
{
  "answer": "...",
  "sources": [
    {
      "productName": "...",
      "category": "...",
      "priceText": "...",
      "sourceUrl": "...",
      "imageUrl": "...",
      "score": 0.8
    }
  ]
}
```

### `GET /api/search?q=...`

Debug endpoint để xem chunks/scores được retrieve.

## Kiểm tra

```bash
npm run typecheck
npm run build
```

End-to-end checklist:

1. `npm run crawl` tạo được JSON có sản phẩm.
2. `npm run ingest` ghi rows vào Supabase.
3. `/api/search?q=tra dao` trả về chunks liên quan.
4. UI chat trả lời có nguồn và không bịa dữ liệu khi context thiếu.

## Lưu ý

- Dữ liệu phụ thuộc HTML/metadata public của website; nếu markup đổi, cần chỉnh parser trong `lib/crawl/phuclong.ts`.
- Chatbot không biết tồn kho/khuyến mãi/giá mới nhất nếu dữ liệu crawl không có thông tin đó.
- Đây là bản khởi đầu để bạn mở rộng thêm feedback workflow, dashboard review phản hồi, hoặc admin re-crawl theo lịch.

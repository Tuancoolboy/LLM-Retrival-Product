# Phúc Long Parts RAG Chatbot

Next.js chatbot tiếng Việt dùng OpenAI + Supabase pgvector để truy xuất dữ liệu phụ tùng/cơ khí công khai từ `https://phuclong.com/`.

## Tính năng

- Crawl dữ liệu phụ tùng từ các trang sản phẩm/collections công khai của Phúc Long.
- Chuẩn hóa sản phẩm phụ tùng thành JSON.
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

Mặc định crawler dùng domain phụ tùng/cơ khí `https://phuclong.com/` và collection tất cả sản phẩm. Nếu website đổi path, cập nhật lại `CRAWL_COLLECTION_PATH` tới trang danh mục công khai mà bạn được phép crawl.

### Cách crawl

1. Cập nhật `.env.local`:

```env
CRAWL_BASE_URL=https://phuclong.com
# Đổi path này thành trang products/collections phụ tùng thực tế nếu website có path khác.
CRAWL_COLLECTION_PATH=/collections/tat-ca-san-pham
CRAWL_COLLECTION_START_PAGE=1
CRAWL_COLLECTION_END_PAGE=20
CRAWL_MAX_PAGES=200
CRAWL_DELAY_MS=800
```

2. Chạy crawler:

```bash
npm run crawl
```

3. Kiểm tra output:

```text
data/phuclong-products.json
```

4. Nếu JSON rỗng hoặc thiếu sản phẩm, hãy mở website, copy đúng link danh mục/sản phẩm public, rồi đặt lại `CRAWL_BASE_URL`/`CRAWL_COLLECTION_PATH` trước khi ingest.

Crawler chỉ truy cập trang public cùng host, ưu tiên link collections/products, bỏ qua URL đăng nhập, giỏ hàng, checkout, account/admin/news và có delay giữa requests.

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

- `Tôi cần bộ xích cho D9R, có sản phẩm nào liên quan?`
- `Bơm thủy lực K3V63DT có thông tin gì?`
- `Có phụ tùng gầm máy nào cho D155A-1?`

## API

### `POST /api/chat`

Body:

```json
{
  "message": "Tôi cần bộ xích cho D9R, có sản phẩm nào liên quan?",
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
3. `/api/search?q=bo xich D9R` trả về chunks liên quan.
4. UI chat trả lời có nguồn và không bịa dữ liệu khi context thiếu.

## Lưu ý

- Dữ liệu phụ thuộc HTML/metadata public của website; nếu markup đổi, cần chỉnh parser trong `lib/crawl/phuclong.ts`.
- Chatbot không biết tồn kho/khuyến mãi/giá mới nhất nếu dữ liệu crawl không có thông tin đó.
- Đây là bản khởi đầu để bạn mở rộng thêm feedback workflow, dashboard review phản hồi, hoặc admin re-crawl theo lịch.
# LLM-Retrival-Product

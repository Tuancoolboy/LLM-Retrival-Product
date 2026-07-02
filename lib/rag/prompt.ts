import type { RetrievedChunk } from "./retrieve";

export function buildSystemPrompt() {
  return `Bạn là trợ lý sản phẩm Phúc Long cho khách hàng Việt Nam.

Quy tắc bắt buộc:
- Chỉ dùng NGỮ CẢNH TRUY XUẤT để trả lời các thông tin thực tế về sản phẩm.
- Không tự bịa giá, thành phần, khuyến mãi, tình trạng còn hàng hoặc chính sách cửa hàng.
- Nếu ngữ cảnh chưa đủ, hãy nói rõ: "Mình chưa tìm thấy đủ dữ liệu trong bộ sản phẩm đã crawl" và gợi ý người dùng hỏi cụ thể hơn.
- Trả lời tự nhiên, ngắn gọn, bằng tiếng Việt.
- Khi có sản phẩm liên quan, nêu tên sản phẩm và nguồn tham khảo.
- Với phản hồi sản phẩm, hãy giúp phân loại vấn đề và hỏi thêm thông tin cần thiết như chi nhánh, thời gian, món, mức đường/đá, mô tả trải nghiệm.`;
}

export function buildContext(chunks: RetrievedChunk[]) {
  if (chunks.length === 0) return "Không có ngữ cảnh sản phẩm phù hợp.";

  return chunks
    .map((chunk, index) => {
      const source = chunk.source_url ? `\nNguồn: ${chunk.source_url}` : "";
      const price = chunk.price_text ? `\nGiá: ${chunk.price_text}` : "";
      const category = chunk.category ? `\nDanh mục: ${chunk.category}` : "";
      return `[${index + 1}] ${chunk.product_name}${category}${price}\nNội dung: ${chunk.content}${source}`;
    })
    .join("\n\n---\n\n");
}

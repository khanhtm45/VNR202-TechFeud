# VNR202 TechFeud — HÀNH TRÌNH ĐỔI MỚI

Gameshow tiếng Việt cho môn **Lịch sử Đảng Cộng sản Việt Nam (VNR202)**: Đại hội XI (2011), Đại hội XII (2016), bảo vệ môi trường và thích ứng với biến đổi khí hậu.

## 🆕 Chế độ TRỰC TUYẾN: 8 đội, 8 điện thoại, chấm điểm tự động

**Các màn hình mới:**

- 🎛 [MC tạo phòng trực tuyến](https://khanhtm45.github.io/VNR202-TechFeud/live.html?mode=host)
- 📱 [Đội chơi dùng điện thoại tham gia](https://khanhtm45.github.io/VNR202-TechFeud/live.html?mode=player)
- 📺 [Máy chiếu đồng bộ phòng trực tuyến](https://khanhtm45.github.io/VNR202-TechFeud/live.html?mode=board)

**Trạng thái:** Mã nguồn giao diện + Cloud Functions + Firestore Rules đã có trên GitHub. **Chưa thể tạo phòng thật cho đến khi chủ dự án kết nối Firebase và deploy backend.** Trang này chủ động thông báo thiếu cấu hình, không giả lập phòng chơi thật.

**[HƯỚNG DẪN CÀI ĐẶT FIREBASE VÀ CHẠY 8 ĐIỆN THOẠI](./MULTIPLAYER_SETUP.md)**

- MC tải tệp câu hỏi có đáp án **riêng tư** trên máy của mình và tạo phòng 6 chữ số; không đưa đáp án lên GitHub Pages.
- Mỗi đội tự nhập tên trên điện thoại, giới hạn 8 đội, không có tên đội cố định.
- Mỗi đội trả lời một lần/câu; Firebase Cloud Functions chấm điểm theo đáp án và thời gian trên server.
- Hết giờ, nếu tab MC vẫn mở và kết nối, game tự yêu cầu chấm điểm và hiện bảng xếp hạng.
- Vòng 2 của **bản online** dùng 4 lựa chọn để chấm tự động; không còn cơ chế đoán nhiều đáp án Family Feud.
- **Cloud Functions yêu cầu Firebase Blaze (liên kết tài khoản thanh toán)**. Có hạn mức miễn phí nhưng không bảo đảm không phát sinh phí.

## Bản CỤC BỘ trên GitHub Pages — 8 đội, cùng một trình duyệt

**[Mở VNR202 Gameshow](https://khanhtm45.github.io/VNR202-TechFeud/)**

- [Trang chủ](https://khanhtm45.github.io/VNR202-TechFeud/?view=home)
- [Màn hình trình chiếu](https://khanhtm45.github.io/VNR202-TechFeud/?view=board)
- [Bảng điều khiển MC](https://khanhtm45.github.io/VNR202-TechFeud/?view=host)

Bản thiết kế mới dùng phong cách **đỏ rượu vang / tím đậm / vàng đồng / xanh ngọc**, cùng giao diện thẻ đội và bảng điểm nhất quán. Có **8 đội** mặc định (Đội 1…Đội 8) được hiển thị ở trang chủ theo bố cục **4 cột × 2 hàng**, không còn giới hạn hai đội như trước.

### Cách thuyết trình trên lớp

1. Mở trang **Điều khiển MC** trên laptop, sửa tên 8 đội bằng nút **✎** nếu cần.
2. Chọn **Mở tab máy chiếu** từ trang MC (hoặc mở link Máy chiếu).
3. Kéo tab máy chiếu sang màn hình chiếu ở chế độ **Extend**, bấm **Toàn màn hình**.
4. MC chọn vòng/câu hỏi, bật đồng hồ, công bố đáp án, chọn một trong **8 đội** để cộng điểm.
5. Có thể điều chỉnh **+10/−10** điểm độc lập cho từng đội, dùng **Công bố kết quả** để xem bảng xếp hạng 8 đội.

**Lưu ý kỹ thuật:** GitHub Pages là hosting tĩnh. Đồng bộ bảng MC ↔ máy chiếu sử dụng `localStorage` và `BroadcastChannel`, chỉ đảm bảo giữa **các tab trên cùng trình duyệt / cùng profile và cùng thiết bị**. Không đồng bộ giữa 8 điện thoại hay hai laptop độc lập. Không có PIN MC trên bản Pages; chỉ mở bảng điều khiển trong máy của người quản trò.

### Luật ba vòng

| Vòng | Chủ đề | Số câu | Tính điểm |
|---|---|---:|---|
| 01 · Dấu mốc lịch sử | Đại hội XI, XII | 6 | 10 điểm/câu |
| 02 · Giải mã Đại hội | Năm đáp án ẩn trên mỗi bảng | 2 | Tổng tối đa 100 điểm/bảng |
| 03 · Việt Nam xanh | Tình huống môi trường, biến đổi khí hậu | 3 | 40 điểm/câu |

Cả 8 đội có thể thi trả lời những câu hỏi trên, MC chọn đội được quyền trả lời và trao điểm. Game chưa tích hợp chuông bấm trực tuyến, hệ thống trả lời bằng điện thoại hoặc chấm đáp án tự động.

**Chấm điểm:** MC mở đáp án rồi trao điểm cho đội đã chọn; mỗi câu hỏi chỉ được trao tự động một lần, tránh cộng lặp. Điểm ở vòng 2 là trọng số trò chơi **30–25–20–15–10**, không phải kết quả khảo sát người chơi.

### Các tệp của bản GitHub Pages

| Tệp | Vai trò |
|---|---|
| `docs/index.html` | Trang chủ, bảng máy chiếu và bảng điều khiển MC |
| `docs/styles.css` | Giao diện desktop/mobile, theme dark plum/gold/teal |
| `docs/app.js` | Hiển thị 8 đội, điều khiển MC và đồng bộ các tab |
| `docs/engine.js` | Luật ba vòng, điểm của 8 đội, đồng hồ, chặn cộng trùng |
| `docs/questions.json` | Ngân hàng câu hỏi |
| `docs/favicon.svg` | Logo tab trình duyệt |
| `test/pages-engine.test.js` | Kiểm thử game tám đội và cú pháp JavaScript |

**Tự động triển khai:** commit lên nhánh `main` có thay đổi trong thư mục `docs/` sẽ chạy workflow `.github/workflows/pages.yml`. Xem [Actions](https://github.com/khanhtm45/VNR202-TechFeud/actions) để xác nhận trạng thái `Deploy VNR202 to GitHub Pages` là **Success**.

### Lưu ý về phiên bản Node.js

Ngoài bản Pages ở `docs/`, repo vẫn có **phiên bản server Node.js cũ** trong `server.js`/`public/` dùng Node 18+, SSE và PIN MC. **Phiên bản Node.js này chưa được nâng lên giao diện và cơ chế 8 đội mới**. Với yêu cầu 8 đội và trình chiếu trên lớp, hãy dùng bản **GitHub Pages** nêu trên.

## Cơ sở nội dung và nguồn cảm hứng

Câu hỏi được xây dựng từ tài liệu Session 26 (Đại hội XI) và Session 27 (Đại hội XII) do người dùng cung cấp. Phần tình huống môi trường là câu hỏi vận dụng do nhóm thiết kế, cần được giảng viên rà soát trước khi chấm chính thức.

Dự án lấy cảm hứng từ [TechFeud Classroom Edition](https://github.com/ImMaddd/TechFeud), nhưng là bản code riêng theo giấy phép MIT; không sao chép nguyên trạng source gốc.

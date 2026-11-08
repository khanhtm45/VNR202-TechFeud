# VNR202 TechFeud — HÀNH TRÌNH ĐỔI MỚI

Gameshow tiếng Việt phục vụ môn **Lịch sử Đảng Cộng sản Việt Nam (VNR202)**: Đại hội XI (2011), Đại hội XII (2016), bảo vệ môi trường và ứng phó biến đổi khí hậu.

## 🌐 Chơi trực tuyến trên GitHub Pages

**Trang game:** https://khanhtm45.github.io/VNR202-TechFeud/

- **Màn hình trình chiếu:** https://khanhtm45.github.io/VNR202-TechFeud/?view=board
- **Bảng điều khiển MC:** https://khanhtm45.github.io/VNR202-TechFeud/?view=host

**Để bật Pages lần đầu:** vào **Settings → Pages → Build and deployment → Source → GitHub Actions**. Workflow `.github/workflows/pages.yml` sẽ tự đóng gói thư mục `docs/` và triển khai khi cập nhật nhánh `main`. Xem tab **Actions** để kiểm tra trạng thái phát hành.

### Giới hạn của bản Pages (quan trọng)

GitHub Pages chỉ lưu trữ **file tĩnh**, không chạy Node.js. Vì vậy phiên bản `docs/index.html` sử dụng **localStorage + BroadcastChannel**, đồng bộ giữa các tab trong **cùng một trình duyệt / cùng hồ sơ trình duyệt trên một thiết bị**. Có thể kéo tab bảng chơi sang màn hình máy chiếu trong chế độ mở rộng (Extended display).

- Mở **MC** và **Máy chiếu** trong **hai tab cùng trình duyệt**.
- Dữ liệu và bảng điểm của bản Pages được lưu **trên trình duyệt đang sử dụng**, không phải trên GitHub hay một server.
- **Không hỗ trợ đồng bộ hai điện thoại/laptop khác nhau qua Internet**, không có PIN bảo vệ thực sự trên bản Pages.
- Nếu cần đồng bộ nhiều thiết bị, dùng **bản Node.js** bên dưới hoặc dịch vụ backend chuyên dụng.

## 🖥️ Bản Node.js chạy trên laptop

Cần Node.js >= 18. Trong thư mục dự án chạy:

```bash
npm start
```

Địa chỉ: `http://localhost:3000/` (trang chủ / giao diện game), `/api/state` (trạng thái), `/api/host-state` (quản lý bằng PIN). Bản server dùng Server-Sent Events (SSE), lưu trạng thái ở `data/state.json` và PIN MC từ biến môi trường `HOST_PIN`. PIN mặc định cho máy cá nhân là `2026`; phải thay PIN trước khi mở truy cập mạng.

**Lưu ý:** Giao diện MC/máy chiếu tĩnh tại `docs/` hoạt động độc lập với backend Node.js; các phiên chơi không được chia sẻ giữa hai phiên bản này.

## 🎮 Ba vòng

| Vòng | Nội dung | Câu | Điểm |
| --- | --- | ---: | --- |
| 1 · Dấu mốc lịch sử | Trả lời nhanh Đại hội XI, XII | 6 | 10 điểm/câu |
| 2 · Giải mã Đại hội | Mở bảng 5 đáp án | 2 | Tối đa 100 điểm/bảng |
| 3 · Việt Nam xanh | Ứng phó các tình huống môi trường | 3 | 40 điểm/câu |

Điểm tại vòng 2 là trọng số do nhóm quy ước, **không phải khảo sát mức độ phổ biến**. Câu hỏi được biên soạn dựa trên Session 26 (Đại hội XI), Session 27 (Đại hội XII) và các tình huống vận dụng.

## Cấu trúc repo

- `docs/index.html` — web game tĩnh, dùng cho GitHub Pages (ba chế độ Home / Board / Host)
- `docs/questions.json` — ngân hàng câu hỏi của phiên bản Pages
- `.github/workflows/pages.yml` — triển khai Pages tự động
- `server.js`, `public/index.html`, `data/questions.json` — phiên bản Node.js riêng
- `test/smoke.test.js` — kiểm tra HTTP/API bản Node.js
- `.github/workflows/ci.yml` — workflow kiểm thử khi push

## Giấy phép

MIT. Dự án lấy cảm hứng từ [TechFeud Classroom Edition](https://github.com/ImMaddd/TechFeud); đây là phiên bản triển khai riêng cho môn VNR202.

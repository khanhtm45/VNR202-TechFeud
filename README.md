# VNR202 TechFeud — Hành trình Đổi mới

Gameshow **tiếng Việt** cho môn **Lịch sử Đảng Cộng sản Việt Nam (VNR202)**, chủ đề: Đại hội XI (2011), Đại hội XII (2016), các giải pháp bảo vệ môi trường và ứng phó với biến đổi khí hậu ở Việt Nam.

Lấy cảm hứng từ [TechFeud Classroom Edition](https://github.com/ImMaddd/TechFeud) của Alvin Berdandino (MIT). Đây là bản xây dựng riêng cho VNR202: vẫn giữ mô hình **màn hình MC + màn hình máy chiếu** và ba dạng câu hỏi, nhưng được triển khai mới bằng Node.js thuần / Server-Sent Events để có thể chạy **không phải cài thêm thư viện npm**. Không phải một fork sao chép nguyên trạng TechFeud.

## Cách chạy

Yêu cầu Node.js **18+**. Mở Terminal trong thư mục dự án:

```bash
npm start
```

- Trang chủ: `http://localhost:3000`
- **Màn hình máy chiếu:** `http://localhost:3000/board.html`
- **Màn hình MC:** `http://localhost:3000/host.html`
- PIN MC mặc định khi chạy trên máy cá nhân: `2026`.

Có thể đặt PIN riêng trước khi khởi động:

**Windows PowerShell**
```powershell
$env:HOST_PIN="doi-mat-khau-manh"; npm start
```

**macOS / Linux**
```bash
HOST_PIN="doi-mat-khau-manh" npm start
```

Trên máy chiếu, dùng `F11` để toàn màn hình. Để laptop điều khiển và máy chiếu xem ở hai thiết bị khác nhau, kết nối chung mạng LAN rồi truy cập `http://IP_CUA_MAY_CHAY_SERVER:3000/board.html` và `.../host.html`. Không đưa server trực tiếp ra Internet khi chưa có reverse proxy HTTPS và cấu hình bảo mật phù hợp.

## Ba vòng chơi

| Vòng | Loại | Số câu | Luật điểm |
| --- | --- | ---: | --- |
| 1. Dấu mốc lịch sử | Trả lời nhanh | 6 | Mỗi câu 10 điểm, MC xác nhận |
| 2. Giải mã Đại hội | 5 đáp án ẩn / bảng | 2 | 5 đáp án tổng 100 điểm; MC mở và trao điểm |
| 3. Thử thách Việt Nam xanh | Tình huống có hình minh họa | 3 | Mỗi câu 40 điểm, MC nhận xét giải pháp |

Vòng 2 giữ tinh thần Family Feud nhưng **điểm 30–25–20–15–10 được nhóm quy ước** cho mức độ ưu tiên trong gameshow, không phải kết quả khảo sát đám đông. Sau 3 dấu sai, MC có thể trao điểm cho đội giành quyền theo luật nhóm thống nhất.

## Tính năng

- Giao diện tiếng Việt, dark plum / vàng đồng / xanh ngọc, phù hợp máy chiếu 16:9.
- Đồng bộ tức thời MC → máy chiếu bằng Server-Sent Events (SSE).
- Đồng hồ đếm ngược, lật ô đáp án, hiệu ứng âm thanh bật/tắt, bảng điểm trực tiếp.
- Ngân hàng câu hỏi JSON và chỉnh sửa ngay trên trang MC.
- Không gửi đáp án bí mật xuống trình duyệt máy chiếu trước khi công bố.
- Chống cộng trùng điểm, cho phép sửa điểm thủ công khi cần.
- Tự lưu trạng thái điểm số vào `data/state.json` để khôi phục sau khi server khởi động lại (đồng hồ được tạm dừng an toàn).
- Trang MC được bảo vệ bằng PIN; không nên dùng PIN mặc định khi phát hành trên mạng.
- Hình tình huống là SVG vector nội bộ, không cần tải ảnh từ Internet.

## Chỉnh sửa câu hỏi

Vào **Màn hình MC → Chỉnh sửa ngân hàng câu hỏi (JSON)**, hoặc sửa `data/questions.json` bằng VS Code trước khi chạy. Tại mỗi `rounds.rapid`, `rounds.feud`, `rounds.green`:

- `id`: mã câu hỏi duy nhất.
- `question`: đề bài tiếng Việt.
- `duration`: thời gian trả lời (5–300 giây).
- `rapid` và `green`: `answer`, `points`.
- `green`: `hint`, `image` dạng `/assets/ten.svg` (thêm SVG vào `public/assets`).
- `feud`: có **đúng 5 đáp án**, trường `text`, `points` và **tổng điểm bằng 100**.

**Lưu bộ câu hỏi trên trang MC sẽ đặt lại phiên chơi và bảng điểm.** Nếu chỉnh tệp trực tiếp, khởi động lại server.

## Kiểm thử

```bash
npm test
```

Có bài kiểm thử đơn vị cho ba vòng, ngân hàng câu hỏi, chấm điểm và bộ đếm giờ; kèm bài kiểm thử tích hợp HTTP/API.

## Cấu trúc

```
VNR202-TechFeud/
├── data/questions.json       # Ngân hàng 11 câu
├── lib/engine.js             # Luật chơi, tính điểm, kiểm tra dữ liệu
├── public/index.html         # Trang chủ
├── public/board.html         # Màn hình máy chiếu
├── public/host.html          # Điều khiển MC
├── public/styles.css         # Giao diện 16:9 responsive
├── public/board.js           # Bảng chơi và cập nhật SSE
├── public/host.js            # Điều khiển và chỉnh sửa câu hỏi
├── public/assets/*.svg      # 3 tình huống môi trường
├── test/*.test.js            # Test đơn vị và API
├── server.js                 # Node HTTP server, bảo vệ MC, SSE
└── package.json
```

## Hướng dẫn đưa lên GitHub

1. Đăng nhập GitHub, tạo repository trống **`VNR202-TechFeud`** (chọn Private nếu muốn giới hạn người xem).
2. Trong thư mục source đã giải nén, mở Terminal và chạy:

```bash
git init
git add .
git commit -m "Initial VNR202 TechFeud gameshow"
git branch -M main
git remote add origin https://github.com/TEN_TAI_KHOAN/VNR202-TechFeud.git
git push -u origin main
```

Hãy thay `TEN_TAI_KHOAN` bằng username GitHub của bạn và bảo đảm repo đã được tạo trước khi `git push`.

## Cơ sở nội dung VNR202

Nội dung được biên soạn bám sát slide `Session 26.pptx.pdf` (Đại hội XI) và `Session 27.pptx.pdf` (Đại hội XII) người dùng cung cấp. Các tình huống môi trường ở vòng 3 là **câu hỏi vận dụng do nhóm thiết kế**, không phải đoạn trích nguyên văn. Cần nhờ giảng viên kiểm tra câu hỏi/đáp án trước khi chấm chính thức.

## Giấy phép

MIT — xem `LICENSE`. Dự án gốc được nhắc đến với vai trò nguồn cảm hứng và tham khảo kiến trúc; phiên bản này là mã được viết mới.

### Cách nhanh trên Windows (tự tạo repo bằng một lệnh)

Nếu máy bạn đã cài **Git** và **GitHub CLI**, hãy chạy `gh auth login` một lần, rồi mở PowerShell tại thư mục dự án:

```powershell
.\publish-github.ps1
```

Script sẽ khởi tạo Git, commit source, tạo repo **private** `VNR202-TechFeud` trong tài khoản đang đăng nhập GitHub CLI và push lên nhánh `main`. Muốn repo public, dùng `.\publish-github.ps1 -Public`. Script không tự ghi đè repository đã tồn tại.

**Lưu ý:** GitHub Pages không thể chạy server Node.js của game này; khi thuyết trình hãy chạy `npm start` trên laptop hoặc triển khai lên một dịch vụ hỗ trợ Node.js.

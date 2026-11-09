# VNR202 — HÀNH TRÌNH ĐỔI MỚI

Gameshow môn **Lịch sử Đảng Cộng sản Việt Nam (VNR202)**: Đại hội XI (2011), Đại hội XII (2016), bảo vệ môi trường và ứng phó biến đổi khí hậu.

## 🎮 Chế độ ONLINE — GitHub Pages + Supabase Free

**8 đội tự đăng ký bằng điện thoại.** MC không phải tạo sẵn tên đội và không phải cộng điểm thủ công. **Link MC không cấp quyền:** chỉ MC đã đăng nhập bằng tên và mật khẩu riêng trong Supabase mới có thể tạo hoặc điều khiển phòng.

| Màn hình | Đường dẫn |
|---|---|
| 🎛 MC tạo phòng / chấm điểm | https://khanhtm45.github.io/VNR202-TechFeud/live.html?mode=host |
| 📱 Người đại diện đội | https://khanhtm45.github.io/VNR202-TechFeud/live.html?mode=player |
| 📺 Máy chiếu trực tiếp | https://khanhtm45.github.io/VNR202-TechFeud/live.html?mode=board |

### Trạng thái triển khai
- **Đã code + push GitHub:** Giao diện ba loại thiết bị, tạo phòng 6 số/QR, đội tự nhập tên, giới hạn 8 đội, bảng xếp hạng, đồng bộ qua Supabase Realtime.
- **Đã code:** PostgreSQL RPC \`SECURITY DEFINER\` kiểm tra MC, phòng, đáp án, thời gian, chống gửi trùng, tự chấm điểm và không tiết lộ đáp án đúng trước khi công bố.
- **Đã code:** RLS chỉ cho người tham gia hoặc được cấp quyền xem bảng chiếu đọc bảng điểm; không cho browser cập nhật điểm hay đọc bảng đáp án.
- **Chưa hoàn thành:** Chủ dự án chưa kích hoạt tài khoản MC và cần bật Anonymous Sign-Ins trong Supabase Authentication; chưa kiểm thử cả 8 điện thoại. Database và cấu hình GitHub Pages đã được triển khai. **Chưa thể tạo phòng MC cho tới khi kích hoạt tài khoản và bật đăng nhập ẩn danh.**

➡️ **[HƯỚNG DẪN KÍCH HOẠT SUPABASE FREE (không cần Google Cloud Billing)](./SUPABASE_SETUP.md)**

### Cách chơi (sau khi cấu hình Supabase)
1. MC tải riêng file JSON **20 câu có đáp án** từ thiết bị cá nhân, nhấn **Tạo phòng**.
2. Màn hình MC hiện **mã 6 số và QR**.
3. 8 đội dùng **8 điện thoại đại diện**, mỗi đội tự điền tên khi vào phòng.
4. MC bắt đầu câu hỏi; các đội gửi lựa chọn A/B/C/D một lần/câu.
5. Phần SQL trong Supabase nhận đáp án, tính điểm phía database; lúc công bố mới cập nhật điểm và hiển thị đáp án.
6. Bảng máy chiếu cập nhật theo thời gian thực, cuối game hiện xếp hạng tám đội.

**Điểm:** Vòng 1 đúng 100–150; vòng 2 đúng 150–200; vòng 3 đúng 200. Trả lời sai: 0. Hai vòng đầu có thưởng tốc độ tối đa +50. Đây là **phiên bản trắc nghiệm 4 đáp án** của ba vòng để tự chấm, khác với game Family Feud mở 5 đáp án ở bản một thiết bị.

**Bảo mật:** Không đưa tệp 20 câu chứa \`correctIndex\` lên GitHub công khai. MC chọn tệp trực tiếp trong giao diện. Không bao giờ cho \`service_role\`/secret key lên frontend.

**Tài nguyên miễn phí:** Supabase có gói Free với hạn mức, có thể tự tạm dừng database sau thời gian không hoạt động. Nên mở trang và chạy thử trước buổi học.

## ✨ Giao diện minh họa, QR chờ đội và hiệu ứng

- **20 ảnh SVG minh họa gốc**, một ảnh cho mỗi mã câu hỏi của bộ JSON 20 câu VNR202: r1–r8, f1–f6, g1–g6, lưu tại `docs/art/questions/`. Đây là **đồ họa minh họa**, không phải ảnh tư liệu Đại hội.
- **3 banner màu theo vòng** (lịch sử vàng tím; giải mã hồng đỏ; Việt Nam xanh ngọc) trong `docs/art/banners/`.
- Khi MC tải **tệp JSON 20 câu đã phát riêng**, website tự gắn ảnh theo `id` nên **không cần sửa tệp JSON hoặc công khai đáp án**. Các mã câu khác tự dùng banner của vòng.
- **QR lớn ngay trên màn hình MC** và **trang chờ máy chiếu**, mở trực tiếp đường dẫn nhập mã phòng của đội. Khi quét QR, mã phòng đã được điền tự động. Mã phòng 6 chữ số luôn hiện dưới QR để nhập dự phòng.
- Danh sách đội hiển thị số đội đã vào, hiệu ứng đáp án đúng, điểm vừa cộng và thứ hạng khi công bố.
- Tối thiểu **1 MC + 1 đội (1 điện thoại)** để bắt đầu về mặt kỹ thuật; **nên có 1 MC + từ 2 đội** để tổ chức so tài. Giới hạn 8 đội/phòng; mỗi đội có thể có nhiều người nhưng chỉ cần một điện thoại đại diện.
- QR dùng dịch vụ tạo mã công khai `api.qrserver.com` với `quickchart.io` làm dự phòng; mã QR chỉ chứa **đường dẫn public và mã phòng**, không chứa mật khẩu.
- Nếu muốn thay ảnh cho một câu, sửa chính SVG tương ứng trong `docs/art/questions/`, không chỉnh câu đáp án. Ảnh dự phòng của vòng áp dụng cho câu có mã ngoài bộ 20.
- Bản này không thay luật tính điểm trong Supabase và không thay yêu cầu đăng nhập MC.

## ✅ Theo dõi đội đã trả lời ngay trên màn hình MC

- Khi câu hỏi đang chạy, mục **03. Điều khiển câu hỏi** hiển thị số đội đã nộp (ví dụ **2/8**), thanh tiến độ và thẻ riêng cho từng đội: **Đã gửi đáp án** hoặc **Chưa trả lời**.
- Trạng thái do **RPC của Supabase ghi sau khi xác nhận câu trả lời**; bảng đội tự đồng bộ qua Realtime, kèm làm mới dự phòng 4 giây nếu mạng lớp yếu.
- Sau khi tất cả đội đã nộp, MC có thể **Công bố và chấm điểm** ngay, không cần chờ hết giờ. Nếu chưa đủ, MC có thể đợi hoặc chủ động công bố.
- Trước khi công bố, MC chỉ xem **trạng thái đã/chưa trả lời**, không hiển thị lựa chọn A/B/C/D, tính đúng sai hay điểm tạm tính. Sau khi công bố, bảng hiển thị điểm vừa cộng.
- Chế độ này được triển khai trong migration `supabase/migrations/202611090004_live_answer_progress.sql`. Không cần MC upload lại bộ 20 câu hỏi JSON.

## 🖥 Chế độ một máy — dự phòng khi không có backend

**[Mở giao diện gốc](https://khanhtm45.github.io/VNR202-TechFeud/)**

- [Trang chủ](https://khanhtm45.github.io/VNR202-TechFeud/?view=home)
- [Màn hình máy chiếu](https://khanhtm45.github.io/VNR202-TechFeud/?view=board)
- [Bảng điều khiển MC](https://khanhtm45.github.io/VNR202-TechFeud/?view=host)

Chế độ này đã chạy độc lập trên GitHub Pages, có đủ 8 đội theo dạng thẻ (4×2), ba vòng, chấm điểm bởi MC, đồng bộ giữa các tab cùng một trình duyệt qua \`localStorage\` và \`BroadcastChannel\`. **Không phải chế độ 8 điện thoại kết nối từ xa**.

## 🧱 Cấu trúc dự án

| Thư mục / file | Vai trò |
|---|---|
| \`docs/live.html\` | MC / Đội chơi / Máy chiếu online |
| \`docs/live.js\` | Giao diện và sự kiện ba màn hình |
| \`docs/live.css\` | Thiết kế responsive online |
| \`docs/supabase-adapter.js\` | RPC + Realtime + xác thực ẩn danh Supabase |
| \`docs/supabase-config.js\` | **Chỉ** chứa URL + publishable key |
| \`supabase/migrations/202611090001_vnr_multiplayer.sql\` | Database, RLS, RPC chấm điểm |
| \`SUPABASE_SETUP.md\` | Các bước tạo dự án, chạy SQL và thử với điện thoại |
| \`docs/index.html\`, \`docs/app.js\`, \`docs/engine.js\` | Bản chơi một máy |
| \`test/*.test.js\` | Kiểm thử code Node + multiplayer |

Các file \`firebase.json\`, \`functions/\`, \`firestore.rules\` là **mã thử nghiệm Firebase cũ**, không còn được dùng trong bản online Supabase. Chúng được giữ lại để tham khảo lịch sử dự án; không cần triển khai và không cần nâng cấp Firebase Blaze.

### Test
\`\`\`sh
npm test
\`\`\`

### Nguồn học liệu
Session 26 (Đại hội XI), Session 27 (Đại hội XII), cùng các tình huống về môi trường do nhóm biên soạn. Nội dung câu hỏi cần được giảng viên rà soát trước khi dùng chấm chính thức.

Dự án được xây dựng riêng, có tham khảo ý tưởng tổ chức gameshow từ [TechFeud Classroom Edition](https://github.com/ImMaddd/TechFeud). MIT license.

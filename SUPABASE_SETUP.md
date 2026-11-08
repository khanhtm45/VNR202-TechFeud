# VNR202 Multiplayer — thiết lập bằng Supabase Free

Dự án này **không yêu cầu Firebase/Cloud Functions/Google Cloud Billing**.

Website (GitHub Pages): https://khanhtm45.github.io/VNR202-TechFeud/live.html

## 1. Tạo dự án Supabase miễn phí
1. Truy cập https://supabase.com/dashboard và đăng nhập.
2. Chọn **New project**, tạo dự án ví dụ \`VNR202-TechFeud\` trong tổ chức **Free**. Chọn vùng gần Việt Nam, chẳng hạn Singapore nếu có.
3. Chờ Supabase báo dự án ở trạng thái **Healthy**.

## 2. Bật đăng nhập ẩn danh cho điện thoại
Vào **Authentication → Providers → Anonymous Sign-Ins**, bật **Enable anonymous sign-ins**.

Hệ thống dùng tài khoản ẩn danh trên từng trình duyệt:
- **MC** là user ID tạo phòng, chỉ MC đó được điều khiển.
- **Đội chơi** tự nhập tên và dùng một điện thoại trong buổi thi.
- **Máy chiếu** có thể xem phòng sau khi nhập mã; không được chấm điểm.
- Không cần sinh viên tạo email hay mật khẩu.
- Xóa dữ liệu trình duyệt sẽ mất danh tính ẩn danh. Không dùng tab ẩn danh khi đang thi.

## 3. Tạo database + luật chấm điểm an toàn
Mở **SQL Editor → New query** trong dự án Supabase. Mở file
[\`supabase/migrations/202611090001_vnr_multiplayer.sql\`](./supabase/migrations/202611090001_vnr_multiplayer.sql)
trên GitHub, sao chép **toàn bộ** SQL, dán vào SQL Editor và nhấn **Run**.

Migration sẽ tạo:
- \`vnr_rooms\`: phòng, câu hỏi **không kèm đáp án**, trạng thái, đồng hồ.
- \`vnr_room_teams\`: tối đa 8 đội; điểm và vị trí.
- \`vnr_room_spectators\`: quyền đọc bảng chiếu.
- \`vnr_room_questions\` và \`vnr_room_submissions\`: dữ liệu **RIÊNG TƯ**. Browser không được SELECT.
- Hàm RPC để tạo phòng / tham gia / xem bảng chiếu / nộp đáp án / chuyển câu / chấm điểm.
- RLS chỉ cho MC, đội trong phòng và người được cấp quyền xem bảng chiếu **đọc** dữ liệu phòng. Không cho client tự sửa điểm.
- Supabase Realtime cho hai bảng công khai.

**Quan trọng:** SQL migration được thiết kế cho một Supabase project mới, nơi bạn quản lý schema. Trước khi dùng với database có sẵn, đọc và đánh giá các lệnh tạo bảng/chính sách.

## 4. Kết nối GitHub Pages tới Supabase

Vào **Project Settings → Data API** hoặc **Connect** để lấy **Project URL** dạng
\`https://your-project-ref.supabase.co\`.

Vào **Project Settings → API Keys** để lấy **Publishable key** \`sb_publishable_...\`
(hoặc legacy \`anon\` key).

Trên repository GitHub, mở [\`docs/supabase-config.js\`](./docs/supabase-config.js), chọn **Edit**, thay hai giá trị:

\`\`\`js
export const supabaseConfig = {
  url: "https://your-project-ref.supabase.co",
  anonKey: "sb_publishable_YOUR_KEY_HERE"
};
\`\`\`

Chọn **Commit changes → main**. Workflow Pages tự cập nhật phiên bản online.
**Publishable/anon key là khóa dành cho client, không phải bí mật.**
**KHÔNG đưa secret key, service_role key hoặc mật khẩu database vào GitHub/JS.**

## 5. Thử hệ thống

1. Trên laptop, mở [Màn hình MC](https://khanhtm45.github.io/VNR202-TechFeud/live.html?mode=host).
2. Tại **Bộ câu hỏi có đáp án**, chọn file JSON **20 câu riêng tư** đã được cung cấp trong cuộc hội thoại. Không tải file này lên repository công khai.
3. Bấm **Tạo phòng & mã tham gia** (MC nhận mã 6 số và QR).
4. Mở [Màn hình máy chiếu](https://khanhtm45.github.io/VNR202-TechFeud/live.html?mode=board) trên máy chiếu, điền mã phòng.
5. Mỗi đội dùng **điện thoại riêng**, mở [Trang đội chơi](https://khanhtm45.github.io/VNR202-TechFeud/live.html?mode=player), nhập mã + tên đội (tối đa 8 đội).
6. MC nhấn **Bắt đầu**, điểm tự chấm theo luật lưu trong database. Người chơi trả lời A/B/C/D, mỗi đội một lần/câu.
7. Sau mỗi câu, MC **Công bố và tự chấm điểm**. Khi hết giờ, trang MC tự gửi lệnh công bố. Điểm lên bảng chiếu.
8. Khi hoàn tất, MC nhấn **Kết thúc**, máy chiếu hiện bảng xếp hạng.

### Cơ chế tính điểm
- Vòng 1: đúng 100–150 điểm (tối đa 50 điểm thưởng tốc độ).
- Vòng 2: đúng 150–200 điểm (tối đa 50 điểm thưởng tốc độ).
- Vòng 3: đúng 200 điểm, sai 0 điểm.
- Không trả lời/đáp án sai: 0 điểm.
- Điểm cộng chỉ khi MC công bố đáp án, do database tính. Gửi đáp án trùng sẽ bị từ chối.

### Kiểm thử trước buổi thi
- Dùng tối thiểu **hai điện thoại riêng** và laptop chạy thử một phòng 3 câu.
- Kiểm tra chức năng mất mạng / tải lại trang, giới hạn 8 đội, một lần nộp đáp án, chọn đáp án sai, hết giờ.
- Không dùng tab ẩn danh cho đội chơi; đăng nhập ẩn danh được lưu theo trình duyệt.
- Tạm thời không chia sẻ mã phòng rộng rãi ngoài lớp; người biết mã có thể đăng ký hoặc xem.

## Chi phí
Dùng được gói **Supabase Free**. Gói Free có giới hạn tài nguyên, số kết nối realtime và có thể tự pause dự án sau thời gian không hoạt động. Hãy kiểm tra bảng **Usage** tại Supabase trước buổi thuyết trình.

## Vấn đề thường gặp
- **Trang báo chưa cấu hình:** chưa điền \`docs/supabase-config.js\` hoặc GitHub Pages chưa deploy.
- **Đăng nhập ẩn danh thất bại:** chưa bật Anonymous Sign-Ins.
- **RPC not found / does not exist:** chưa chạy migration SQL hoặc schema cache đang cập nhật.
- **Phòng không tồn tại hoặc không đọc được:** dùng sai mã, phòng hết hạn (mặc định 4 giờ), hoặc team chưa tham gia/board chưa được cấp quyền xem.
- **Bảng điểm không tức thời:** Realtime chưa được thêm hai bảng vào publication; adapter tự làm mới định kỳ.
- **Không tạo được phòng:** kiểm tra SQL Editor đã chạy migration hoàn chỉnh, JWT và RLS.

## Công khai và riêng tư
\`docs/supabase-config.js\` chỉ có URL + publishable key, an toàn để public khi RLS/RPC thiết lập đúng. Khóa đáp án nằm trong bảng riêng tư có quyền truy cập hạn chế. **Tuyệt đối không public file JSON 20 câu có \`correctIndex\`**. Các câu hỏi cũ trong gameshow chơi một máy (\`docs/questions.json\`) là dữ liệu public độc lập; nếu nội dung trùng, sinh viên có thể tra cứu được từ repo — nên thay câu cho bài kiểm tra quan trọng.

## Phạm vi
Bản Supabase dùng để chơi thật trên nhiều thiết bị. Phiên bản một máy (\`docs/index.html\`) vẫn hoạt động độc lập và được giữ làm chế độ dự phòng khi lớp mất Internet. Các file Firebase \`functions/\`, \`firebase.json\` nếu còn trong repo chỉ là mã cũ **không được dùng bởi phiên bản Supabase**.

# VNR202 — Bật chế độ trực tuyến 8 đội (GitHub Pages + Firebase)

**Đã có trong repo:** Giao diện MC, điện thoại, máy chiếu; Firebase Callable Functions; Firestore Rules; tính điểm tự động trên server.

**Chưa thể chơi liên thiết bị nếu Firebase chưa được cấu hình và triển khai.** GitHub Pages chỉ lưu phần giao diện.

## Bước 1. Tạo Firebase

1. Truy cập https://console.firebase.google.com/ rồi tạo Firebase project.
2. Đăng ký Web App, sao chép 4 trường **apiKey, authDomain, projectId, appId**. Đây là cấu hình ứng dụng web công khai, **không phải private key**.
3. Trong Authentication → Sign-in method, bật **Anonymous**.
4. Trong Firestore Database, tạo database.
5. Để triển khai Cloud Functions, nâng project lên **Blaze** (phải có tài khoản thanh toán; có hạn mức miễn phí nhưng không cam kết 0 đồng). Thiết lập cảnh báo ngân sách.

**Không đưa service account JSON, private key, thông tin thanh toán hoặc token cá nhân vào GitHub.**

## Bước 2. Deploy các dịch vụ

Cài Node.js 22+, Git, Firebase CLI. Trên máy đã đăng nhập Firebase:

~~~bash
npm install -g firebase-tools
firebase login
git clone https://github.com/khanhtm45/VNR202-TechFeud.git
cd VNR202-TechFeud
firebase use --add
cd functions
npm install
cd ..
firebase deploy --only firestore:rules,functions
~~~

Chọn đúng project Firebase của bạn trong bước use --add. Có thể truyền --project PROJECT_ID vào lệnh deploy.

Các Firebase Callable Functions nằm tại **asia-southeast1**: createRoom, joinRoom, controlGame, submitAnswer. Dùng tài khoản Firebase Anonymous, xác thực quyền MC, giới hạn 8 đội và chấm điểm bằng Firestore transaction.

## Bước 3. Kết nối GitHub Pages

Trong **docs/firebase-config.js**, điền thông tin lấy từ cấu hình Web App, ví dụ:

~~~js
export const firebaseConfig = {
  apiKey: "YOUR_WEB_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  projectId: "YOUR_PROJECT",
  appId: "YOUR_APP_ID"
};
export const functionsRegion = "asia-southeast1";
export const isFirebaseConfigured = Boolean(firebaseConfig.apiKey && firebaseConfig.authDomain && firebaseConfig.projectId && firebaseConfig.appId);
~~~

Push thay đổi lên nhánh main. GitHub Actions sẽ xuất bản docs. Trong Firebase Authentication → Settings → Authorized domains, kiểm tra domain **khanhtm45.github.io** được cho phép nếu cần.

## Bước 4. Bộ câu hỏi riêng tư

Tải file **VNR202_bo_cau_hoi_RIENG_TU.json** được gửi riêng trong cuộc trò chuyện. Tệp chứa 11 câu hỏi có đáp án A/B/C/D. **KHÔNG đẩy tệp này lên GitHub công khai**, vì đội chơi có thể đọc đáp án.

Trên trang MC chọn file này rồi nhấn **Tạo phòng**. Firebase sẽ giữ đáp án trong private collection roomSecrets; rules cấm client đọc. Mỗi câu theo cấu trúc:

~~~json
{"id":"r1","stage":"rapid","prompt":"Đại hội XI diễn ra năm nào?","choices":["2011","2006","2016","2021"],"correctIndex":0,"explanation":"Năm 2011.","durationSeconds":20,"icon":"📅"}
~~~

Bộ câu hỏi gồm 3 vòng xếp đúng thứ tự rapid → feud → green, mỗi câu có đúng 4 lựa chọn và 1 chỉ số đáp án đúng (0–3).

## Bước 5. Vận hành trên lớp

- **MC:** https://khanhtm45.github.io/VNR202-TechFeud/live.html?mode=host
- **Điện thoại đội:** https://khanhtm45.github.io/VNR202-TechFeud/live.html?mode=player
- **Máy chiếu:** https://khanhtm45.github.io/VNR202-TechFeud/live.html?mode=board

MC tạo phòng → lấy mã 6 số / mã QR → 8 đội tự đăng ký tên trên 8 điện thoại → MC bắt đầu → các đội chọn đáp án → backend chấm điểm sau khi MC công bố → chuyển câu tiếp theo → bảng xếp hạng.

Hệ thống tự gọi chấm điểm khi hết giờ **nếu tab MC đang mở và kết nối**. MC có thể công bố sớm. Trả lời sai được 0 điểm; trả lời đúng vòng 1 nhận 100–150 điểm (thưởng tốc độ), vòng 2 nhận 150–200, vòng 3 nhận 200. Dùng 11 câu chia 6 + 2 + 3.

**Lưu ý:** Vòng 2 bản online dùng trắc nghiệm giải mã (không còn bảng Family Feud 5 đáp án) để chấm 100% tự động. Vòng 3 chọn phương án giải quyết tình huống; không chấm bài tự luận dài.

## Bảo mật, gian lận, chi phí

- Một Firebase Anonymous UID được đăng ký tối đa 1 đội trong 1 phòng. Đây **không chứng minh 1 điện thoại vật lý**; thay trình duyệt hay xóa dữ liệu có thể tạo tài khoản mới. MC cần giám sát thực tế.
- Mã đúng được giữ trong roomSecrets (Firestore rules không cho client đọc); không lưu đáp án trong file GitHub Pages.
- Điện thoại không được phép tự sửa điểm. Firebase Cloud Functions kiểm tra một lượt nộp/câu, thời gian server và cộng điểm bằng transaction.
- Chỉ UID của MC tạo phòng được dùng lệnh NEXT / REVEAL / FINISH.
- MC nên giữ cùng trình duyệt, không xóa dữ liệu trong buổi chơi (mất UID có thể mất quyền MC).
- Chức năng hiện chưa bắt buộc **Firebase App Check**. Nên thiết lập App Check, giới hạn lạm dụng và cảnh báo ngân sách trước khi mở cho nhiều người không quen biết.
- Cloud Functions cần Firebase **Blaze**, có thể phát sinh phí ngoài hạn mức. GitHub Pages không chạy backend trực tiếp.
- QR dùng QRServer (dịch vụ thứ ba); đường dẫn+mã phòng được gửi tới máy chủ QR để tạo hình.
- Phòng hết hạn sau 4 giờ; backend từ chối sử dụng quá hạn. Dữ liệu cũ chưa tự dọn trong Firestore.

## Kiểm thử

~~~bash
npm test
node --check functions/index.js
~~~

Nên kiểm tra trên Firebase Emulator trước khi thuyết trình. Các kiểm thử logic ở test/multiplayer.test.js.

Nguồn kỹ thuật:
- https://firebase.google.com/docs/functions/callable
- https://firebase.google.com/docs/firestore/manage-data/transactions
- https://firebase.google.com/pricing

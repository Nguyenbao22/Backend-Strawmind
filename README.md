# StrawMind IoT App Prototype

Prototype này tập trung vào phần mềm cho phân công “thuần IoT”: app điện thoại/PWA, backend nhận số đo, realtime cảnh báo và điều khiển bơm, phun sương, quạt.

## Chạy thử

```powershell
npm.cmd install
npm.cmd run dev
```

Mở app ở `http://localhost:5173`. Nếu muốn mở bằng điện thoại trong cùng Wi-Fi, dùng IP máy tính thay cho `localhost`, ví dụ `http://192.168.1.10:5173`.

Ở terminal khác, chạy giả lập ESP32:

```powershell
npm.cmd run sim
```

## Chạy app mobile thật

App mobile nằm trong thư mục `mobile/` và dùng Expo.

```powershell
cd D:\strawmind
npm.cmd install
cd mobile
npm.cmd install
npm.cmd start
```

Cài Expo Go trên điện thoại, quét QR hiện trong terminal. Điện thoại và máy tính cần cùng Wi-Fi.

Backend vẫn chạy ở máy tính:

```powershell
cd D:\strawmind
npm.cmd run server
```

App sẽ tự đoán backend theo IP của Expo LAN và port `8787`. Nếu không kết nối được, sửa ô Backend trong app thành:

```text
http://<IP-may-tinh>:8787
```

Khi backend đã deploy lên Render, tạo file `mobile/.env` từ `mobile/.env.example`:

```powershell
Copy-Item mobile\.env.example mobile\.env
```

Sửa URL thành service Render thật:

```text
EXPO_PUBLIC_API_BASE=https://your-render-service.onrender.com
```

## Deploy lên Render

Repo đã có `render.yaml` để Render Blueprint tự nhận cấu hình.

Render sẽ chạy:

```text
Build Command: npm install && npm run build
Start Command: npm run start
Health Check: /api/health
```

Backend và web dashboard chạy cùng một service:

- API: `https://<service>.onrender.com/api/state`
- Web dashboard: `https://<service>.onrender.com/`
- WebSocket: `wss://<service>.onrender.com/ws`

Lưu ý: bản prototype hiện lưu dữ liệu trong RAM. Render free có thể sleep/restart nên dữ liệu demo sẽ reset. Khi pilot thật nên thêm database như PostgreSQL/Firebase.

## Push GitHub

Không commit PDF/txt trích xuất vì tài liệu có thông tin cá nhân. Repo chỉ đưa code app, backend, mobile và config deploy.

Sau khi tạo repo GitHub, chạy:

```powershell
git remote add origin https://github.com/<username>/<repo>.git
git push -u origin main
```

## API để ESP32 gửi dữ liệu

`POST http://<server-ip>:8787/api/telemetry`

```json
{
  "nodeId": "bed-01",
  "temperature": 29.2,
  "humidity": 92,
  "substrateMoisture": 66,
  "co2": 1100,
  "battery": 91,
  "rssi": -58
}
```

Backend sẽ tự so với ngưỡng theo giai đoạn:

- Ủ tơ: 32-35°C, 85-90% ẩm không khí.
- Ra nụ: 28-30°C, 90-95% ẩm không khí.
- Thu hoạch: 27-30°C, 80-85% ẩm không khí.

## API điều khiển thiết bị

App đang gọi các endpoint này:

```http
POST /api/actuators/pump
POST /api/actuators/mist
POST /api/actuators/fan
```

Body:

```json
{ "state": "on", "mode": "manual" }
```

Mỗi lệnh được lưu cùng topic MQTT dự kiến, ví dụ `strawmind/bed-01/cmd/fan`. Khi nối MQTT broker thật, ESP32 chỉ cần subscribe các topic này và bật relay tương ứng.

## Phạm vi đã cố tình bỏ qua

Phần AI phát hiện bệnh qua ảnh/camera OV2640 chưa triển khai ở prototype này, đúng theo phân công là Quyên sẽ nghiên cứu riêng rồi gộp mô hình sau.

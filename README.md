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

## Kết nối Supabase

Backend có thể ghi telemetry, lệnh điều khiển và cảnh báo vào Supabase. Project URL đang dùng:

```text
https://srlczwqjhwlsafuvoefu.supabase.co
```

Trong Supabase Dashboard, mở `SQL Editor`, chạy file:

```text
supabase_schema.sql
```

Trên Render, thêm environment variables:

```text
SUPABASE_URL=https://srlczwqjhwlsafuvoefu.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service-role-key-trong-Supabase>
```

Không đưa `SUPABASE_SERVICE_ROLE_KEY` vào frontend, mobile app, hay GitHub. Key này chỉ để trong backend Render.

Kiểm tra trạng thái Supabase:

```http
GET /api/supabase
```

Gửi thử telemetry:

```http
POST /api/telemetry
```

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

Nếu Supabase đã cấu hình đúng, backend sẽ tự tạo device theo `nodeId`, ghi vào `sensor_logs`, cập nhật `devices.last_seen_at`, và ghi `alerts` nếu chỉ số vượt ngưỡng.

## Kết nối HiveMQ Cloud

HiveMQ Cloud cluster dùng MQTT over TLS:

```text
Host: 3b8fa1f55fa44b14a8def756f361a0c1.s1.eu.hivemq.cloud
Port: 8883
```

Trong HiveMQ, vào cluster và tạo credentials cho device/backend. Không commit username/password lên GitHub.

Trên Render, thêm environment variables:

```text
MQTT_HOST=3b8fa1f55fa44b14a8def756f361a0c1.s1.eu.hivemq.cloud
MQTT_PORT=8883
MQTT_TOPIC_PREFIX=strawmind
MQTT_USERNAME=<username-tren-hivemq>
MQTT_PASSWORD=<password-tren-hivemq>
```

Backend sẽ:

- Subscribe telemetry từ ESP32: `strawmind/+/telemetry`
- Publish lệnh thiết bị: `strawmind/<nodeId>/cmd/<actuator>`
- Kiểm tra trạng thái MQTT tại: `/api/mqtt`

Payload ESP32 publish lên HiveMQ:

```json
{
  "temperature": 29.2,
  "humidity": 92,
  "substrateMoisture": 66,
  "co2": 1100,
  "battery": 91,
  "rssi": -58
}
```

ESP32 cần subscribe:

```text
strawmind/bed-01/cmd/+
```

Lệnh nhận được:

```json
{ "state": "on" }
```

Test HiveMQ không cần ESP32:

```powershell
$env:MQTT_HOST="3b8fa1f55fa44b14a8def756f361a0c1.s1.eu.hivemq.cloud"
$env:MQTT_USERNAME="<username-tren-hivemq>"
$env:MQTT_PASSWORD="<password-tren-hivemq>"
npm.cmd run mqtt:sim
```

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

## API nhận kết quả AI

Raspberry Pi hoặc AI service có thể gửi kết quả nhận diện bệnh lên backend:

```http
POST /api/detections
```

Payload hỗ trợ cả format chuẩn và format gần giống code YOLO local:

```json
{
  "nodeId": "bed-01",
  "modelName": "YOLOv8n-ONNX-Pi",
  "healthyCount": 1,
  "affectedCount": 1,
  "inferenceTimeMs": 410,
  "imageUrl": "https://example.com/analyzed.jpg",
  "detections": [
    {
      "className": "Affected Mushroom",
      "confidence": 0.87,
      "bbox": {
        "x1": 120,
        "y1": 80,
        "x2": 260,
        "y2": 190
      }
    }
  ]
}
```

Format từ code Pi cũ cũng dùng được:

```json
{
  "boxes": [
    {
      "box": [120, 80, 260, 190],
      "label": "Affected Mushroom",
      "conf": 0.87
    }
  ],
  "healthy_count": 1,
  "affected_count": 1
}
```

Lấy kết quả AI mới nhất:

```http
GET /api/detections/latest
```

Test giả lập AI local:

```powershell
npm.cmd run ai:sim
```

Test giả lập AI lên Render:

```powershell
$env:AI_API_URL="https://strawmind.onrender.com/api/detections"
npm.cmd run ai:sim
```

## Phạm vi đã cố tình bỏ qua

Phần AI phát hiện bệnh qua ảnh/camera OV2640 chưa triển khai ở prototype này, đúng theo phân công là Quyên sẽ nghiên cứu riêng rồi gộp mô hình sau.

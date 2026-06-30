import {
  Bell,
  BrainCircuit,
  Check,
  Fan,
  Gauge,
  History,
  Image,
  Power,
  Radio,
  RefreshCw,
  Sprout,
  Thermometer,
  Waves,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

const localApiBase = `${window.location.protocol}//${window.location.hostname}:8787`;
const API_BASE =
  import.meta.env.VITE_API_BASE ||
  (['localhost', '127.0.0.1'].includes(window.location.hostname) ? localApiBase : window.location.origin);
const WS_URL = API_BASE.replace(/^http/, 'ws') + '/ws';

const metricMeta = {
  temperature: { label: 'Nhiệt độ', unit: '°C', icon: Thermometer, digits: 1 },
  humidity: { label: 'Không khí', unit: '%', icon: Waves, digits: 0 },
  substrateMoisture: { label: 'Giá thể', unit: '%', icon: Sprout, digits: 0 },
  co2: { label: 'CO2', unit: 'ppm', icon: Gauge, digits: 0 },
};

const stageOptions = [
  { id: 'incubation', label: 'Ủ tơ' },
  { id: 'pinning', label: 'Ra nụ' },
  { id: 'harvest', label: 'Thu hoạch' },
];

const actuatorIcons = {
  pump: Power,
  mist: Waves,
  fan: Fan,
};

function formatTime(value) {
  if (!value) return '--:--';
  return new Intl.DateTimeFormat('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(value));
}

function metricStatus(value, range) {
  if (!range || typeof value !== 'number') return 'normal';
  if (value < range[0]) return 'low';
  if (value > range[1]) return 'high';
  return 'normal';
}

function statusCopy(status) {
  if (status === 'low') return 'Thấp';
  if (status === 'high') return 'Cao';
  return 'Ổn';
}

function healthScore(metrics, target) {
  if (!metrics || !target) return 0;
  const keys = ['temperature', 'humidity', 'substrateMoisture', 'co2'];
  const misses = keys.filter((key) => metricStatus(metrics[key], target[key]) !== 'normal').length;
  return Math.max(0, Math.round(((keys.length - misses) / keys.length) * 100));
}

function notify(alert) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  new Notification(`StrawMind: ${alert.title}`, {
    body: alert.message,
    icon: '/icon.svg',
    tag: alert.id,
  });
}

export function App() {
  const [state, setState] = useState(null);
  const [online, setOnline] = useState(false);
  const [busyActuator, setBusyActuator] = useState(null);
  const [notificationPermission, setNotificationPermission] = useState(
    'Notification' in window ? Notification.permission : 'unsupported',
  );
  const newestAlertRef = useRef(null);

  async function loadState() {
    const response = await fetch(`${API_BASE}/api/state`);
    const payload = await response.json();
    setState(payload);
  }

  useEffect(() => {
    loadState().catch(() => setOnline(false));
    const socket = new WebSocket(WS_URL);
    socket.addEventListener('open', () => setOnline(true));
    socket.addEventListener('close', () => setOnline(false));
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      const next = message.payload;
      setState(next);
      const alert = next?.alerts?.[0];
      if (alert && alert.id !== newestAlertRef.current) {
        newestAlertRef.current = alert.id;
        notify(alert);
      }
    });
    return () => socket.close();
  }, []);

  const latestReading = state?.readings?.[0] || state?.metrics;
  const criticalCount = state?.alerts?.filter((alert) => alert.severity === 'critical').length || 0;
  const activeActuators = Object.values(state?.actuators || {}).filter((item) => item.state === 'on').length;
  const score = healthScore(latestReading, state?.target);

  const stageLabel = useMemo(() => {
    return stageOptions.find((stage) => stage.id === state?.stage)?.label || 'Ra nụ';
  }, [state?.stage]);

  async function updateStage(stage) {
    const response = await fetch(`${API_BASE}/api/stage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ stage }),
    });
    setState(await response.json());
  }

  async function toggleActuator(id) {
    const current = state.actuators[id].state;
    setBusyActuator(id);
    const response = await fetch(`${API_BASE}/api/actuators/${id}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ state: current === 'on' ? 'off' : 'on', mode: 'manual' }),
    });
    const payload = await response.json();
    setState(payload.state);
    setBusyActuator(null);
  }

  async function requestNotifications() {
    if (!('Notification' in window)) return;
    const permission = await Notification.requestPermission();
    setNotificationPermission(permission);
  }

  if (!state) {
    return (
      <main className="shell loading">
        <RefreshCw className="spin" />
        <span>Đang kết nối StrawMind</span>
      </main>
    );
  }

  return (
    <main className="shell">
      <nav className="nav">
        <div className="mark">
          <Sprout size={22} />
        </div>
        <div className="brand">
          <strong>StrawMind</strong>
          <span>Bed-01 environmental console</span>
        </div>
        <div className={`live ${online ? 'online' : 'offline'}`}>
          <Radio size={16} />
          <span>{online ? 'Live' : 'Offline'}</span>
        </div>
      </nav>

      <section className="hero-panel">
        <div className="hero-copy">
          <p>Mô nấm đang theo dõi</p>
          <h1>{stageLabel}</h1>
        </div>
        <div className="score-dial">
          <strong>{score}</strong>
          <span>điểm</span>
        </div>
        <div className="summary-strip">
          <div>
            <strong>{criticalCount}</strong>
            <span>cảnh báo</span>
          </div>
          <div>
            <strong>{activeActuators}</strong>
            <span>thiết bị bật</span>
          </div>
          <div>
            <strong>{formatTime(state.lastUpdated)}</strong>
            <span>cập nhật</span>
          </div>
        </div>
      </section>

      <section className="stage-rail" aria-label="Giai đoạn trồng">
        {stageOptions.map((stage) => (
          <button
            key={stage.id}
            className={stage.id === state.stage ? 'active' : ''}
            onClick={() => updateStage(stage.id)}
            type="button"
          >
            {stage.label}
          </button>
        ))}
      </section>

      <section className="top-actions">
        <button className="secondary-action" type="button" onClick={requestNotifications}>
          <Bell size={18} />
          <span>
            {notificationPermission === 'granted'
              ? 'Thông báo đã bật'
              : notificationPermission === 'unsupported'
                ? 'Không hỗ trợ thông báo'
                : 'Bật thông báo'}
          </span>
        </button>
        <button className="secondary-action" type="button" onClick={loadState}>
          <RefreshCw size={18} />
          <span>Làm mới</span>
        </button>
      </section>

      <section className="console-grid">
        <div className="metric-deck">
          {Object.entries(metricMeta).map(([key, meta]) => {
            const Icon = meta.icon;
            const value = latestReading?.[key];
            const target = state.target?.[key];
            const status = metricStatus(value, target);
            return (
              <article className="metric-row" key={key}>
                <div className="metric-icon">
                  <Icon size={22} />
                </div>
                <div className="metric-copy">
                  <strong>{meta.label}</strong>
                  <span>
                    Chuẩn {target?.[0]}-{target?.[1]}
                    {meta.unit}
                  </span>
                </div>
                <div className="metric-readout">
                  <strong>
                    {typeof value === 'number' ? value.toFixed(meta.digits) : '--'}
                    <small>{meta.unit}</small>
                  </strong>
                  <em className={status === 'normal' ? 'ok' : 'danger'}>{statusCopy(status)}</em>
                </div>
              </article>
            );
          })}
        </div>

        <div className="control-panel">
          <div className="panel-head">
            <h2>Điều khiển tay</h2>
            <span>Relay ESP32</span>
          </div>
          <div className="actuator-grid">
            {Object.entries(state.actuators).map(([id, actuator]) => {
              const Icon = actuatorIcons[id] || Power;
              const isOn = actuator.state === 'on';
              return (
                <button
                  className={`actuator ${isOn ? 'on' : ''}`}
                  key={id}
                  onClick={() => toggleActuator(id)}
                  type="button"
                  disabled={busyActuator === id}
                >
                  <Icon size={26} />
                  <span>{actuator.label}</span>
                  <strong>{isOn ? 'ON' : 'OFF'}</strong>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      <section className="lower-grid">
        <div className="panel">
          <div className="panel-head">
            <h2>Cảnh báo</h2>
            <span>{state.alerts.length} mục</span>
          </div>
          <div className="alert-list">
            {state.alerts.length === 0 ? (
              <div className="empty">
                <Check size={18} />
                <span>Môi trường đang trong ngưỡng.</span>
              </div>
            ) : (
              state.alerts.slice(0, 5).map((alert) => (
                <article className="alert" key={alert.id}>
                  <strong>{alert.title}</strong>
                  <p>{alert.message}</p>
                  <span>{formatTime(alert.createdAt)}</span>
                </article>
              ))
            )}
          </div>
        </div>

        <div className="panel">
          <div className="panel-head">
            <h2>Gợi ý xử lý</h2>
            <Sprout size={18} />
          </div>
          <div className="action-list">
            {state.recommendedActions.length === 0 ? (
              <div className="empty">
                <Check size={18} />
                <span>Chưa cần can thiệp.</span>
              </div>
            ) : (
              state.recommendedActions.map((action) => <p key={action}>{action}</p>)
            )}
          </div>
        </div>

        <div className="panel ai-panel">
          <div className="panel-head">
            <h2>AI phát hiện bệnh</h2>
            <BrainCircuit size={18} />
          </div>
          <div className={`ai-status ${state.ai?.diseaseDetected ? 'danger' : 'ok'}`}>
            <div>
              <strong>{state.ai?.diseaseDetected ? 'Có dấu hiệu bệnh' : 'Chưa phát hiện bệnh'}</strong>
              <span>
                {state.ai?.modelName || 'YOLOv8n'} · {state.ai?.lastUpdated ? formatTime(state.ai.lastUpdated) : '--:--'}
              </span>
            </div>
            <div className="ai-counts">
              <span>{state.ai?.healthyCount ?? 0} healthy</span>
              <span>{state.ai?.affectedCount ?? 0} affected</span>
            </div>
          </div>
          {state.ai?.imageUrl ? (
            <a className="ai-image-link" href={state.ai.imageUrl} target="_blank" rel="noreferrer">
              <Image size={16} />
              <span>Xem ảnh phân tích</span>
            </a>
          ) : null}
          <div className="detection-list">
            {state.ai?.detections?.length ? (
              state.ai.detections.slice(0, 4).map((item, index) => (
                <div className="detection" key={`${item.className}-${index}`}>
                  <span>{item.className}</span>
                  <strong>{Math.round((item.confidence || 0) * 100)}%</strong>
                </div>
              ))
            ) : (
              <div className="empty">
                <span>Chưa có kết quả AI từ thiết bị.</span>
              </div>
            )}
          </div>
        </div>

        <div className="panel command-panel">
          <div className="panel-head">
            <h2>Lệnh gần đây</h2>
            <History size={18} />
          </div>
          <div className="command-list">
            {state.commands.length === 0 ? (
              <div className="empty">
                <span>Chưa có lệnh điều khiển.</span>
              </div>
            ) : (
              state.commands.slice(0, 5).map((command) => (
                <div className="command" key={command.id}>
                  <span>{command.topic}</span>
                  <strong>{command.state.toUpperCase()}</strong>
                </div>
              ))
            )}
          </div>
        </div>
      </section>
    </main>
  );
}

import cors from 'cors';
import express from 'express';
import { WebSocketServer } from 'ws';
import { createServer } from 'node:http';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PORT = Number(process.env.PORT || 8787);
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || '*';
const __dirname = dirname(fileURLToPath(import.meta.url));
const distPath = join(__dirname, '..', 'dist');

const STAGE_RANGES = {
  incubation: {
    label: 'Ủ tơ',
    temperature: [32, 35],
    humidity: [85, 90],
    substrateMoisture: [58, 72],
    co2: [0, 1800],
  },
  pinning: {
    label: 'Ra nụ',
    temperature: [28, 30],
    humidity: [90, 95],
    substrateMoisture: [62, 76],
    co2: [0, 1500],
  },
  harvest: {
    label: 'Thu hoạch',
    temperature: [27, 30],
    humidity: [80, 85],
    substrateMoisture: [55, 70],
    co2: [0, 1500],
  },
};

const state = {
  farmName: 'StrawMind Demo Farm',
  stage: 'pinning',
  lastUpdated: null,
  metrics: {
    nodeId: 'bed-01',
    temperature: 29.4,
    humidity: 91,
    substrateMoisture: 65,
    co2: 920,
    battery: 92,
    rssi: -55,
  },
  actuators: {
    pump: { label: 'Bơm nước', state: 'off', mode: 'manual', lastChanged: null },
    mist: { label: 'Phun sương', state: 'off', mode: 'manual', lastChanged: null },
    fan: { label: 'Quạt gió', state: 'off', mode: 'manual', lastChanged: null },
  },
  alerts: [],
  readings: [],
  commands: [],
};

function nowIso() {
  return new Date().toISOString();
}

function compareMetric(name, value, [min, max]) {
  if (typeof value !== 'number') return null;
  if (value < min) return { direction: 'low', delta: min - value, min, max };
  if (value > max) return { direction: 'high', delta: value - max, min, max };
  return null;
}

function createAlert(metric, value, issue) {
  const labels = {
    temperature: 'Nhiệt độ',
    humidity: 'Độ ẩm không khí',
    substrateMoisture: 'Độ ẩm giá thể',
    co2: 'CO2',
  };
  const units = {
    temperature: '°C',
    humidity: '%',
    substrateMoisture: '%',
    co2: 'ppm',
  };
  const highLow = issue.direction === 'high' ? 'cao' : 'thấp';
  const severity = issue.delta > (metric === 'co2' ? 650 : 4) ? 'critical' : 'warning';
  return {
    id: `${metric}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    metric,
    severity,
    title: `${labels[metric]} ${highLow}`,
    message: `${labels[metric]} đang là ${value}${units[metric]}, ngoài ngưỡng ${issue.min}-${issue.max}${units[metric]} của giai đoạn ${STAGE_RANGES[state.stage].label}.`,
    createdAt: nowIso(),
  };
}

function recommendedActions(metrics) {
  const ranges = STAGE_RANGES[state.stage];
  const actions = [];

  if (metrics.humidity < ranges.humidity[0] || metrics.substrateMoisture < ranges.substrateMoisture[0]) {
    actions.push('Bật phun sương hoặc bơm tưới ngắn để nâng ẩm.');
  }
  if (metrics.humidity > ranges.humidity[1]) {
    actions.push('Bật quạt gió để hạ ẩm và tránh úng mô.');
  }
  if (metrics.temperature > ranges.temperature[1] || metrics.co2 > ranges.co2[1]) {
    actions.push('Bật quạt gió để giảm nhiệt/CO2.');
  }
  if (metrics.temperature < ranges.temperature[0]) {
    actions.push('Giữ kín mô, hạn chế quạt đến khi nhiệt độ ổn định.');
  }

  return actions;
}

function evaluateAlerts(metrics) {
  const ranges = STAGE_RANGES[state.stage];
  const candidates = ['temperature', 'humidity', 'substrateMoisture', 'co2']
    .map((metric) => {
      const issue = compareMetric(metric, metrics[metric], ranges[metric]);
      return issue ? createAlert(metric, metrics[metric], issue) : null;
    })
    .filter(Boolean);

  const fresh = candidates.filter((alert) => {
    const existing = state.alerts[0];
    return !existing || existing.metric !== alert.metric || existing.title !== alert.title;
  });

  state.alerts = [...fresh, ...state.alerts].slice(0, 50);
}

function publicState() {
  return {
    ...state,
    target: STAGE_RANGES[state.stage],
    recommendedActions: recommendedActions(state.metrics),
  };
}

function broadcast(event, payload = publicState()) {
  const data = JSON.stringify({ event, payload, sentAt: nowIso() });
  for (const client of wss.clients) {
    if (client.readyState === client.OPEN) {
      client.send(data);
    }
  }
}

const app = express();
app.use(cors({ origin: CLIENT_ORIGIN }));
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'strawmind-iot-backend', time: nowIso() });
});

app.get('/api/state', (_req, res) => {
  res.json(publicState());
});

app.post('/api/stage', (req, res) => {
  const { stage } = req.body;
  if (!STAGE_RANGES[stage]) {
    return res.status(400).json({ error: 'Invalid stage', allowed: Object.keys(STAGE_RANGES) });
  }
  state.stage = stage;
  evaluateAlerts(state.metrics);
  broadcast('stage.updated');
  return res.json(publicState());
});

app.post('/api/telemetry', (req, res) => {
  const reading = {
    nodeId: String(req.body.nodeId || state.metrics.nodeId),
    temperature: Number(req.body.temperature),
    humidity: Number(req.body.humidity),
    substrateMoisture: Number(req.body.substrateMoisture),
    co2: Number(req.body.co2),
    battery: req.body.battery === undefined ? state.metrics.battery : Number(req.body.battery),
    rssi: req.body.rssi === undefined ? state.metrics.rssi : Number(req.body.rssi),
    receivedAt: nowIso(),
  };

  for (const key of ['temperature', 'humidity', 'substrateMoisture', 'co2']) {
    if (!Number.isFinite(reading[key])) {
      return res.status(400).json({ error: `Missing or invalid metric: ${key}` });
    }
  }

  state.metrics = reading;
  state.lastUpdated = reading.receivedAt;
  state.readings = [reading, ...state.readings].slice(0, 120);
  evaluateAlerts(reading);
  broadcast('telemetry.updated');
  return res.status(201).json({ ok: true, state: publicState() });
});

app.post('/api/actuators/:id', (req, res) => {
  const { id } = req.params;
  const actuator = state.actuators[id];
  if (!actuator) {
    return res.status(404).json({ error: 'Unknown actuator', allowed: Object.keys(state.actuators) });
  }

  const nextState = req.body.state;
  if (!['on', 'off'].includes(nextState)) {
    return res.status(400).json({ error: 'state must be "on" or "off"' });
  }

  actuator.state = nextState;
  actuator.mode = req.body.mode === 'auto' ? 'auto' : 'manual';
  actuator.lastChanged = nowIso();
  const command = {
    id: `${id}-${Date.now()}`,
    actuatorId: id,
    state: nextState,
    mode: actuator.mode,
    topic: `strawmind/bed-01/cmd/${id}`,
    payload: { state: nextState },
    createdAt: actuator.lastChanged,
  };
  state.commands = [command, ...state.commands].slice(0, 50);
  broadcast('actuator.updated');
  return res.json({ ok: true, command, state: publicState() });
});

app.use(express.static(distPath));

app.get(/.*/, (_req, res) => {
  res.sendFile(join(distPath, 'index.html'));
});

const server = createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (socket) => {
  socket.send(JSON.stringify({ event: 'state.snapshot', payload: publicState(), sentAt: nowIso() }));
});

server.listen(PORT, () => {
  console.log(`StrawMind backend listening on http://localhost:${PORT}`);
});

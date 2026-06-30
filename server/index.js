import cors from 'cors';
import express from 'express';
import mqtt from 'mqtt';
import { createClient } from '@supabase/supabase-js';
import { WebSocketServer } from 'ws';
import { createServer } from 'node:http';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PORT = Number(process.env.PORT || 8787);
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || '*';
const MQTT_HOST = process.env.MQTT_HOST || '';
const MQTT_PORT = Number(process.env.MQTT_PORT || 8883);
const MQTT_USERNAME = process.env.MQTT_USERNAME || '';
const MQTT_PASSWORD = process.env.MQTT_PASSWORD || '';
const MQTT_TOPIC_PREFIX = process.env.MQTT_TOPIC_PREFIX || 'strawmind';
const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const __dirname = dirname(fileURLToPath(import.meta.url));
const distPath = join(__dirname, '..', 'dist');
const supabaseStatus = {
  enabled: Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY),
  url: SUPABASE_URL,
  lastError: null,
  lastWriteAt: null,
};
const supabase = supabaseStatus.enabled
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  : null;
const mqttStatus = {
  enabled: Boolean(MQTT_HOST && MQTT_USERNAME && MQTT_PASSWORD),
  connected: false,
  host: MQTT_HOST,
  port: MQTT_PORT,
  topicPrefix: MQTT_TOPIC_PREFIX,
  lastError: null,
  lastMessageAt: null,
};
let mqttClient = null;
const deviceIdCache = new Map();

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
  return fresh;
}

function publicState() {
  return {
    ...state,
    target: STAGE_RANGES[state.stage],
    recommendedActions: recommendedActions(state.metrics),
  };
}

function parseTelemetry(payload = {}) {
  const reading = {
    nodeId: String(payload.nodeId || state.metrics.nodeId),
    temperature: Number(payload.temperature),
    humidity: Number(payload.humidity),
    substrateMoisture: Number(payload.substrateMoisture),
    co2: Number(payload.co2),
    battery: payload.battery === undefined ? state.metrics.battery : Number(payload.battery),
    rssi: payload.rssi === undefined ? state.metrics.rssi : Number(payload.rssi),
    receivedAt: nowIso(),
  };

  for (const key of ['temperature', 'humidity', 'substrateMoisture', 'co2']) {
    if (!Number.isFinite(reading[key])) {
      throw new Error(`Missing or invalid metric: ${key}`);
    }
  }

  return reading;
}

function applyTelemetry(payload) {
  const reading = parseTelemetry(payload);
  state.metrics = reading;
  state.lastUpdated = reading.receivedAt;
  state.readings = [reading, ...state.readings].slice(0, 120);
  const newAlerts = evaluateAlerts(reading);
  persistTelemetry(reading, newAlerts).catch((error) => {
    supabaseStatus.lastError = error.message;
    console.error('[supabase] telemetry write failed:', error.message);
  });
  broadcast('telemetry.updated');
  return reading;
}

async function getOrCreateDevice(nodeId) {
  if (!supabase) return null;
  if (deviceIdCache.has(nodeId)) return deviceIdCache.get(nodeId);

  const { data: existing, error: selectError } = await supabase
    .from('devices')
    .select('id')
    .eq('device_code', nodeId)
    .maybeSingle();

  if (selectError) throw selectError;
  if (existing?.id) {
    deviceIdCache.set(nodeId, existing.id);
    return existing.id;
  }

  const { data: created, error: insertError } = await supabase
    .from('devices')
    .insert({
      device_code: nodeId,
      name: nodeId,
      type: 'iot_node',
      status: 'online',
      last_seen_at: nowIso(),
    })
    .select('id')
    .single();

  if (insertError) throw insertError;
  deviceIdCache.set(nodeId, created.id);
  return created.id;
}

async function persistTelemetry(reading, newAlerts = []) {
  if (!supabase) return;

  const deviceId = await getOrCreateDevice(reading.nodeId);
  const seenAt = reading.receivedAt;

  const { error: deviceError } = await supabase
    .from('devices')
    .update({ status: 'online', last_seen_at: seenAt })
    .eq('id', deviceId);

  if (deviceError) throw deviceError;

  const { error: logError } = await supabase.from('sensor_logs').insert({
    device_id: deviceId,
    temperature: reading.temperature,
    humidity: reading.humidity,
    co2: reading.co2,
    soil_moisture: reading.substrateMoisture,
    created_at: seenAt,
  });

  if (logError) throw logError;

  if (newAlerts.length) {
    const { error: alertError } = await supabase.from('alerts').insert(
      newAlerts.map((alert) => ({
        device_id: deviceId,
        alert_type: alert.metric,
        message: `${alert.title}: ${alert.message}`,
        severity: alert.severity,
        created_at: alert.createdAt,
      })),
    );

    if (alertError) throw alertError;
  }

  supabaseStatus.lastError = null;
  supabaseStatus.lastWriteAt = nowIso();
}

async function persistCommand(command) {
  if (!supabase) return;

  const deviceId = await getOrCreateDevice(state.metrics.nodeId);
  const { error } = await supabase.from('device_commands').insert({
    device_id: deviceId,
    command: command.actuatorId,
    payload: {
      state: command.state,
      mode: command.mode,
      topic: command.topic,
      mqttPublished: command.mqttPublished,
    },
    status: command.mqttPublished ? 'published' : 'pending',
    created_at: command.createdAt,
  });

  if (error) throw error;
  supabaseStatus.lastError = null;
  supabaseStatus.lastWriteAt = nowIso();
}

function broadcast(event, payload = publicState()) {
  const data = JSON.stringify({ event, payload, sentAt: nowIso() });
  for (const client of wss.clients) {
    if (client.readyState === client.OPEN) {
      client.send(data);
    }
  }
}

function publishMqttCommand(command) {
  if (!mqttClient || !mqttStatus.connected) return false;
  mqttClient.publish(command.topic, JSON.stringify(command.payload), { qos: 1 }, (error) => {
    if (error) {
      mqttStatus.lastError = error.message;
      console.error('[mqtt] publish failed:', error.message);
    }
  });
  return true;
}

function initMqttBridge() {
  if (!mqttStatus.enabled) {
    console.log('[mqtt] disabled. Set MQTT_HOST, MQTT_USERNAME and MQTT_PASSWORD to enable HiveMQ.');
    return;
  }

  const url = `mqtts://${MQTT_HOST}:${MQTT_PORT}`;
  mqttClient = mqtt.connect(url, {
    username: MQTT_USERNAME,
    password: MQTT_PASSWORD,
    clientId: `strawmind-backend-${Math.random().toString(16).slice(2)}`,
    clean: true,
    reconnectPeriod: 5000,
    connectTimeout: 15000,
  });

  mqttClient.on('connect', () => {
    mqttStatus.connected = true;
    mqttStatus.lastError = null;
    const telemetryTopic = `${MQTT_TOPIC_PREFIX}/+/telemetry`;
    mqttClient.subscribe(telemetryTopic, { qos: 1 }, (error) => {
      if (error) {
        mqttStatus.lastError = error.message;
        console.error('[mqtt] subscribe failed:', error.message);
        return;
      }
      console.log(`[mqtt] connected to ${MQTT_HOST}, subscribed ${telemetryTopic}`);
    });
  });

  mqttClient.on('reconnect', () => {
    mqttStatus.connected = false;
  });

  mqttClient.on('close', () => {
    mqttStatus.connected = false;
  });

  mqttClient.on('error', (error) => {
    mqttStatus.connected = false;
    mqttStatus.lastError = error.message;
    console.error('[mqtt] error:', error.message);
  });

  mqttClient.on('message', (topic, buffer) => {
    try {
      const payload = JSON.parse(buffer.toString());
      const [, nodeId] = topic.split('/');
      applyTelemetry({ nodeId, ...payload });
      mqttStatus.lastMessageAt = nowIso();
    } catch (error) {
      mqttStatus.lastError = error.message;
      console.error('[mqtt] invalid telemetry:', error.message);
    }
  });
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

app.get('/api/mqtt', (_req, res) => {
  res.json(mqttStatus);
});

app.get('/api/supabase', (_req, res) => {
  res.json({
    ...supabaseStatus,
    serviceRoleConfigured: Boolean(SUPABASE_SERVICE_ROLE_KEY),
  });
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
  try {
    applyTelemetry(req.body);
    return res.status(201).json({ ok: true, state: publicState() });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
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
    topic: `${MQTT_TOPIC_PREFIX}/${state.metrics.nodeId}/cmd/${id}`,
    payload: { state: nextState },
    createdAt: actuator.lastChanged,
  };
  state.commands = [command, ...state.commands].slice(0, 50);
  const mqttPublished = publishMqttCommand(command);
  command.mqttPublished = mqttPublished;
  persistCommand(command).catch((error) => {
    supabaseStatus.lastError = error.message;
    console.error('[supabase] command write failed:', error.message);
  });
  broadcast('actuator.updated');
  return res.json({ ok: true, command, mqttPublished, state: publicState() });
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

initMqttBridge();

server.listen(PORT, () => {
  console.log(`StrawMind backend listening on http://localhost:${PORT}`);
});

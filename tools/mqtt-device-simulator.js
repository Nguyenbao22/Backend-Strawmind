import mqtt from 'mqtt';

const MQTT_HOST = process.env.MQTT_HOST;
const MQTT_PORT = Number(process.env.MQTT_PORT || 8883);
const MQTT_USERNAME = process.env.MQTT_USERNAME;
const MQTT_PASSWORD = process.env.MQTT_PASSWORD;
const MQTT_TOPIC_PREFIX = process.env.MQTT_TOPIC_PREFIX || 'strawmind';
const NODE_ID = process.env.NODE_ID || 'bed-01';

if (!MQTT_HOST || !MQTT_USERNAME || !MQTT_PASSWORD) {
  console.error('Missing MQTT_HOST, MQTT_USERNAME or MQTT_PASSWORD.');
  console.error('Example:');
  console.error('$env:MQTT_HOST="3b8fa1f55fa44b14a8def756f361a0c1.s1.eu.hivemq.cloud"');
  console.error('$env:MQTT_USERNAME="your-hivemq-username"');
  console.error('$env:MQTT_PASSWORD="your-hivemq-password"');
  console.error('npm.cmd run mqtt:sim');
  process.exit(1);
}

const telemetryTopic = `${MQTT_TOPIC_PREFIX}/${NODE_ID}/telemetry`;
const commandTopic = `${MQTT_TOPIC_PREFIX}/${NODE_ID}/cmd/+`;
let tick = 0;

function wave(base, amplitude, speed = 1) {
  return base + Math.sin(tick / speed) * amplitude;
}

function reading() {
  tick += 1;
  return {
    temperature: Number(wave(29.2, 1.4, 5).toFixed(1)),
    humidity: Number(wave(91, 4, 4).toFixed(0)),
    substrateMoisture: Number(wave(65, 5, 7).toFixed(0)),
    co2: Number(wave(980, 310, 6).toFixed(0)),
    battery: Number(wave(91, 1, 11).toFixed(0)),
    rssi: Number(wave(-56, 4, 9).toFixed(0)),
  };
}

const client = mqtt.connect(`mqtts://${MQTT_HOST}:${MQTT_PORT}`, {
  username: MQTT_USERNAME,
  password: MQTT_PASSWORD,
  clientId: `strawmind-sim-${Math.random().toString(16).slice(2)}`,
  clean: true,
  reconnectPeriod: 5000,
  connectTimeout: 15000,
});

client.on('connect', () => {
  console.log(`[mqtt-sim] connected ${MQTT_HOST}`);
  console.log(`[mqtt-sim] publishing ${telemetryTopic}`);
  console.log(`[mqtt-sim] subscribing ${commandTopic}`);
  client.subscribe(commandTopic, { qos: 1 });
  publish();
  setInterval(publish, 5000);
});

client.on('message', (topic, payload) => {
  console.log(`[mqtt-sim] command ${topic}: ${payload.toString()}`);
});

client.on('error', (error) => {
  console.error('[mqtt-sim] error:', error.message);
});

function publish() {
  const payload = reading();
  client.publish(telemetryTopic, JSON.stringify(payload), { qos: 1 }, (error) => {
    if (error) {
      console.error('[mqtt-sim] publish failed:', error.message);
      return;
    }
    console.log(`[mqtt-sim] telemetry -> ${JSON.stringify(payload)}`);
  });
}

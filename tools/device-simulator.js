const API_URL = process.env.API_URL || 'http://localhost:8787/api/telemetry';
const nodeId = process.env.NODE_ID || 'bed-01';

let tick = 0;

function wave(base, amplitude, speed = 1) {
  return base + Math.sin(tick / speed) * amplitude;
}

function reading() {
  tick += 1;
  const humidityDip = tick % 18 > 12 ? -7 : 0;
  const heatSpike = tick % 24 > 18 ? 3.5 : 0;

  return {
    nodeId,
    temperature: Number((wave(29.2, 1.3, 5) + heatSpike).toFixed(1)),
    humidity: Number((wave(91, 2.8, 4) + humidityDip).toFixed(0)),
    substrateMoisture: Number(wave(64, 5, 7).toFixed(0)),
    co2: Number((wave(1050, 360, 6) + (tick % 20 > 15 ? 650 : 0)).toFixed(0)),
    battery: Number(wave(91, 1.5, 11).toFixed(0)),
    rssi: Number(wave(-55, 4, 9).toFixed(0)),
  };
}

async function publish() {
  const payload = reading();
  const response = await fetch(API_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`${response.status} ${text}`);
  }
  console.log(`[sim] ${new Date().toLocaleTimeString()} ->`, payload);
}

console.log(`Publishing simulated ESP32 telemetry to ${API_URL}`);
publish().catch((error) => console.error('[sim]', error.message));
setInterval(() => publish().catch((error) => console.error('[sim]', error.message)), 5000);

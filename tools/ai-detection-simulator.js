const API_URL = process.env.AI_API_URL || 'http://localhost:8787/api/detections';
const nodeId = process.env.NODE_ID || 'bed-01';

let tick = 0;

function detectionPayload() {
  tick += 1;
  const affected = tick % 3 !== 0;
  const detections = affected
    ? [
        {
          className: 'Affected Mushroom',
          confidence: 0.82 + (tick % 5) * 0.02,
          bbox: { x1: 120, y1: 80, x2: 265, y2: 220 },
        },
        {
          className: 'Healthy Mushroom',
          confidence: 0.91,
          bbox: { x1: 330, y1: 110, x2: 450, y2: 245 },
        },
      ]
    : [
        {
          className: 'Healthy Mushroom',
          confidence: 0.94,
          bbox: { x1: 210, y1: 120, x2: 360, y2: 280 },
        },
      ];

  return {
    nodeId,
    modelName: 'YOLOv8n-ONNX-Pi',
    healthyCount: detections.filter((item) => /healthy/i.test(item.className)).length,
    affectedCount: detections.filter((item) => /affected/i.test(item.className)).length,
    inferenceTimeMs: 380 + (tick % 4) * 25,
    detections,
  };
}

async function publish() {
  const payload = detectionPayload();
  const response = await fetch(API_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`${response.status} ${text}`);
  }
  console.log(`[ai-sim] ${new Date().toLocaleTimeString()} ->`, payload);
}

console.log(`Publishing simulated AI detections to ${API_URL}`);
publish().catch((error) => console.error('[ai-sim]', error.message));
setInterval(() => publish().catch((error) => console.error('[ai-sim]', error.message)), 10000);

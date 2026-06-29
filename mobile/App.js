import Constants from 'expo-constants';
import { Image } from 'expo-image';
import * as Notifications from 'expo-notifications';
import { StatusBar } from 'expo-status-bar';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Svg, { Circle, Line, Polyline } from 'react-native-svg';

const mushroomThumb = require('./assets/mushroom-thumb.png');
const mushroomReport = require('./assets/mushroom-report.png');

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

const palette = {
  bg: '#f7f5ee',
  card: '#fffefb',
  soft: '#f4f1e8',
  ink: '#171914',
  text: '#2a2d25',
  muted: '#75786f',
  green: '#2f7d26',
  greenDeep: '#1f641a',
  greenSoft: '#eaf5e7',
  orange: '#f4a01d',
  orangeSoft: '#fff4dd',
  red: '#e74d3d',
  redSoft: '#fff0ee',
  blue: '#2d83df',
  blueSoft: '#e9f2ff',
  line: 'rgba(23, 25, 20, 0.1)',
  shadow: 'rgba(38, 52, 24, 0.13)',
};

const metricMeta = {
  temperature: { label: 'Nhiệt độ', unit: '°C', icon: 'thermometer', precision: 1, color: '#111111' },
  humidity: { label: 'Độ ẩm không khí', unit: '%', icon: 'water', precision: 0, color: '#2d9dc5' },
  co2: { label: 'CO₂', unit: 'ppm', icon: 'weather-cloudy', precision: 0, color: '#111111' },
  substrateMoisture: { label: 'Độ ẩm giá thể', unit: '%', icon: 'sack', precision: 0, color: '#111111' },
};

const stageLabels = {
  incubation: 'Ủ tơ',
  pinning: 'Ra nụ',
  harvest: 'Thu hoạch',
};

const tabs = [
  { id: 'home', label: 'Trang chủ', icon: 'home' },
  { id: 'monitor', label: 'Giám sát', icon: 'chart-line' },
  { id: 'ai', label: 'AI', icon: 'alert-outline' },
  { id: 'devices', label: 'Thiết bị', icon: 'briefcase-outline' },
  { id: 'account', label: 'Tài khoản', icon: 'account-outline' },
];

const actuatorUi = {
  fan: { label: 'Quạt thông gió', icon: 'fan', color: palette.blue, bg: palette.blueSoft },
  mist: { label: 'Phun sương', icon: 'water', color: '#46a9df', bg: '#e9f7ff' },
  pump: { label: 'Bơm tưới', icon: 'water-pump', color: palette.green, bg: palette.greenSoft },
};

const aiRows = [
  { status: 'Khỏe mạnh', color: palette.green, bg: palette.greenSoft, confidence: 96, time: '07:30' },
  { status: 'Nghi ngờ', color: palette.orange, bg: palette.orangeSoft, confidence: 72, time: '07:30' },
  { status: 'Bị bệnh', color: palette.red, bg: palette.redSoft, confidence: 88, time: '06:30' },
  { status: 'Hỗn hợp', color: palette.orange, bg: palette.orangeSoft, confidence: 81, time: '06:00' },
];

const alertSeed = [
  { title: 'Nấm bị bệnh', place: 'Nhà 01 - Khu A', level: 'Cao', icon: 'crosshairs-gps', color: palette.red },
  { title: 'Nhiệt độ cao', place: 'Nhà 02 - Khu B', level: 'Trung bình', icon: 'thermometer', color: palette.orange },
  { title: 'Độ ẩm thấp', place: 'Nhà 01 - Khu A', level: 'Thấp', icon: 'water', color: palette.blue },
  { title: 'CO₂ cao', place: 'Nhà 02 - Khu B', level: 'Trung bình', icon: 'weather-cloudy', color: palette.orange },
  { title: 'Bình thường', place: 'Nhà 01 - Khu A', level: 'Thấp', icon: 'pulse', color: palette.green },
];

function defaultApiBase() {
  if (process.env.EXPO_PUBLIC_API_BASE) {
    return process.env.EXPO_PUBLIC_API_BASE.replace(/\/$/, '');
  }
  const hostUri = Constants.expoConfig?.hostUri || Constants.manifest2?.extra?.expoGo?.debuggerHost;
  const host = hostUri?.split(':')?.[0];
  return host ? `http://${host}:8787` : 'http://localhost:8787';
}

function formatTime(value) {
  if (!value) return '09:41';
  return new Intl.DateTimeFormat('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function formatDate(value) {
  if (!value) return '20/05/2026';
  return new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(value));
}

function metricStatus(value, range) {
  if (!range || typeof value !== 'number') return 'normal';
  if (value < range[0]) return 'low';
  if (value > range[1]) return 'high';
  return 'normal';
}

function valueText(value, precision) {
  if (typeof value !== 'number') return '--';
  return value.toFixed(precision);
}

function overallState(metrics, target) {
  if (!metrics || !target) return { label: 'Tốt', sub: 'Không có cảnh báo', score: 100 };
  const keys = ['temperature', 'humidity', 'co2', 'substrateMoisture'];
  const misses = keys.filter((key) => metricStatus(metrics[key], target[key]) !== 'normal').length;
  if (misses === 0) return { label: 'Tốt', sub: 'Không có cảnh báo', score: 100 };
  if (misses <= 2) return { label: 'Cần chú ý', sub: `${misses} thông số lệch ngưỡng`, score: 72 };
  return { label: 'Rủi ro', sub: `${misses} thông số cần xử lý`, score: 48 };
}

async function showLocalAlert(alert) {
  const permissions = await Notifications.getPermissionsAsync();
  if (!permissions.granted) return;
  await Notifications.scheduleNotificationAsync({
    content: {
      title: `StrawMind: ${alert.title}`,
      body: alert.message,
    },
    trigger: null,
  });
}

function ScreenFrame({ title, children, rightIcon = 'tune-variant', onBack }) {
  return (
    <View style={styles.screenInner}>
      <View style={styles.simpleHeader}>
        <Pressable style={styles.headerIconButton} onPress={onBack}>
          <MaterialCommunityIcons name="chevron-left" size={25} color={palette.ink} />
        </Pressable>
        <Text style={styles.simpleTitle}>{title}</Text>
        <View style={styles.headerIconButton}>
          <MaterialCommunityIcons name={rightIcon} size={21} color={palette.ink} />
        </View>
      </View>
      {children}
    </View>
  );
}

function MetricIcon({ icon, color }) {
  return <MaterialCommunityIcons name={icon} size={21} color={color} />;
}

function Sparkline({ color, values }) {
  const max = Math.max(...values);
  const min = Math.min(...values);
  const width = 300;
  const height = 76;
  const xStep = width / Math.max(1, values.length - 1);
  const points = values
    .map((item, index) => {
      const y = height - 12 - ((item - min) / Math.max(1, max - min)) * 50;
      return `${index * xStep},${y}`;
    })
    .join(' ');

  return (
    <View style={styles.sparkline}>
      <Svg viewBox={`0 0 ${width} ${height}`} width="100%" height="100%">
        <Line x1="0" y1="18" x2={width} y2="18" stroke="#ece8de" strokeWidth="1" />
        <Line x1="0" y1="40" x2={width} y2="40" stroke="#ece8de" strokeWidth="1" />
        <Line x1="0" y1="62" x2={width} y2="62" stroke="#ece8de" strokeWidth="1" />
        <Polyline points={points} fill="none" stroke={color} strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
        {values.map((item, index) => {
          const y = height - 12 - ((item - min) / Math.max(1, max - min)) * 50;
          return <Circle key={`${item}-${index}`} cx={index * xStep} cy={y} r="2.6" fill="#fff" stroke={color} strokeWidth="1.5" />;
        })}
      </Svg>
    </View>
  );
}

export default function App() {
  const initialApiBase = useMemo(defaultApiBase, []);
  const [apiBase, setApiBase] = useState(initialApiBase);
  const [draftApiBase, setDraftApiBase] = useState(initialApiBase);
  const [activeTab, setActiveTab] = useState('home');
  const [state, setState] = useState(null);
  const [online, setOnline] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busyActuator, setBusyActuator] = useState(null);
  const newestAlertRef = useRef(null);
  const socketRef = useRef(null);

  const wsUrl = useMemo(() => apiBase.replace(/^http/, 'ws') + '/ws', [apiBase]);

  async function loadState(base = apiBase, quiet = false) {
    setLoading(true);
    try {
      const response = await fetch(`${base}/api/state`);
      const payload = await response.json();
      setState(payload);
      setOnline(true);
    } catch (error) {
      setOnline(false);
      if (!quiet) {
        Alert.alert('Không kết nối được backend', `Kiểm tra server ở ${base}`);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadState(apiBase, true);
    socketRef.current?.close();
    const socket = new WebSocket(wsUrl);
    socketRef.current = socket;

    socket.onopen = () => setOnline(true);
    socket.onclose = () => setOnline(false);
    socket.onerror = () => setOnline(false);
    socket.onmessage = (event) => {
      const message = JSON.parse(event.data);
      const nextState = message.payload;
      setState(nextState);
      const latestAlert = nextState?.alerts?.[0];
      if (latestAlert && latestAlert.id !== newestAlertRef.current) {
        newestAlertRef.current = latestAlert.id;
        showLocalAlert(latestAlert);
      }
    };

    return () => socket.close();
  }, [apiBase, wsUrl]);

  async function requestNotifications() {
    const permissions = await Notifications.requestPermissionsAsync();
    Alert.alert(
      'Thông báo',
      permissions.granted ? 'Đã bật cảnh báo trên điện thoại.' : 'Bạn chưa cấp quyền thông báo.',
    );
  }

  async function toggleActuator(id) {
    const current = state.actuators[id].state;
    setBusyActuator(id);
    try {
      const response = await fetch(`${apiBase}/api/actuators/${id}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ state: current === 'on' ? 'off' : 'on', mode: 'manual' }),
      });
      const payload = await response.json();
      setState(payload.state);
    } finally {
      setBusyActuator(null);
    }
  }

  function applyBackendUrl() {
    const normalized = draftApiBase.trim().replace(/\/$/, '');
    setApiBase(normalized);
  }

  const metrics = state?.readings?.[0] || state?.metrics || {};
  const target = state?.target || {};
  const overall = overallState(metrics, target);
  const alerts = state?.alerts || [];
  const actuators = state?.actuators || {};
  const extraOnlineDevices = 2;
  const totalDeviceCount = 6;
  const activeDeviceCount = Object.values(actuators).filter((item) => item.state === 'on').length + extraOnlineDevices;

  function renderHome() {
    return (
      <View style={styles.screenInner}>
        <View style={styles.homeHeader}>
          <View>
            <Text style={styles.farmTitle}>Trang trại nấm rơm⌄</Text>
            <Text style={styles.farmSub}>Khu A - Nhà 01</Text>
          </View>
          <Pressable style={styles.bellButton} onPress={requestNotifications}>
            <MaterialCommunityIcons name="bell-outline" size={23} color={palette.ink} />
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{Math.max(1, alerts.length)}</Text>
            </View>
          </Pressable>
        </View>

        <View style={styles.overviewCard}>
          <View style={styles.cardTitleRow}>
            <View>
              <Text style={styles.cardTitle}>Trạng thái tổng quan</Text>
              <Text style={styles.cardSub}>Cập nhật {formatTime(state?.lastUpdated)} - {formatDate(state?.lastUpdated)}</Text>
            </View>
          </View>
          <View style={styles.overviewBody}>
            <View style={styles.statusCircleOuter}>
              <View style={styles.statusCircle}>
                <MaterialCommunityIcons name="shield-check" size={31} color={palette.green} />
                <Text style={styles.statusLabel}>{overall.label}</Text>
                <Text style={styles.statusSub}>{overall.sub}</Text>
              </View>
            </View>
            <View style={styles.metricStack}>
              {Object.entries(metricMeta).map(([key, meta]) => (
                <View style={styles.homeMetricRow} key={key}>
                  <MetricIcon icon={meta.icon} color={meta.color} />
                  <View style={styles.homeMetricText}>
                    <Text style={styles.homeMetricLabel}>{meta.label}</Text>
                    <Text style={styles.homeMetricValue}>
                      {valueText(metrics[key], meta.precision)} <Text style={styles.unit}>{meta.unit}</Text>
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          </View>
        </View>

        <View style={styles.sectionCard}>
          <View style={styles.cardTitleRow}>
            <Text style={styles.cardTitle}>Thiết bị hoạt động</Text>
            <Text style={styles.cardSub}>{activeDeviceCount}/{totalDeviceCount} thiết bị</Text>
          </View>
          <View style={styles.deviceGrid}>
            {Object.entries(actuatorUi).map(([id, meta]) => {
              const device = actuators[id];
              const isOn = device?.state === 'on';
              return (
                <Pressable style={styles.deviceMini} key={id} onPress={() => toggleActuator(id)}>
                  <View style={[styles.iconBubble, { backgroundColor: meta.bg }]}>
                    <MaterialCommunityIcons name={meta.icon} size={23} color={meta.color} />
                  </View>
                  <View>
                    <Text style={styles.deviceMiniTitle}>{meta.label}</Text>
                    <Text style={[styles.deviceState, isOn && styles.deviceStateOn]}>
                      {isOn ? 'BẬT' : 'TẮT'}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
            <View style={styles.deviceMini}>
              <View style={[styles.iconBubble, { backgroundColor: '#eef2f4' }]}>
                <MaterialCommunityIcons name="camera-outline" size={23} color="#40505a" />
              </View>
              <View>
                <Text style={styles.deviceMiniTitle}>Camera AI</Text>
                <Text style={styles.deviceStateOn}>HOẠT ĐỘNG</Text>
              </View>
            </View>
          </View>
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.cardTitle}>AI phát hiện bệnh</Text>
          <Text style={styles.cardSub}>Kiểm tra lần cuối: 09:30 - 20/05/2026</Text>
          <View style={styles.aiStatGrid}>
            <View style={[styles.aiStat, { backgroundColor: palette.greenSoft, borderColor: '#9ed894' }]}>
              <Text style={[styles.aiNumber, { color: palette.green }]}>18</Text>
              <Text style={styles.aiStatLabel}>Khỏe mạnh</Text>
            </View>
            <View style={[styles.aiStat, { backgroundColor: palette.orangeSoft, borderColor: '#ffd079' }]}>
              <Text style={[styles.aiNumber, { color: palette.orange }]}>3</Text>
              <Text style={styles.aiStatLabel}>Nghi ngờ</Text>
            </View>
            <View style={[styles.aiStat, { backgroundColor: palette.redSoft, borderColor: '#ffb8af' }]}>
              <Text style={[styles.aiNumber, { color: palette.red }]}>1</Text>
              <Text style={styles.aiStatLabel}>Bị bệnh</Text>
            </View>
          </View>
          <Pressable style={styles.primaryButton} onPress={() => setActiveTab('ai')}>
            <Text style={styles.primaryButtonText}>Xem chi tiết</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  function renderMonitor() {
    const charts = [
      { key: 'temperature', avg: '30.2°C', color: palette.green, values: [18, 22, 16, 20, 26, 34, 31, 23, 19, 25, 27, 24] },
      { key: 'humidity', avg: '87%', color: palette.blue, values: [28, 24, 19, 25, 31, 22, 30, 33, 27, 25, 29, 31] },
      { key: 'co2', avg: '826 ppm', color: palette.blue, values: [14, 18, 21, 17, 25, 20, 23, 19, 27, 24, 29, 33] },
      { key: 'substrateMoisture', avg: '72%', color: palette.blue, values: [20, 16, 15, 18, 24, 19, 17, 22, 21, 26, 29, 25] },
    ];
    return (
      <ScreenFrame title="Giám sát môi trường" onBack={() => setActiveTab('home')}>
        <View style={styles.segment}>
          <Text style={styles.segmentText}>Ngày</Text>
          <Text style={styles.segmentActive}>7 ngày</Text>
          <Text style={styles.segmentText}>30 ngày</Text>
        </View>
        {charts.map((chart) => {
          const meta = metricMeta[chart.key];
          return (
            <View style={styles.chartCard} key={chart.key}>
              <View style={styles.chartHead}>
                <Text style={styles.chartTitle}>{meta.label} ({meta.unit})</Text>
                <Text style={styles.chartAvg}>Trung bình {chart.avg}</Text>
              </View>
              <Sparkline color={chart.color} values={chart.values} />
            </View>
          );
        })}
      </ScreenFrame>
    );
  }

  function renderAi() {
    return (
      <ScreenFrame title="AI phát hiện bệnh" onBack={() => setActiveTab('home')}>
        <View style={styles.filterRow}>
          {['Tất cả', 'Khỏe mạnh', 'Nghi ngờ', 'Bị bệnh'].map((item, index) => (
            <Text key={item} style={index === 0 ? styles.filterActive : styles.filterText}>{item}</Text>
          ))}
        </View>
        {aiRows.map((row) => (
          <View style={styles.aiRowCard} key={row.status}>
            <Image source={mushroomThumb} style={styles.aiThumb} contentFit="cover" />
            <View style={styles.aiRowCopy}>
              <View style={styles.aiRowStatus}>
                <MaterialCommunityIcons name="shield-check" size={17} color={row.color} />
                <Text style={[styles.aiRowTitle, { color: row.color }]}>{row.status}</Text>
              </View>
              <Text style={styles.aiRowMeta}>{row.time} - 20/05/2026</Text>
              <Text style={styles.aiRowConfidence}>Độ tin cậy: <Text style={{ color: palette.green }}>{row.confidence}%</Text></Text>
            </View>
            <MaterialCommunityIcons name="chevron-right" size={22} color={palette.muted} />
          </View>
        ))}
        <Pressable style={styles.primaryButton}>
          <Text style={styles.primaryButtonText}>Xem báo cáo AI</Text>
        </Pressable>
        <View style={styles.recommendCard}>
          <Text style={styles.cardTitle}>Dự báo & khuyến nghị</Text>
          <View style={styles.harvestBox}>
            <View style={{ flex: 1 }}>
              <Text style={styles.harvestLabel}>Dự báo thu hoạch sau</Text>
              <Text style={styles.harvestValue}>3-5 ngày</Text>
              <Text style={styles.cardSub}>(23 - 25/05/2026)</Text>
            </View>
            <Image source={mushroomReport} style={styles.reportImage} contentFit="contain" />
          </View>
          {['Duy trì độ ẩm 85 - 90%', 'Nhiệt độ lý tưởng 28 - 32°C', 'Kiểm tra và vệ sinh hệ thống phun sương', 'Theo dõi nấm nghi ngờ trong 24h tới'].map((item) => (
            <View style={styles.recommendLine} key={item}>
              <MaterialCommunityIcons name="check-circle-outline" size={15} color={palette.muted} />
              <Text style={styles.recommendText}>{item}</Text>
            </View>
          ))}
        </View>
        <View style={styles.sectionCard}>
          <View style={styles.cardTitleRow}>
            <Text style={styles.cardTitle}>Cảnh báo gần đây</Text>
            <MaterialCommunityIcons name="tune-variant" size={18} color={palette.ink} />
          </View>
          {alertSeed.slice(0, 3).map((item, index) => (
            <View style={styles.compactAlert} key={item.title}>
              <View style={[styles.compactAlertIcon, { backgroundColor: item.color }]}>
                <MaterialCommunityIcons name={item.icon} size={18} color="#fff" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.alertTitle}>{index === 0 && alerts[0] ? alerts[0].title : item.title}</Text>
                <Text style={styles.cardSub}>Mức độ: {item.level}</Text>
              </View>
              <MaterialCommunityIcons name="chevron-right" size={20} color={palette.muted} />
            </View>
          ))}
        </View>
      </ScreenFrame>
    );
  }

  function renderDevices() {
    const rows = [
      ['fan', actuatorUi.fan],
      ['mist', actuatorUi.mist],
      ['pump', actuatorUi.pump],
      ['light', { label: 'Đèn chiếu sáng', icon: 'lightbulb-outline', color: palette.orange, bg: palette.orangeSoft }],
      ['camera', { label: 'Camera AI', icon: 'camera-outline', color: '#40505a', bg: '#eef2f4' }],
      ['sensor', { label: 'Cảm biến DHT22', icon: 'chip', color: '#8f722c', bg: '#f7efd7' }],
    ];
    return (
      <ScreenFrame title="Thiết bị" rightIcon="dots-horizontal" onBack={() => setActiveTab('home')}>
        <View style={styles.filterRow}>
          {['Tất cả', 'Đang bật', 'Đang tắt'].map((item, index) => (
            <Text key={item} style={index === 0 ? styles.filterActive : styles.filterText}>{item}</Text>
          ))}
        </View>
        {rows.map(([id, meta]) => {
          const isReal = id === 'fan' || id === 'mist' || id === 'pump';
          const isOn = isReal ? actuators[id]?.state === 'on' : id !== 'light';
          return (
            <Pressable
              key={id}
              style={styles.deviceRow}
              onPress={() => {
                if (isReal) toggleActuator(id);
              }}
              disabled={!isReal || busyActuator === id}
            >
              <View style={[styles.deviceRowIcon, { backgroundColor: meta.bg }]}>
                <MaterialCommunityIcons name={meta.icon} size={24} color={meta.color} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.deviceRowTitle}>{meta.label}</Text>
                <Text style={isOn ? styles.deviceStateOn : styles.deviceState}>{isOn ? 'BẬT' : 'TẮT'}</Text>
                <Text style={styles.cardSub}>{id === 'camera' || id === 'sensor' ? 'Trực tuyến' : 'Tự động'}</Text>
              </View>
              <View style={[styles.switch, isOn && styles.switchOn]}>
                <View style={[styles.switchKnob, isOn && styles.switchKnobOn]} />
              </View>
            </Pressable>
          );
        })}
      </ScreenFrame>
    );
  }

  function renderAccount() {
    return (
      <ScreenFrame title="Cài đặt kết nối" rightIcon="cog-outline" onBack={() => setActiveTab('home')}>
        <View style={styles.sectionCard}>
          <Text style={styles.cardTitle}>Backend IoT</Text>
          <Text style={styles.cardSub}>Điện thoại cần cùng Wi-Fi với máy chạy backend hoặc dùng URL server public.</Text>
          <TextInput
            value={draftApiBase}
            onChangeText={setDraftApiBase}
            autoCapitalize="none"
            autoCorrect={false}
            style={styles.input}
          />
          <Pressable style={styles.primaryButton} onPress={applyBackendUrl}>
            <Text style={styles.primaryButtonText}>Lưu kết nối</Text>
          </Pressable>
          <Pressable style={styles.secondaryButton} onPress={() => loadState(apiBase)}>
            <Text style={styles.secondaryButtonText}>{online ? 'Đang kết nối realtime' : 'Thử kết nối lại'}</Text>
          </Pressable>
        </View>
      </ScreenFrame>
    );
  }

  function renderAlerts() {
    return (
      <ScreenFrame title="Cảnh báo" onBack={() => setActiveTab('home')}>
        {alertSeed.map((item, index) => (
          <View style={styles.alertRow} key={item.title}>
            <View style={[styles.alertIcon, { backgroundColor: item.color }]}>
              <MaterialCommunityIcons name={item.icon} size={22} color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.alertTitle}>{index === 0 && alerts[0] ? alerts[0].title : item.title}</Text>
              <Text style={styles.cardSub}>{item.place}</Text>
              <Text style={styles.cardSub}>08:{15 + index * 4} - 20/05/2026</Text>
              <Text style={styles.alertLevel}>Mức độ: <Text style={{ color: item.color }}>{item.level}</Text></Text>
            </View>
            <MaterialCommunityIcons name="chevron-right" size={22} color={palette.muted} />
          </View>
        ))}
      </ScreenFrame>
    );
  }

  let content = null;
  if (loading && !state) {
    content = (
      <View style={styles.loadingBox}>
        <ActivityIndicator color={palette.green} />
        <Text style={styles.cardSub}>Đang kết nối StrawMind</Text>
      </View>
    );
  } else if (activeTab === 'home') {
    content = renderHome();
  } else if (activeTab === 'monitor') {
    content = renderMonitor();
  } else if (activeTab === 'ai') {
    content = renderAi();
  } else if (activeTab === 'devices') {
    content = renderDevices();
  } else {
    content = renderAccount();
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />
      <View style={styles.appShell}>
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          {activeTab === 'ai-alerts' ? renderAlerts() : content}
        </ScrollView>
        <View style={styles.bottomNav}>
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <Pressable key={tab.id} style={styles.navItem} onPress={() => setActiveTab(tab.id)}>
                <MaterialCommunityIcons name={tab.icon} size={21} color={isActive ? palette.green : palette.muted} />
                <Text style={[styles.navText, isActive && styles.navTextActive]}>{tab.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: palette.bg,
  },
  appShell: {
    flex: 1,
    backgroundColor: palette.bg,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 92,
  },
  screenInner: {
    gap: 12,
  },
  homeHeader: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  farmTitle: {
    color: palette.ink,
    fontSize: 22,
    fontWeight: '800',
  },
  farmSub: {
    color: palette.muted,
    fontSize: 14,
    marginTop: 4,
  },
  bellButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: palette.red,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '800',
  },
  overviewCard: {
    borderRadius: 18,
    backgroundColor: palette.card,
    borderWidth: 1,
    borderColor: palette.line,
    padding: 16,
    shadowColor: palette.shadow,
    shadowOpacity: 0.55,
    shadowRadius: 20,
    elevation: 3,
  },
  sectionCard: {
    borderRadius: 18,
    backgroundColor: palette.card,
    borderWidth: 1,
    borderColor: palette.line,
    padding: 16,
    gap: 10,
    shadowColor: palette.shadow,
    shadowOpacity: 0.35,
    shadowRadius: 14,
    elevation: 2,
  },
  cardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 12,
  },
  cardTitle: {
    color: palette.ink,
    fontSize: 17,
    fontWeight: '800',
  },
  cardSub: {
    color: palette.muted,
    fontSize: 12,
    lineHeight: 17,
  },
  overviewBody: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  statusCircleOuter: {
    width: 142,
    height: 142,
    borderRadius: 71,
    borderWidth: 8,
    borderColor: '#76cf6a',
    backgroundColor: '#f7fff4',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#72cf65',
    shadowOpacity: 0.5,
    shadowRadius: 18,
  },
  statusCircle: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusLabel: {
    color: palette.green,
    fontSize: 24,
    fontWeight: '900',
    marginTop: 4,
  },
  statusSub: {
    color: palette.muted,
    fontSize: 11,
  },
  metricStack: {
    flex: 1,
  },
  homeMetricRow: {
    minHeight: 51,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: palette.line,
  },
  homeMetricText: {
    flex: 1,
  },
  homeMetricLabel: {
    color: palette.muted,
    fontSize: 12,
  },
  homeMetricValue: {
    color: palette.ink,
    fontSize: 18,
    fontWeight: '800',
    marginTop: 2,
  },
  unit: {
    fontSize: 12,
  },
  deviceGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  deviceMini: {
    width: '48.3%',
    minHeight: 66,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: '#fbfaf5',
    padding: 11,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  iconBubble: {
    width: 35,
    height: 35,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deviceMiniTitle: {
    color: palette.text,
    fontSize: 12,
    fontWeight: '700',
  },
  deviceState: {
    color: palette.muted,
    fontSize: 11,
    fontWeight: '900',
    marginTop: 2,
  },
  deviceStateOn: {
    color: palette.green,
    fontSize: 11,
    fontWeight: '900',
    marginTop: 2,
  },
  aiStatGrid: {
    flexDirection: 'row',
    gap: 9,
    marginTop: 8,
  },
  aiStat: {
    flex: 1,
    minHeight: 74,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  aiNumber: {
    fontSize: 26,
    fontWeight: '900',
  },
  aiStatLabel: {
    color: palette.text,
    fontSize: 11,
  },
  primaryButton: {
    minHeight: 44,
    borderRadius: 10,
    backgroundColor: palette.green,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '800',
  },
  secondaryButton: {
    minHeight: 44,
    borderRadius: 10,
    backgroundColor: palette.greenSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonText: {
    color: palette.green,
    fontWeight: '800',
  },
  simpleHeader: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerIconButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  simpleTitle: {
    color: palette.ink,
    fontSize: 17,
    fontWeight: '800',
  },
  segment: {
    minHeight: 37,
    borderRadius: 999,
    backgroundColor: palette.soft,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 3,
  },
  segmentText: {
    flex: 1,
    color: palette.muted,
    textAlign: 'center',
    fontSize: 12,
  },
  segmentActive: {
    flex: 1,
    minHeight: 31,
    borderRadius: 999,
    backgroundColor: palette.green,
    color: '#fff',
    textAlign: 'center',
    textAlignVertical: 'center',
    paddingTop: 7,
    fontSize: 12,
    fontWeight: '800',
  },
  chartCard: {
    borderRadius: 17,
    backgroundColor: palette.card,
    borderWidth: 1,
    borderColor: palette.line,
    padding: 14,
    gap: 10,
  },
  chartHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  chartTitle: {
    color: palette.ink,
    fontWeight: '800',
    fontSize: 13,
  },
  chartAvg: {
    color: palette.muted,
    fontSize: 12,
  },
  sparkline: {
    height: 68,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 6,
    paddingTop: 10,
  },
  sparkBar: {
    flex: 1,
    borderRadius: 7,
    opacity: 0.9,
  },
  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 40,
  },
  filterText: {
    color: palette.muted,
    fontSize: 13,
    paddingHorizontal: 8,
  },
  filterActive: {
    color: '#fff',
    backgroundColor: palette.green,
    borderRadius: 12,
    overflow: 'hidden',
    paddingHorizontal: 14,
    paddingVertical: 8,
    fontSize: 13,
    fontWeight: '800',
  },
  aiRowCard: {
    minHeight: 96,
    borderRadius: 13,
    backgroundColor: palette.card,
    borderWidth: 1,
    borderColor: palette.line,
    padding: 9,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
  },
  aiThumb: {
    width: 82,
    height: 82,
    borderRadius: 10,
  },
  aiRowCopy: {
    flex: 1,
    gap: 5,
  },
  aiRowStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  aiRowTitle: {
    fontWeight: '800',
  },
  aiRowMeta: {
    color: palette.muted,
    fontSize: 12,
  },
  aiRowConfidence: {
    color: palette.text,
    fontSize: 13,
  },
  recommendCard: {
    borderRadius: 18,
    backgroundColor: palette.card,
    borderWidth: 1,
    borderColor: palette.line,
    padding: 16,
    gap: 9,
  },
  harvestBox: {
    minHeight: 110,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: palette.line,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  harvestLabel: {
    color: palette.text,
    fontWeight: '700',
  },
  harvestValue: {
    color: palette.green,
    fontSize: 28,
    fontWeight: '900',
    marginVertical: 2,
  },
  reportImage: {
    width: 95,
    height: 95,
  },
  recommendLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  recommendText: {
    color: palette.text,
    fontSize: 12,
  },
  deviceRow: {
    minHeight: 76,
    borderRadius: 14,
    backgroundColor: palette.card,
    borderWidth: 1,
    borderColor: palette.line,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  deviceRowIcon: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deviceRowTitle: {
    color: palette.ink,
    fontWeight: '800',
  },
  switch: {
    width: 46,
    height: 27,
    borderRadius: 999,
    backgroundColor: '#deded8',
    padding: 3,
  },
  switchOn: {
    backgroundColor: palette.green,
  },
  switchKnob: {
    width: 21,
    height: 21,
    borderRadius: 11,
    backgroundColor: '#fff',
  },
  switchKnobOn: {
    marginLeft: 19,
  },
  alertRow: {
    minHeight: 83,
    borderRadius: 16,
    backgroundColor: palette.card,
    borderWidth: 1,
    borderColor: palette.line,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  alertIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  alertTitle: {
    color: palette.ink,
    fontWeight: '800',
  },
  alertLevel: {
    color: palette.muted,
    fontSize: 12,
    marginTop: 2,
  },
  compactAlert: {
    minHeight: 58,
    borderRadius: 13,
    backgroundColor: palette.soft,
    padding: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  compactAlertIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  input: {
    minHeight: 46,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: palette.soft,
    color: palette.ink,
    paddingHorizontal: 12,
  },
  loadingBox: {
    minHeight: 500,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  bottomNav: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    minHeight: 76,
    backgroundColor: palette.card,
    borderTopWidth: 1,
    borderTopColor: palette.line,
    flexDirection: 'row',
    paddingTop: 8,
    paddingBottom: 10,
    paddingHorizontal: 4,
  },
  navItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  navText: {
    color: palette.muted,
    fontSize: 10,
  },
  navTextActive: {
    color: palette.green,
    fontWeight: '800',
  },
});

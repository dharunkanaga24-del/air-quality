// Air Quality Monitor Pro - Core Dashboard Logic
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.4.0/firebase-app.js";
import { getDatabase, ref, onValue, off } from "https://www.gstatic.com/firebasejs/10.4.0/firebase-database.js";
import { ARDUINO_ESP8266_CODE, ARDUINO_ESP32_CODE } from "./arduino-guide.js";

// State Management
const state = {
  mode: 'demo', // 'demo' | 'firebase'
  theme: localStorage.getItem('aqm_theme') || 'dark',
  unit: 'celsius', // 'celsius' | 'fahrenheit'
  alertThreshold: parseInt(localStorage.getItem('aqm_alert_threshold') || '150', 10),
  soundAlertsEnabled: localStorage.getItem('aqm_sound_enabled') === 'true',
  
  currentData: {
    aqi: 38,
    pm25: 9.2,
    pm10: 18.5,
    co2: 450,
    tvoc: 0.12,
    temp: 23.4,
    humidity: 48,
    gasRaw: 220,
    timestamp: Date.now()
  },
  
  history: [],
  selectedTimeRange: '1h', // 'live', '1h', '24h', '7d'
  selectedChartMetric: 'aqi',
  
  firebaseApp: null,
  firebaseDb: null,
  firebaseListener: null,
  firebaseConnected: false,
  
  simInterval: null,
  audioCtx: null
};

// EPA AQI Standard Categories
const AQI_LEVELS = [
  { max: 50, label: 'Good', color: '#10b981', glow: 'rgba(16, 185, 129, 0.3)', adviceTitle: 'Air quality is satisfactory', adviceDesc: 'Air pollution poses little or no risk. Enjoy outdoor activities and ventilate rooms freely.', icon: '🍃' },
  { max: 100, label: 'Moderate', color: '#f59e0b', glow: 'rgba(245, 158, 11, 0.3)', adviceTitle: 'Acceptable air quality', adviceDesc: 'Unusually sensitive individuals should consider limiting prolonged outdoor exertion.', icon: '🌤️' },
  { max: 150, label: 'Sensitive Groups', color: '#f97316', glow: 'rgba(249, 115, 22, 0.3)', adviceTitle: 'Unhealthy for sensitive groups', adviceDesc: 'Children, elderly, and people with respiratory conditions should reduce outdoor exertion.', icon: '⚠️' },
  { max: 200, label: 'Unhealthy', color: '#ef4444', glow: 'rgba(239, 68, 68, 0.3)', adviceTitle: 'Unhealthy air quality', adviceDesc: 'Everyone may experience health effects. Keep windows closed and run air purifiers indoors.', icon: '😷' },
  { max: 300, label: 'Very Unhealthy', color: '#8b5cf6', glow: 'rgba(139, 92, 246, 0.3)', adviceTitle: 'Health alert: serious risk', adviceDesc: 'Avoid all physical outdoor activities. Use N95/FFP2 masks when going outside.', icon: '🛑' },
  { max: Infinity, label: 'Hazardous', color: '#881337', glow: 'rgba(136, 19, 55, 0.4)', adviceTitle: 'Emergency health warning', adviceDesc: 'Entire population is likely to be affected. Stay indoors in a sealed, filtered environment.', icon: '☣️' }
];

// DOM Elements
let chartInstance = null;
const elements = {};

function initDOMRefs() {
  elements.aqiVal = document.getElementById('aqiVal');
  elements.aqiStatusBadge = document.getElementById('aqiStatusBadge');
  elements.gaugeCircle = document.getElementById('gaugeCircle');
  elements.scaleMarker = document.getElementById('scaleMarker');
  elements.healthTitle = document.getElementById('healthTitle');
  elements.healthDesc = document.getElementById('healthDesc');
  elements.healthIcon = document.getElementById('healthIcon');
  elements.statusPill = document.getElementById('statusPill');
  elements.statusText = document.getElementById('statusText');
  
  // Matrix cards
  elements.pm25Val = document.getElementById('pm25Val');
  elements.pm25Bar = document.getElementById('pm25Bar');
  elements.pm10Val = document.getElementById('pm10Val');
  elements.pm10Bar = document.getElementById('pm10Bar');
  elements.co2Val = document.getElementById('co2Val');
  elements.co2Bar = document.getElementById('co2Bar');
  elements.tvocVal = document.getElementById('tvocVal');
  elements.tvocBar = document.getElementById('tvocBar');
  elements.tempVal = document.getElementById('tempVal');
  elements.tempBar = document.getElementById('tempBar');
  elements.humidityVal = document.getElementById('humidityVal');
  elements.humidityBar = document.getElementById('humidityBar');
  
  // Stats summary
  elements.statMin = document.getElementById('statMin');
  elements.statMax = document.getElementById('statMax');
  elements.statAvg = document.getElementById('statAvg');
  elements.statSamples = document.getElementById('statSamples');
  
  // Banner
  elements.alertBanner = document.getElementById('alertBanner');
  elements.alertText = document.getElementById('alertText');
  elements.dismissAlertBtn = document.getElementById('dismissAlertBtn');
  
  // Modals & Controls
  elements.firebaseModal = document.getElementById('firebaseModal');
  elements.hardwareModal = document.getElementById('hardwareModal');
  elements.alertsModal = document.getElementById('alertsModal');
  elements.simulatorDock = document.getElementById('simulatorDock');
  elements.modeToggleBtn = document.getElementById('modeToggleBtn');
  elements.themeToggleBtn = document.getElementById('themeToggleBtn');
}

// AQI Lookup Helper
function getAQICategory(aqi) {
  for (const cat of AQI_LEVELS) {
    if (aqi <= cat.max) return cat;
  }
  return AQI_LEVELS[AQI_LEVELS.length - 1];
}

// Update UI with new telemetry point
function updateDashboardUI(data) {
  const cat = getAQICategory(data.aqi);
  
  // 1. Hero Meter Update
  if (elements.aqiVal) {
    elements.aqiVal.innerText = Math.round(data.aqi);
    elements.aqiVal.style.color = cat.color;
    elements.aqiVal.style.textShadow = `0 0 25px ${cat.glow}`;
  }
  
  if (elements.aqiStatusBadge) {
    elements.aqiStatusBadge.innerText = cat.label;
    elements.aqiStatusBadge.style.color = cat.color;
    elements.aqiStatusBadge.style.background = `${cat.color}22`;
    elements.aqiStatusBadge.style.borderColor = `${cat.color}55`;
  }
  
  if (elements.gaugeCircle) {
    const radius = 100;
    const circumference = 2 * Math.PI * radius; // ~628
    const percent = Math.min(data.aqi / 300, 1.0);
    const offset = circumference - (percent * circumference);
    elements.gaugeCircle.style.strokeDasharray = `${circumference}`;
    elements.gaugeCircle.style.strokeDashoffset = `${offset}`;
    elements.gaugeCircle.style.stroke = cat.color;
    elements.gaugeCircle.style.filter = `drop-shadow(0 0 10px ${cat.color})`;
  }
  
  if (elements.scaleMarker) {
    const markerPercent = Math.min(Math.max((data.aqi / 350) * 100, 0), 100);
    elements.scaleMarker.style.left = `${markerPercent}%`;
  }
  
  // 2. Health Advice
  if (elements.healthTitle) elements.healthTitle.innerText = cat.adviceTitle;
  if (elements.healthDesc) elements.healthDesc.innerText = cat.adviceDesc;
  if (elements.healthIcon) elements.healthIcon.innerText = cat.icon;
  
  // 3. Matrix Parameters
  if (elements.pm25Val) elements.pm25Val.innerText = Number(data.pm25).toFixed(1);
  if (elements.pm25Bar) {
    const pmPercent = Math.min((data.pm25 / 75) * 100, 100);
    elements.pm25Bar.style.width = `${pmPercent}%`;
    elements.pm25Bar.style.backgroundColor = data.pm25 > 35 ? '#ef4444' : data.pm25 > 15 ? '#f59e0b' : '#10b981';
  }
  
  if (elements.pm10Val) elements.pm10Val.innerText = Number(data.pm10).toFixed(1);
  if (elements.pm10Bar) {
    const pm10Percent = Math.min((data.pm10 / 150) * 100, 100);
    elements.pm10Bar.style.width = `${pm10Percent}%`;
    elements.pm10Bar.style.backgroundColor = data.pm10 > 100 ? '#ef4444' : data.pm10 > 50 ? '#f59e0b' : '#10b981';
  }
  
  if (elements.co2Val) elements.co2Val.innerText = Math.round(data.co2);
  if (elements.co2Bar) {
    const co2Percent = Math.min(((data.co2 - 350) / 1650) * 100, 100);
    elements.co2Bar.style.width = `${Math.max(co2Percent, 5)}%`;
    elements.co2Bar.style.backgroundColor = data.co2 > 1200 ? '#ef4444' : data.co2 > 800 ? '#f59e0b' : '#10b981';
  }
  
  if (elements.tvocVal) elements.tvocVal.innerText = Number(data.tvoc).toFixed(2);
  if (elements.tvocBar) {
    const tvocPercent = Math.min((data.tvoc / 1.0) * 100, 100);
    elements.tvocBar.style.width = `${Math.max(tvocPercent, 5)}%`;
    elements.tvocBar.style.backgroundColor = data.tvoc > 0.5 ? '#ef4444' : data.tvoc > 0.22 ? '#f59e0b' : '#10b981';
  }
  
  if (elements.tempVal) {
    const displayTemp = state.unit === 'fahrenheit' ? (data.temp * 9/5 + 32).toFixed(1) : Number(data.temp).toFixed(1);
    elements.tempVal.innerText = displayTemp;
    document.getElementById('tempUnit').innerText = state.unit === 'fahrenheit' ? '°F' : '°C';
  }
  if (elements.tempBar) {
    const tempPercent = Math.min(Math.max(((data.temp - 10) / 30) * 100, 0), 100);
    elements.tempBar.style.width = `${tempPercent}%`;
    elements.tempBar.style.backgroundColor = '#38bdf8';
  }
  
  if (elements.humidityVal) elements.humidityVal.innerText = Math.round(data.humidity);
  if (elements.humidityBar) {
    elements.humidityBar.style.width = `${Math.min(data.humidity, 100)}%`;
    elements.humidityBar.style.backgroundColor = '#06b6d4';
  }
  
  // 4. Alert Checks
  checkAlertThresholds(data);
  
  // 5. Append to history & update chart
  recordHistoryPoint(data);
}

// Sound synthesizer using Web Audio API
function playAlertChime() {
  if (!state.soundAlertsEnabled) return;
  try {
    if (!state.audioCtx) {
      state.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (state.audioCtx.state === 'suspended') {
      state.audioCtx.resume();
    }
    
    const now = state.audioCtx.currentTime;
    const osc = state.audioCtx.createOscillator();
    const gain = state.audioCtx.createGain();
    
    osc.type = 'sine';
    osc.frequency.setValueAtTime(587.33, now); // D5
    osc.frequency.setValueAtTime(880, now + 0.15); // A5
    
    gain.gain.setValueAtTime(0.15, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
    
    osc.connect(gain);
    gain.connect(state.audioCtx.destination);
    
    osc.start(now);
    osc.stop(now + 0.5);
  } catch (e) {
    console.warn("Audio chime disabled or blocked by browser:", e);
  }
}

// Alert verification
let lastAlertPlayed = 0;
function checkAlertThresholds(data) {
  if (data.aqi >= state.alertThreshold) {
    if (elements.alertBanner) {
      elements.alertBanner.classList.remove('hidden');
      elements.alertText.innerText = `Air Quality Alert: AQI is ${Math.round(data.aqi)} (${getAQICategory(data.aqi).label}), exceeding your safety threshold of ${state.alertThreshold}!`;
    }
    
    const now = Date.now();
    if (now - lastAlertPlayed > 15000) { // Beep every 15s max
      playAlertChime();
      lastAlertPlayed = now;
    }
  } else {
    if (elements.alertBanner) {
      elements.alertBanner.classList.add('hidden');
    }
  }
}

// History recording
function recordHistoryPoint(data) {
  state.history.push({
    ...data,
    timestamp: Date.now()
  });
  
  // Retain up to 200 data points in memory
  if (state.history.length > 200) {
    state.history.shift();
  }
  
  updateChartData();
  updateSummaryStats();
}

// Setup Chart.js
function initChart() {
  const ctx = document.getElementById('telemetryChart').getContext('2d');
  
  // Generate initial historical seed data
  const seedNow = Date.now();
  for (let i = 25; i >= 0; i--) {
    const t = seedNow - (i * 3000);
    const noise = Math.sin(i * 0.5) * 8 + (Math.random() * 4 - 2);
    state.history.push({
      aqi: Math.max(20, Math.min(300, 42 + noise)),
      pm25: 10 + noise * 0.3,
      pm10: 20 + noise * 0.6,
      co2: 450 + noise * 10,
      tvoc: 0.12 + (noise * 0.005),
      temp: 23.5,
      humidity: 48,
      timestamp: t
    });
  }
  
  const gradient = ctx.createLinearGradient(0, 0, 0, 260);
  gradient.addColorStop(0, 'rgba(56, 189, 248, 0.35)');
  gradient.addColorStop(1, 'rgba(56, 189, 248, 0.0)');
  
  chartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels: state.history.map(pt => new Date(pt.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })),
      datasets: [{
        label: 'AQI Index',
        data: state.history.map(pt => pt.aqi),
        borderColor: '#38bdf8',
        backgroundColor: gradient,
        borderWidth: 2.5,
        fill: true,
        tension: 0.35,
        pointRadius: 2,
        pointHoverRadius: 6,
        pointBackgroundColor: '#38bdf8'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'index',
        intersect: false
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#1e293b',
          titleColor: '#94a3b8',
          bodyColor: '#f8fafc',
          borderColor: 'rgba(255,255,255,0.1)',
          borderWidth: 1,
          padding: 10,
          displayColors: false
        }
      },
      scales: {
        x: {
          grid: {
            color: 'rgba(255, 255, 255, 0.04)'
          },
          ticks: {
            color: '#64748b',
            maxRotation: 0,
            autoSkip: true,
            maxTicksLimit: 6
          }
        },
        y: {
          grid: {
            color: 'rgba(255, 255, 255, 0.05)'
          },
          ticks: {
            color: '#64748b'
          },
          suggestedMin: 0,
          suggestedMax: 100
        }
      }
    }
  });
  
  updateSummaryStats();
}

function updateChartData() {
  if (!chartInstance) return;
  
  const metric = state.selectedChartMetric;
  const labels = state.history.map(pt => new Date(pt.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
  const data = state.history.map(pt => pt[metric] !== undefined ? Number(pt[metric]) : 0);
  
  const metricConfigs = {
    aqi: { label: 'AQI Index', color: '#38bdf8' },
    pm25: { label: 'PM2.5 (µg/m³)', color: '#10b981' },
    pm10: { label: 'PM10 (µg/m³)', color: '#f59e0b' },
    co2: { label: 'CO2 (ppm)', color: '#f97316' },
    temp: { label: `Temperature (${state.unit === 'fahrenheit' ? '°F' : '°C'})`, color: '#ec4899' },
    humidity: { label: 'Humidity (%)', color: '#06b6d4' }
  };
  
  const config = metricConfigs[metric] || metricConfigs.aqi;
  
  chartInstance.data.labels = labels;
  chartInstance.data.datasets[0].label = config.label;
  chartInstance.data.datasets[0].data = data;
  chartInstance.data.datasets[0].borderColor = config.color;
  chartInstance.data.datasets[0].pointBackgroundColor = config.color;
  
  chartInstance.update('none'); // Update without sluggish layout animation
}

function updateSummaryStats() {
  if (!state.history.length) return;
  const metric = state.selectedChartMetric;
  const values = state.history.map(pt => Number(pt[metric]) || 0);
  
  const min = Math.min(...values);
  const max = Math.max(...values);
  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  
  if (elements.statMin) elements.statMin.innerText = min.toFixed(1);
  if (elements.statMax) elements.statMax.innerText = max.toFixed(1);
  if (elements.statAvg) elements.statAvg.innerText = avg.toFixed(1);
  if (elements.statSamples) elements.statSamples.innerText = values.length;
}

// Simulation Engine
const PRESETS = {
  forest: { aqi: 24, pm25: 5.2, pm10: 11, co2: 410, tvoc: 0.04, temp: 21.5, humidity: 55 },
  urban: { aqi: 68, pm25: 19.8, pm10: 42, co2: 680, tvoc: 0.18, temp: 25.2, humidity: 45 },
  kitchen: { aqi: 145, pm25: 52.4, pm10: 95, co2: 1150, tvoc: 0.65, temp: 28.0, humidity: 62 },
  traffic: { aqi: 185, pm25: 78.0, pm10: 145, co2: 1420, tvoc: 0.88, temp: 26.5, humidity: 40 },
  smog: { aqi: 310, pm25: 165.0, pm10: 290, co2: 1950, tvoc: 1.45, temp: 24.0, humidity: 32 }
};

function startSimulator() {
  if (state.simInterval) clearInterval(state.simInterval);
  
  state.simInterval = setInterval(() => {
    if (state.mode !== 'demo') return;
    
    // Add natural fluctuating drift
    const drift = (Math.random() - 0.48) * 3;
    let newAqi = Math.max(10, Math.min(500, state.currentData.aqi + drift));
    
    state.currentData = {
      aqi: newAqi,
      pm25: Math.max(1, newAqi * 0.38 + (Math.random() * 2 - 1)),
      pm10: Math.max(2, newAqi * 0.72 + (Math.random() * 3 - 1.5)),
      co2: Math.max(380, Math.round(400 + (newAqi * 4.5) + (Math.random() * 20 - 10))),
      tvoc: Math.max(0.01, (newAqi * 0.0035 + (Math.random() * 0.02 - 0.01))),
      temp: +(state.currentData.temp + (Math.random() * 0.2 - 0.1)).toFixed(1),
      humidity: Math.max(20, Math.min(95, Math.round(state.currentData.humidity + (Math.random() * 0.6 - 0.3)))),
      gasRaw: Math.round(newAqi * 3.2),
      timestamp: Date.now()
    };
    
    updateDashboardUI(state.currentData);
  }, 2500);
}

function applyPreset(presetName) {
  const p = PRESETS[presetName];
  if (!p) return;
  
  state.currentData = { ...p, gasRaw: Math.round(p.aqi * 3.2), timestamp: Date.now() };
  
  // Sync sliders
  const aqiSlider = document.getElementById('simAqiSlider');
  if (aqiSlider) aqiSlider.value = p.aqi;
  const tempSlider = document.getElementById('simTempSlider');
  if (tempSlider) tempSlider.value = p.temp;
  const humSlider = document.getElementById('simHumSlider');
  if (humSlider) humSlider.value = p.humidity;
  
  updateDashboardUI(state.currentData);
}

// Firebase Realtime DB Connect
function getStoredFirebaseConfig() {
  const saved = localStorage.getItem('aqm_firebase_config');
  if (saved) {
    try {
      return JSON.parse(saved);
    } catch(e){}
  }
  return {
    apiKey: "",
    authDomain: "",
    databaseURL: "",
    projectId: "",
    storageBucket: "",
    messagingSenderId: "",
    appId: "",
    pathNode: "airQuality"
  };
}

function saveFirebaseConfig(cfg) {
  localStorage.setItem('aqm_firebase_config', JSON.stringify(cfg));
}

function connectFirebase(cfg) {
  if (state.firebaseListener && state.firebaseDb) {
    // detach prior listener
    try {
      const oldRef = ref(state.firebaseDb, cfg.pathNode || 'airQuality');
      off(oldRef);
    } catch(e){}
  }
  
  setStatus('connecting', 'Connecting to Firebase...');
  
  try {
    state.firebaseApp = initializeApp(cfg);
    state.firebaseDb = getDatabase(state.firebaseApp);
    
    const dbPath = cfg.pathNode || 'airQuality';
    const airRef = ref(state.firebaseDb, dbPath);
    
    state.firebaseListener = onValue(airRef, (snapshot) => {
      const val = snapshot.val();
      if (val !== null) {
        state.firebaseConnected = true;
        setStatus('live', `Live Feed (${dbPath})`);
        
        let parsed = {};
        if (typeof val === 'number') {
          parsed = {
            aqi: val,
            pm25: val * 0.35,
            pm10: val * 0.7,
            co2: 400 + val * 4,
            tvoc: val * 0.003,
            temp: 24,
            humidity: 50,
            gasRaw: val,
            timestamp: Date.now()
          };
        } else if (typeof val === 'object') {
          parsed = {
            aqi: val.aqi ?? (val.gas_raw ? Math.round(val.gas_raw / 3) : 50),
            pm25: val.pm25 ?? (val.aqi ? val.aqi * 0.35 : 12),
            pm10: val.pm10 ?? (val.aqi ? val.aqi * 0.7 : 24),
            co2: val.co2 ?? 450,
            tvoc: val.tvoc ?? 0.15,
            temp: val.temperature ?? val.temp ?? 24,
            humidity: val.humidity ?? val.hum ?? 50,
            gasRaw: val.gas_raw ?? val.gas ?? 200,
            timestamp: val.timestamp || Date.now()
          };
        }
        
        state.currentData = parsed;
        updateDashboardUI(state.currentData);
      } else {
        setStatus('offline', 'Path exists but returned null');
      }
    }, (error) => {
      console.error("Firebase DB error:", error);
      setStatus('offline', 'Firebase Auth/Permission Error');
    });
    
  } catch (err) {
    console.error("Firebase init failed:", err);
    setStatus('offline', 'Invalid Configuration');
  }
}

function setStatus(type, message) {
  if (!elements.statusPill || !elements.statusText) return;
  
  elements.statusPill.className = `status-pill ${type}`;
  elements.statusText.innerText = message;
}

// Switch between Demo Mode and Live Firebase
function switchMode(mode) {
  state.mode = mode;
  if (mode === 'demo') {
    setStatus('demo', 'Simulation Mode (Active)');
    if (elements.simulatorDock) elements.simulatorDock.style.display = 'block';
    if (elements.modeToggleBtn) elements.modeToggleBtn.innerHTML = '<span>⚡ Live Firebase</span>';
    startSimulator();
  } else {
    if (elements.simulatorDock) elements.simulatorDock.style.display = 'none';
    if (elements.modeToggleBtn) elements.modeToggleBtn.innerHTML = '<span>🎮 Demo Simulator</span>';
    const cfg = getStoredFirebaseConfig();
    if (!cfg.apiKey || !cfg.databaseURL) {
      openModal(elements.firebaseModal);
      setStatus('connecting', 'Setup Firebase credentials');
    } else {
      connectFirebase(cfg);
    }
  }
}

// Theme handling
function applyTheme(theme) {
  state.theme = theme;
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('aqm_theme', theme);
  if (elements.themeToggleBtn) {
    elements.themeToggleBtn.innerText = theme === 'light' ? '🌙' : '☀️';
  }
}

// Modal Helpers
function openModal(modal) {
  if (modal && typeof modal.showModal === 'function') {
    modal.showModal();
  }
}

function closeModal(modal) {
  if (modal && typeof modal.close === 'function') {
    modal.close();
  }
}

// Export CSV / JSON
function exportData(format = 'csv') {
  if (!state.history.length) return alert("No telemetry points collected yet.");
  
  let content = "";
  let mimeType = "text/plain";
  let fileName = `air_quality_export_${Date.now()}`;
  
  if (format === 'json') {
    content = JSON.stringify(state.history, null, 2);
    mimeType = "application/json";
    fileName += ".json";
  } else {
    const headers = ["Timestamp", "ISO Date", "AQI", "PM2.5", "PM10", "CO2", "TVOC", "Temperature", "Humidity"];
    const rows = state.history.map(pt => [
      pt.timestamp,
      new Date(pt.timestamp).toISOString(),
      pt.aqi,
      pt.pm25,
      pt.pm10,
      pt.co2,
      pt.tvoc,
      pt.temp,
      pt.humidity
    ]);
    content = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    mimeType = "text/csv";
    fileName += ".csv";
  }
  
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

// Event Listeners Setup
function setupEventListeners() {
  // Mode switch
  elements.modeToggleBtn?.addEventListener('click', () => {
    switchMode(state.mode === 'demo' ? 'firebase' : 'demo');
  });
  
  // Theme switch
  elements.themeToggleBtn?.addEventListener('click', () => {
    applyTheme(state.theme === 'dark' ? 'light' : 'dark');
  });
  
  // Metric Selector Chips
  document.querySelectorAll('.metric-chip').forEach(chip => {
    chip.addEventListener('click', (e) => {
      document.querySelectorAll('.metric-chip').forEach(c => c.classList.remove('active'));
      e.target.classList.add('active');
      state.selectedChartMetric = e.target.dataset.metric;
      updateChartData();
      updateSummaryStats();
    });
  });
  
  // Time tabs
  document.querySelectorAll('.chart-tab-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('.chart-tab-btn').forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');
      state.selectedTimeRange = e.target.dataset.range;
    });
  });
  
  // Simulation presets
  document.querySelectorAll('.preset-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      applyPreset(e.target.dataset.preset);
    });
  });
  
  // Simulator sliders
  document.getElementById('simAqiSlider')?.addEventListener('input', (e) => {
    const val = Number(e.target.value);
    state.currentData.aqi = val;
    state.currentData.pm25 = +(val * 0.38).toFixed(1);
    state.currentData.pm10 = +(val * 0.72).toFixed(1);
    state.currentData.co2 = Math.round(400 + val * 4.5);
    state.currentData.tvoc = +(val * 0.0035).toFixed(2);
    updateDashboardUI(state.currentData);
  });
  
  document.getElementById('simTempSlider')?.addEventListener('input', (e) => {
    state.currentData.temp = Number(e.target.value);
    updateDashboardUI(state.currentData);
  });
  
  document.getElementById('simHumSlider')?.addEventListener('input', (e) => {
    state.currentData.humidity = Number(e.target.value);
    updateDashboardUI(state.currentData);
  });
  
  // Temp Unit Toggle
  document.getElementById('tempToggleBtn')?.addEventListener('click', () => {
    state.unit = state.unit === 'celsius' ? 'fahrenheit' : 'celsius';
    updateDashboardUI(state.currentData);
  });
  
  // Firebase Modal Triggers
  document.getElementById('openFirebaseBtn')?.addEventListener('click', () => {
    const cfg = getStoredFirebaseConfig();
    document.getElementById('fbApiKey').value = cfg.apiKey || '';
    document.getElementById('fbAuthDomain').value = cfg.authDomain || '';
    document.getElementById('fbDbUrl').value = cfg.databaseURL || '';
    document.getElementById('fbProjectId').value = cfg.projectId || '';
    document.getElementById('fbStorage').value = cfg.storageBucket || '';
    document.getElementById('fbSenderId').value = cfg.messagingSenderId || '';
    document.getElementById('fbAppId').value = cfg.appId || '';
    document.getElementById('fbPath').value = cfg.pathNode || 'airQuality';
    openModal(elements.firebaseModal);
  });
  
  document.getElementById('closeFirebaseBtn')?.addEventListener('click', () => {
    closeModal(elements.firebaseModal);
  });
  
  document.getElementById('firebaseConfigForm')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const cfg = {
      apiKey: document.getElementById('fbApiKey').value.trim(),
      authDomain: document.getElementById('fbAuthDomain').value.trim(),
      databaseURL: document.getElementById('fbDbUrl').value.trim(),
      projectId: document.getElementById('fbProjectId').value.trim(),
      storageBucket: document.getElementById('fbStorage').value.trim(),
      messagingSenderId: document.getElementById('fbSenderId').value.trim(),
      appId: document.getElementById('fbAppId').value.trim(),
      pathNode: document.getElementById('fbPath').value.trim() || 'airQuality'
    };
    saveFirebaseConfig(cfg);
    closeModal(elements.firebaseModal);
    switchMode('firebase');
  });
  
  // Hardware Modal
  document.getElementById('openHardwareBtn')?.addEventListener('click', () => {
    document.getElementById('esp8266Code').innerText = ARDUINO_ESP8266_CODE;
    document.getElementById('esp32Code').innerText = ARDUINO_ESP32_CODE;
    openModal(elements.hardwareModal);
  });
  
  document.getElementById('closeHardwareBtn')?.addEventListener('click', () => {
    closeModal(elements.hardwareModal);
  });
  
  // Hardware Tabs
  document.querySelectorAll('.hw-tab-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('.hw-tab-btn').forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');
      const target = e.target.dataset.hw;
      document.getElementById('esp8266Section').style.display = target === 'esp8266' ? 'block' : 'none';
      document.getElementById('esp32Section').style.display = target === 'esp32' ? 'block' : 'none';
      document.getElementById('wiringSection').style.display = target === 'wiring' ? 'block' : 'none';
    });
  });
  
  // Alerts Modal
  document.getElementById('openAlertsBtn')?.addEventListener('click', () => {
    document.getElementById('alertThresholdInput').value = state.alertThreshold;
    document.getElementById('soundToggleInput').checked = state.soundAlertsEnabled;
    openModal(elements.alertsModal);
  });
  
  document.getElementById('closeAlertsBtn')?.addEventListener('click', () => {
    closeModal(elements.alertsModal);
  });
  
  document.getElementById('alertsForm')?.addEventListener('submit', (e) => {
    e.preventDefault();
    state.alertThreshold = parseInt(document.getElementById('alertThresholdInput').value, 10) || 150;
    state.soundAlertsEnabled = document.getElementById('soundToggleInput').checked;
    localStorage.setItem('aqm_alert_threshold', state.alertThreshold);
    localStorage.setItem('aqm_sound_enabled', state.soundAlertsEnabled);
    closeModal(elements.alertsModal);
    checkAlertThresholds(state.currentData);
  });
  
  // Test sound button
  document.getElementById('testSoundBtn')?.addEventListener('click', () => {
    state.soundAlertsEnabled = true;
    playAlertChime();
  });
  
  // Export trigger
  document.getElementById('exportCsvBtn')?.addEventListener('click', () => exportData('csv'));
  document.getElementById('exportJsonBtn')?.addEventListener('click', () => exportData('json'));
  
  // Dismiss banner
  elements.dismissAlertBtn?.addEventListener('click', () => {
    elements.alertBanner?.classList.add('hidden');
  });
  
  // Copy Code Buttons
  document.querySelectorAll('.copy-code-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const targetId = e.target.dataset.target;
      const code = document.getElementById(targetId)?.innerText;
      if (code) {
        navigator.clipboard.writeText(code);
        const original = e.target.innerText;
        e.target.innerText = 'Copied!';
        setTimeout(() => e.target.innerText = original, 2000);
      }
    });
  });
}

// Initial Bootstrapping
window.addEventListener('DOMContentLoaded', () => {
  initDOMRefs();
  applyTheme(state.theme);
  setupEventListeners();
  initChart();
  updateDashboardUI(state.currentData);
  startSimulator();
});

# 🍃 AeroPulse — Realtime Air Quality Monitor & IoT Telemetry Dashboard

A modern, responsive, glassmorphic Air Quality Telemetry & IoT Dashboard powered by **Firebase Realtime Database** with support for **ESP8266**, **ESP32**, **MQ-135**, **DHT22**, and **PMS5003** sensors.

---

## ✨ Features

- 🟢 **Live Radial AQI Gauge**: Real-time animated circular gauge reflecting EPA AQI categories (Good, Moderate, Sensitive, Unhealthy, Very Unhealthy, Hazardous) with dynamic color glow and status indicators.
- 🌫️ **Multi-Pollutant Sensor Matrix**:
  - **PM2.5** (Fine Particulate Matter, µg/m³) with WHO safety limit comparison.
  - **PM10** (Coarse Particulate, µg/m³).
  - **CO₂** (Carbon Dioxide, ppm) with room ventilation indicator.
  - **TVOC / MQ-135** (Total Volatile Organic Compounds / Raw Gas Sensor ADC).
  - **Temperature** (°C / °F toggleable) & **Relative Humidity** (% RH).
- 📈 **Realtime Telemetry Charts**: Interactive Chart.js graph tracking live trends, 1-hour rolling metrics, 24-hour patterns, and summary statistics (Min, Max, Mean).
- 🎮 **Interactive Atmosphere Simulator**: Built-in simulator with 5 presets (*Forest Clean*, *Urban Normal*, *Cooking Smoke*, *Heavy Traffic*, *Wildfire Smog*) and manual slider controls to test the UI without hardware connected.
- 🔔 **Hazard Alert System**: Configurable alert thresholds with top warning banner and synthesized Web Audio chime.
- 🛠️ **Built-in Firmware & Wiring Hub**: One-click copy-paste Arduino C++ sketches for ESP8266 and ESP32 with wiring schematics.
- 💾 **Data Export**: One-click download of telemetry history in **CSV** or **JSON** format.
- 🌗 **Dark / Light Glassmorphic Theme**: Stored in LocalStorage with smooth transitions.

---

## 🚀 Quick Start

### 1. Run Locally
Open `index.html` directly in any modern browser, or run a local web server:

```bash
# Using npx serve
npx serve .

# Or using Python 3
python -m http.server 8000
```

Then navigate to `http://localhost:3000` or `http://localhost:8000`.

---

## ⚙️ Connecting to Firebase Realtime Database

1. Click the **Gear (Settings)** icon in the top navigation bar.
2. Enter your Firebase project credentials:
   - **API Key**
   - **Project ID**
   - **Database URL** (e.g., `https://your-project-default-rtdb.firebaseio.com`)
   - **Database Path Node** (Default: `airQuality`)
3. Click **Save & Connect Feed**.

### Data Format Supported:
The dashboard supports both simple number values and structured JSON payloads:

#### Option A: Simple Single Value
```json
{
  "airQuality": 48
}
```

#### Option B: Full Multi-Sensor JSON Payload (Recommended)
```json
{
  "airQuality": {
    "aqi": 52,
    "pm25": 14.2,
    "pm10": 28.6,
    "co2": 520,
    "tvoc": 0.16,
    "temperature": 24.2,
    "humidity": 52.0,
    "gas_raw": 240,
    "timestamp": 1727367600000
  }
}
```

---

## 🛠️ Microcontroller Firmware (ESP8266 / ESP32)

Open the **Microchip (Hardware Guide)** modal in the dashboard to copy the ready-to-flash sketches.

### Required Arduino Libraries:
1. `Firebase ESP Client` by Mobizt
2. `DHT sensor library` by Adafruit

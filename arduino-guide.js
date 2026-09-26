// Arduino & ESP32 Code Templates and Wiring Instructions

export const ARDUINO_ESP8266_CODE = `/*
  Air Quality Monitor - ESP8266 & MQ-135 / DHT22 to Firebase Realtime Database
  Libraries needed:
  1. Firebase ESP Client by Mobizt
  2. DHT sensor library by Adafruit
*/

#include <ESP8266WiFi.h>
#include <Firebase_ESP_Client.h>
#include <DHT.h>

// Wi-Fi Credentials
#define WIFI_SSID "YOUR_WIFI_SSID"
#define WIFI_PASSWORD "YOUR_WIFI_PASSWORD"

// Firebase Project Credentials
#define API_KEY "YOUR_FIREBASE_API_KEY"
#define DATABASE_URL "https://YOUR_PROJECT_ID.firebaseio.com"

// Pin Definitions
#define MQ135_PIN A0
#define DHTPIN D4
#define DHTTYPE DHT22   // or DHT11

DHT dht(DHTPIN, DHTTYPE);

FirebaseData fbdo;
FirebaseAuth auth;
FirebaseConfig config;

unsigned long lastSendTime = 0;
const unsigned long sendInterval = 3000; // Send telemetry every 3 seconds

void setup() {
  Serial.begin(115200);
  dht.begin();

  // Connect to Wi-Fi
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.print("Connecting to Wi-Fi");
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\\nConnected to Wi-Fi: " + WiFi.localIP().toString());

  // Setup Firebase
  config.api_key = API_KEY;
  config.database_url = DATABASE_URL;
  config.signer.test_mode = true; // Use true if no user auth is needed

  Firebase.begin(&config, &auth);
  Firebase.reconnectWiFi(true);
}

void loop() {
  if (millis() - lastSendTime > sendInterval) {
    lastSendTime = millis();

    int rawGas = analogRead(MQ135_PIN);
    float humidity = dht.readHumidity();
    float temperature = dht.readTemperature();

    // Basic calculation / scaling for demonstration
    // Calibrate baseline according to your sensor datasheet
    int aqiEstimate = map(rawGas, 100, 800, 20, 300);
    aqiEstimate = constrain(aqiEstimate, 10, 500);

    float pm25Estimate = (aqiEstimate * 0.35);
    int co2Estimate = map(rawGas, 150, 900, 400, 2000);

    FirebaseJson json;
    json.set("aqi", aqiEstimate);
    json.set("gas_raw", rawGas);
    json.set("co2", co2Estimate);
    json.set("pm25", pm25Estimate);
    json.set("temperature", isnan(temperature) ? 25.0 : temperature);
    json.set("humidity", isnan(humidity) ? 50.0 : humidity);
    json.set("timestamp", (double)millis());

    // You can also write a single number if your frontend listens to 'airQuality'
    // Firebase.RTDB.setInt(&fbdo, "/airQuality", aqiEstimate);

    // Or write the comprehensive JSON node:
    if (Firebase.RTDB.setJSON(&fbdo, "/airQuality", &json)) {
      Serial.printf("Telemetry sent! AQI: %d, Gas: %d\\n", aqiEstimate, rawGas);
    } else {
      Serial.println("Firebase Error: " + fbdo.errorReason());
    }
  }
}
`;

export const ARDUINO_ESP32_CODE = `/*
  Air Quality Monitor - ESP32 Multi-Sensor (MQ-135 + DHT22 / PMS5003)
  Libraries: Firebase ESP Client by Mobizt, DHT sensor library
*/

#include <WiFi.h>
#include <Firebase_ESP_Client.h>
#include <DHT.h>

#define WIFI_SSID "YOUR_WIFI_SSID"
#define WIFI_PASSWORD "YOUR_WIFI_PASSWORD"

#define API_KEY "YOUR_FIREBASE_API_KEY"
#define DATABASE_URL "https://YOUR_PROJECT_ID.firebaseio.com"

#define MQ135_PIN 34    // ADC1 Pin on ESP32
#define DHTPIN 4
#define DHTTYPE DHT22

DHT dht(DHTPIN, DHTTYPE);

FirebaseData fbdo;
FirebaseAuth auth;
FirebaseConfig config;
unsigned long lastSend = 0;

void setup() {
  Serial.begin(115200);
  dht.begin();
  analogReadResolution(12); // ESP32 12-bit ADC (0 - 4095)

  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\\nWiFi Connected!");

  config.api_key = API_KEY;
  config.database_url = DATABASE_URL;
  config.signer.test_mode = true;

  Firebase.begin(&config, &auth);
  Firebase.reconnectWiFi(true);
}

void loop() {
  if (millis() - lastSend > 3000) {
    lastSend = millis();

    int rawAdc = analogRead(MQ135_PIN);
    float temp = dht.readTemperature();
    float hum = dht.readHumidity();

    // Map 12-bit ADC to AQI
    int aqi = map(rawAdc, 400, 3200, 25, 450);
    aqi = constrain(aqi, 15, 500);

    FirebaseJson json;
    json.set("aqi", aqi);
    json.set("gas_raw", rawAdc);
    json.set("pm25", (float)(aqi * 0.42));
    json.set("pm10", (float)(aqi * 0.78));
    json.set("co2", map(rawAdc, 400, 3000, 420, 2200));
    json.set("tvoc", (float)(rawAdc * 0.00045));
    json.set("temperature", isnan(temp) ? 24.0 : temp);
    json.set("humidity", isnan(hum) ? 55.0 : hum);

    if (Firebase.RTDB.setJSON(&fbdo, "/airQuality", &json)) {
      Serial.println("Data updated in Firebase Realtime DB!");
    } else {
      Serial.println("Error: " + fbdo.errorReason());
    }
  }
}
`;

/*
  ============================================================
                    JARVIS ESP32 CONTROLLER
  ============================================================

  Board       : ESP32 DevKit V1 / ESP32-WROOM-32
  Device ID   : ESP32-001
  Relay 1-4   : GPIO 13, 12, 14, 15
  Relay Logic : ACTIVE LOW

  NVS:
    Namespace : jarvis
    Key       : deviceToken

  Features:
    - HTTPS API communication
    - HTTP keep-alive / connection reuse
    - Fast command polling
    - Relay command execution
    - Command ACK
    - Duplicate command protection
    - Boot status synchronization
    - WiFi reconnect
    - NTP synchronization
    - INMP441 I2S microphone capture + Serial RMS level monitor

  SAFETY:
    Keep 220V mains disconnected during testing.
  ============================================================
*/

#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <Preferences.h>
#include <ArduinoJson.h>
#include <time.h>
#include <math.h>
#include "driver/i2s.h"

// ============================================================
// 1. WIFI CONFIGURATION
// ============================================================

const char* WIFI_SSID = "YOUR_WIFI_NAME";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";

// ============================================================
// 2. SERVER CONFIGURATION
// ============================================================

const char* SERVER_BASE =
  "https://jarvis-puce-psi.vercel.app";

const char* DEVICE_ID = "ESP32-001";

const char* FIRMWARE_VERSION = "1.3.0";

// ============================================================
// 3. RELAY CONFIGURATION
// ============================================================

// Current physical wiring supplied by the user.
// WARNING: GPIO12 and GPIO15 are ESP32 boot-strapping pins.
// If boot becomes unreliable, move IN2 to GPIO26 and IN4 to GPIO27,
// then change this array to {13, 26, 14, 27}.
constexpr uint8_t RELAY_COUNT = 4;
const uint8_t RELAY_PINS[RELAY_COUNT] = {
  13, 12, 14, 15
};

constexpr uint8_t RELAY_ON = LOW;
constexpr uint8_t RELAY_OFF = HIGH;

bool relayStates[RELAY_COUNT] = {
  false, false, false, false
};

// ============================================================
// 3A. INMP441 MICROPHONE CONFIGURATION
// ============================================================
// INMP441 wiring:
// VDD -> 3V3, GND -> GND
// SCK/BCLK -> GPIO26, WS/LRCLK -> GPIO25
// SD/DOUT -> GPIO33, L/R -> GND (LEFT channel)
//
// This firmware captures 8 kHz mono PCM16 WAV and uploads it to
// POST /api/esp32/voice. Assistant execution requires a spoken PIN.
constexpr i2s_port_t MIC_I2S_PORT = I2S_NUM_0;
constexpr int MIC_BCLK_PIN = 26;
constexpr int MIC_WS_PIN = 25;
constexpr int MIC_DATA_PIN = 33;
constexpr uint32_t MIC_SAMPLE_RATE = 8000;
constexpr size_t MIC_BUFFER_SAMPLES = 256;
constexpr uint32_t MIC_REPORT_INTERVAL_MS = 500;
// Noise gate: require several consecutive loud I2S blocks, not one transient spike.
constexpr uint32_t MIC_VOICE_THRESHOLD = 450; // Initial value; tune using quiet-room RMS logs
constexpr uint8_t MIC_VOICE_REQUIRED_CHUNKS = 3;
constexpr uint32_t MIC_RECORD_SECONDS = 3;
constexpr size_t MIC_RECORD_SAMPLES = MIC_SAMPLE_RATE * MIC_RECORD_SECONDS;
constexpr size_t MIC_PRE_ROLL_SAMPLES = MIC_SAMPLE_RATE / 2; // 500 ms
constexpr uint32_t MIC_UPLOAD_COOLDOWN_MS = 30000;

int32_t micRawBuffer[MIC_BUFFER_SAMPLES];
int16_t micPreRollBuffer[MIC_PRE_ROLL_SAMPLES];
size_t micPreRollWriteIndex = 0;
size_t micPreRollCount = 0;
uint8_t micVoiceConsecutiveChunks = 0;
uint8_t micWavBuffer[44 + MIC_RECORD_SAMPLES * 2];
bool micReady = false;
bool micUploadInProgress = false;
unsigned long lastMicReportMs = 0;
unsigned long lastVoiceUploadMs = 0;
uint32_t micLastLevel = 0;


// ============================================================
// 4. TIMING CONFIGURATION
// ============================================================

constexpr unsigned long COMMAND_POLL_INTERVAL_MS = 500;
constexpr unsigned long HEARTBEAT_INTERVAL_MS = 30000;

constexpr unsigned long WIFI_RETRY_INTERVAL_MS = 5000;
constexpr unsigned long NTP_RETRY_INTERVAL_MS = 15000;

constexpr uint32_t HTTP_TIMEOUT_MS = 5000;
constexpr uint32_t HTTP_CONNECT_TIMEOUT_MS = 4000;

// ============================================================
// 5. GLOBAL TIMERS
// ============================================================

unsigned long lastCommandPollMs = 0;
unsigned long lastHeartbeatMs = 0;
unsigned long lastWiFiAttemptMs = 0;
unsigned long lastNtpAttemptMs = 0;
unsigned long lastHealthCheckMs = 0;

bool clockSynced = false;
bool httpsReady = false;
bool bootStatusSynced = false;

// ============================================================
// 6. GLOBAL NETWORK OBJECTS
// ============================================================

// Reuse the same secure client and HTTP client.
// This avoids unnecessary repeated connection setup.

WiFiClientSecure secureClient;
HTTPClient http;

Preferences preferences;

String deviceToken = "";

// ============================================================
// 7. DUPLICATE COMMAND CACHE
// ============================================================

constexpr uint8_t COMMAND_CACHE_SIZE = 16;

struct ProcessedCommand {
  String commandId;
  String reportedState;
  bool valid;
};

ProcessedCommand commandCache[COMMAND_CACHE_SIZE];

uint8_t commandCacheIndex = 0;

// ============================================================
// 8. ROOT CA CERTIFICATE - GOOGLE TRUST SERVICES ROOT R1
// ============================================================

const char* ROOT_CA = R"EOF(
-----BEGIN CERTIFICATE-----
MIIFVzCCAz+gAwIBAgINAgPlk28xsBNJiGuiFzANBgkqhkiG9w0BAQwFADBHMQsw
CQYDVQQGEwJVUzEiMCAGA1UEChMZR29vZ2xlIFRydXN0IFNlcnZpY2VzIExMQzEU
MBIGA1UEAxMLR1RTIFJvb3QgUjEwHhcNMTYwNjIyMDAwMDAwWhcNMzYwNjIyMDAw
MDAwWjBHMQswCQYDVQQGEwJVUzEiMCAGA1UEChMZR29vZ2xlIFRydXN0IFNlcnZp
Y2VzIExMQzEUMBIGA1UEAxMLR1RTIFJvb3QgUjEwggIiMA0GCSqGSIb3DQEBAQUA
A4ICDwAwggIKAoICAQC2EQKLHuOhd5s73L+UPreVp0A8of2C+X0yBoJx9vaMf/vo
27xqLpeXo4xL+Sv2sfnOhB2x+cWX3u+58qPpvBKJXqeqUqv4IyfLpLGcY9vXmX7w
Cl7raKb0xlpHDU0QM+NOsROjyBhsS+z8CZDfnWQpJSMHobTSPS5g4M/SCYe7zUjw
TcLCeoiKu7rPWRnWr4+wB7CeMfGCwcDfLqZtbBkOtdh+JhpFAz2weaSUKK0Pfybl
qAj+lug8aJRT7oM6iCsVlgmy4HqMLnXWnOunVmSPlk9orj2XwoSPwLxAwAtcvfaH
szVsrBhQf4TgTM2S0yDpM7xSma8ytSmzJSq0SPly4cpk9+aCEI3oncKKiPo4Zor8
Y/kB+Xj9e1x3+naH+uzfsQ55lVe0vSbv1gHR6xYKu44LtcXFilWr06zqkUspzBmk
MiVOKvFlRNACzqrOSbTqn3yDsEB750Orp2yjj32JgfpMpf/VjsPOS+C12LOORc92
wO1AK/1TD7Cn1TsNsYqiA94xrcx36m97PtbfkSIS5r762DL8EGMUUXLeXdYWk70p
aDPvOmbsB4om3xPXV2V4J95eSRQAogB/mqghtqmxlbCluQ0WEdrHbEg8QOB+DVrN
VjzRlwW5y0vtOUucxD/SVRNuJLDWcfr0wbrM7Rv1/oFB2ACYPTrIrnqYNxgFlQID
AQABo0IwQDAOBgNVHQ8BAf8EBAMCAYYwDwYDVR0TAQH/BAUwAwEB/zAdBgNVHQ4E
FgQU5K8rJnEaK0gnhS9SZizv8IkTcT4wDQYJKoZIhvcNAQEMBQADggIBAJ+qQibb
C5u+/x6Wki4+omVKapi6Ist9wTrYggoGxval3sBOh2Z5ofmmWJyq+bXmYOfg6LEe
QkEzCzc9zolwFcq1JKjPa7XSQCGYzyI0zzvFIoTgxQ6KfF2I5DUkzps+GlQebtuy
h6f88/qBVRRiClmpIgUxPoLW7ttXNLwzldMXG+gnoot7TiYaelpkttGsN/H9oPM4
7HLwEXWdyzRSjeZ2axfG34arJ45JK3VmgRAhpuo+9K4l/3wV3s6MJT/KYnAK9y8J
ZgfIPxz88NtFMN9iiMG1D53Dn0reWVlHxYciNuaCp+0KueIHoI17eko8cdLiA6Ef
MgfdG+RCzgwARWGAtQsgWSl4vflVy2PFPEz0tv/bal8xa5meLMFrUKTX5hgUvYU/
Z6tGn6D/Qqc6f1zLXbBwHSs09dR2CQzreExZBfMzQsNhFRAbd03OIozUhfJFfbdT
6u9AWpQKXCBfTkBdYiJ23//OYb2MI3jSNwLgjt7RETeJ9r/tSQdirpLsQBqvFAnZ
0E6yove+7u7Y/9waLd64NnHi/Hm3lCXRSHNboTXns5lndcEZOitHTtNCjv0xyBZm
2tIMPNuzjsmhDYAPexZ3FL//2wmUspO8IFgV6dtxQ/PeEMMA3KgqlbbC1j+Qa3bb
bP6MvPJwNQzcmRk13NfIRmPVNnGuV/u3gm3c
-----END CERTIFICATE-----
)EOF";

// ============================================================
// 9. FUNCTION DECLARATIONS
// ============================================================

bool initializeMicrophone();

void processMicrophone();
bool captureAndUploadVoice();
void writeWavHeader(uint8_t* header, uint32_t dataSize);
void writeLe16(uint8_t* target, uint16_t value);
void writeLe32(uint8_t* target, uint32_t value);

bool loadDeviceToken();

void initializeRelays();

bool connectWiFi(unsigned long timeoutMs);

void maintainWiFi();

bool syncClock();

void maintainClock();

String currentUtcTime();

int sendRequest(
  const String& path,
  const String& method,
  const String& body,
  String& response
);

bool testHttpsHealth();

void sendHeartbeat();

bool sendBootStatus();

void pollCommands();

void executeCommand(
  const String& commandId,
  int relayNumber,
  String action
);

bool sendAcknowledgement(
  const String& commandId,
  const String& reportedState,
  int relayNumber
);

bool sendFailedAcknowledgement(
  const String& commandId,
  int relayNumber,
  const String& reason
);

int findProcessedCommand(const String& commandId);

void rememberProcessedCommand(
  const String& commandId,
  const String& state
);

// ============================================================
// 9A. INMP441 MICROPHONE INITIALIZATION & CAPTURE
// ============================================================

bool initializeMicrophone() {
  i2s_config_t config = {};
  config.mode = (i2s_mode_t)(I2S_MODE_MASTER | I2S_MODE_RX);
  config.sample_rate = MIC_SAMPLE_RATE;
  config.bits_per_sample = I2S_BITS_PER_SAMPLE_32BIT;
  config.channel_format = I2S_CHANNEL_FMT_ONLY_LEFT;
  config.communication_format = I2S_COMM_FORMAT_STAND_I2S;
  config.intr_alloc_flags = 0;
  config.dma_buf_count = 8;
  config.dma_buf_len = MIC_BUFFER_SAMPLES;
  config.use_apll = false;
  config.tx_desc_auto_clear = false;
  config.fixed_mclk = 0;

  i2s_pin_config_t pins = {};
  pins.bck_io_num = MIC_BCLK_PIN;
  pins.ws_io_num = MIC_WS_PIN;
  pins.data_out_num = I2S_PIN_NO_CHANGE;
  pins.data_in_num = MIC_DATA_PIN;

  esp_err_t result = i2s_driver_install(MIC_I2S_PORT, &config, 0, nullptr);
  if (result != ESP_OK && result != ESP_ERR_INVALID_STATE) {
    Serial.printf("[MIC] I2S driver install failed: %d\n", result);
    return false;
  }

  result = i2s_set_pin(MIC_I2S_PORT, &pins);
  if (result != ESP_OK) {
    Serial.printf("[MIC] I2S pin setup failed: %d\n", result);
    return false;
  }

  i2s_zero_dma_buffer(MIC_I2S_PORT);
  Serial.println("[MIC] INMP441 initialized (8kHz, 32-bit, LEFT)");
  return true;
}

void processMicrophone() {
  if (!micReady || micUploadInProgress) return;

  size_t bytesRead = 0;
  esp_err_t result = i2s_read(
    MIC_I2S_PORT,
    micRawBuffer,
    sizeof(micRawBuffer),
    &bytesRead,
    0
  );

  if (result != ESP_OK || bytesRead < sizeof(int32_t)) return;

  const size_t samplesRead = bytesRead / sizeof(int32_t);
  uint64_t sumSquares = 0;

  for (size_t i = 0; i < samplesRead; i++) {
    // INMP441 24-bit audio is carried in a 32-bit I2S slot.
    int32_t levelSample = micRawBuffer[i] >> 14;
    int64_t value = levelSample;
    sumSquares += (uint64_t)(value * value);

    // Keep the latest 500 ms so speech onset is not discarded while
    // the sustained-noise gate confirms that this is not a single spike.
    int16_t pcm = (int16_t)(micRawBuffer[i] >> 16);
    micPreRollBuffer[micPreRollWriteIndex] = pcm;
    micPreRollWriteIndex = (micPreRollWriteIndex + 1) % MIC_PRE_ROLL_SAMPLES;
    if (micPreRollCount < MIC_PRE_ROLL_SAMPLES) micPreRollCount++;
  }

  uint32_t rms = (uint32_t)sqrt((double)sumSquares / samplesRead);
  micLastLevel = rms;

  if (millis() - lastMicReportMs >= MIC_REPORT_INTERVAL_MS) {
    lastMicReportMs = millis();
    Serial.print("[MIC] RMS level: ");
    Serial.print(rms);
    Serial.print(" | ");
    Serial.println(rms >= MIC_VOICE_THRESHOLD ? "LOUD" : "quiet");
  }

  if (rms >= MIC_VOICE_THRESHOLD) {
    if (micVoiceConsecutiveChunks < MIC_VOICE_REQUIRED_CHUNKS) {
      micVoiceConsecutiveChunks++;
    }
  } else {
    micVoiceConsecutiveChunks = 0;
  }

  // This is a sustained sound gate, not true Jarvis wake-word recognition.
  if (
    micVoiceConsecutiveChunks >= MIC_VOICE_REQUIRED_CHUNKS &&
    !micUploadInProgress &&
    millis() - lastVoiceUploadMs >= MIC_UPLOAD_COOLDOWN_MS
  ) {
    micVoiceConsecutiveChunks = 0;
    lastVoiceUploadMs = millis();
    if (WiFi.status() == WL_CONNECTED && clockSynced && httpsReady) {
      captureAndUploadVoice();
    } else {
      Serial.println("[VOICE] Sound detected, but network is not ready");
    }
  }
}

// ============================================================
// 9B. WAV ENCODING + GEMINI TRANSCRIPTION UPLOAD
// ============================================================

void writeLe16(uint8_t* target, uint16_t value) {
  target[0] = value & 0xFF;
  target[1] = (value >> 8) & 0xFF;
}

void writeLe32(uint8_t* target, uint32_t value) {
  target[0] = value & 0xFF;
  target[1] = (value >> 8) & 0xFF;
  target[2] = (value >> 16) & 0xFF;
  target[3] = (value >> 24) & 0xFF;
}

void writeWavHeader(uint8_t* header, uint32_t dataSize) {
  memcpy(header, "RIFF", 4);
  writeLe32(header + 4, 36 + dataSize);
  memcpy(header + 8, "WAVE", 4);
  memcpy(header + 12, "fmt ", 4);
  writeLe32(header + 16, 16);
  writeLe16(header + 20, 1);
  writeLe16(header + 22, 1);
  writeLe32(header + 24, MIC_SAMPLE_RATE);
  writeLe32(header + 28, MIC_SAMPLE_RATE * 2);
  writeLe16(header + 32, 2);
  writeLe16(header + 34, 16);
  memcpy(header + 36, "data", 4);
  writeLe32(header + 40, dataSize);
}

bool captureAndUploadVoice() {
  if (!micReady || micUploadInProgress) return false;
  micUploadInProgress = true;

  Serial.println("[VOICE] Capturing 3-second audio (500ms pre-roll included)...");
  const size_t targetBytes = MIC_RECORD_SAMPLES * sizeof(int16_t);

  // Copy pre-roll oldest-to-newest so the first spoken syllable is retained.
  size_t preRollSamples = micPreRollCount;
  size_t oldestIndex =
    (micPreRollWriteIndex + MIC_PRE_ROLL_SAMPLES - preRollSamples) %
    MIC_PRE_ROLL_SAMPLES;
  size_t writtenSamples = 0;

  for (size_t i = 0; i < preRollSamples && writtenSamples < MIC_RECORD_SAMPLES; i++) {
    int16_t pcm = micPreRollBuffer[(oldestIndex + i) % MIC_PRE_ROLL_SAMPLES];
    size_t offset = 44 + writtenSamples * 2;
    micWavBuffer[offset] = (uint16_t)pcm & 0xFF;
    micWavBuffer[offset + 1] = ((uint16_t)pcm >> 8) & 0xFF;
    writtenSamples++;
  }

  const unsigned long captureStarted = millis();
  while (writtenSamples < MIC_RECORD_SAMPLES &&
         millis() - captureStarted < 6000) {
    size_t bytesRead = 0;
    esp_err_t result = i2s_read(
      MIC_I2S_PORT,
      micRawBuffer,
      sizeof(micRawBuffer),
      &bytesRead,
      pdMS_TO_TICKS(500)
    );

    if (result != ESP_OK || bytesRead < sizeof(int32_t)) continue;

    size_t count = bytesRead / sizeof(int32_t);
    for (size_t i = 0; i < count && writtenSamples < MIC_RECORD_SAMPLES; i++) {
      // Convert the INMP441's left-aligned 24-bit sample to signed PCM16.
      int16_t pcm = (int16_t)(micRawBuffer[i] >> 16);
      size_t offset = 44 + writtenSamples * 2;
      micWavBuffer[offset] = (uint16_t)pcm & 0xFF;
      micWavBuffer[offset + 1] = ((uint16_t)pcm >> 8) & 0xFF;
      writtenSamples++;
    }
  }

  if (writtenSamples != MIC_RECORD_SAMPLES) {
    Serial.printf("[VOICE] Capture incomplete: %u/%u samples\n",
                  (unsigned)writtenSamples, (unsigned)MIC_RECORD_SAMPLES);
    micUploadInProgress = false;
    return false;
  }

  writeWavHeader(micWavBuffer, targetBytes);

  String url = String(SERVER_BASE) + "/api/esp32/voice";
  http.setReuse(false);
  http.setTimeout(25000);
  http.setConnectTimeout(8000);

  if (!http.begin(secureClient, url)) {
    Serial.println("[VOICE] HTTPS begin failed");
    micUploadInProgress = false;
    return false;
  }

  http.addHeader("X-Device-Id", DEVICE_ID);
  http.addHeader("Authorization", String("Bearer ") + deviceToken);
  http.addHeader("Content-Type", "audio/wav");
  http.addHeader("Accept", "application/json");

  Serial.printf("[VOICE] Uploading WAV: %u bytes\n",
                (unsigned)(44 + targetBytes));
  int code = http.POST(micWavBuffer, 44 + targetBytes);
  String response = code > 0 ? http.getString() : "";
  http.end();

  Serial.printf("[VOICE] HTTP status: %d\n", code);

  if (code >= 200 && code < 300) {
    StaticJsonDocument<2048> doc;
    DeserializationError error = deserializeJson(doc, response);
    if (!error && doc["success"] == true) {
      const char* transcript = doc["data"]["transcript"] | "";
      const char* execution = doc["data"]["execution"] | "not_executed";
      const char* reason = doc["data"]["reason"] | "";
      const char* reply = doc["data"]["reply"] | "";
      if (transcript[0] != '\0') {
        Serial.print("[VOICE] Transcript: ");
        Serial.println(transcript);
      } else {
        Serial.println("[VOICE] No intelligible speech detected");
      }
      Serial.print("[VOICE] Execution: ");
      Serial.println(execution);
      if (reason[0] != '\0') {
        Serial.print("[VOICE] Reason: ");
        Serial.println(reason);
      }
      if (reply[0] != '\0') {
        Serial.print("[JARVIS] ");
        Serial.println(reply);
      }
    } else {
      Serial.println("[VOICE] Could not parse transcription response");
      Serial.println(response);
    }
  } else {
    Serial.println("[VOICE] Upload/transcription failed");
    if (response.length()) Serial.println(response);
  }

  micUploadInProgress = false;
  return code >= 200 && code < 300;
}

// ============================================================
// 10. RELAY INITIALIZATION
// ============================================================

void initializeRelays() {
  // Initialize all four relay channels to OFF before network startup.
  for (uint8_t i = 0; i < RELAY_COUNT; i++) {
    // Preload OFF level before enabling OUTPUT mode.
    digitalWrite(RELAY_PINS[i], RELAY_OFF);
    pinMode(RELAY_PINS[i], OUTPUT);
    digitalWrite(RELAY_PINS[i], RELAY_OFF);

    relayStates[i] = false;

    Serial.print("[RELAY] Relay ");
    Serial.print(i + 1);
    Serial.print(" (GPIO ");
    Serial.print(RELAY_PINS[i]);
    Serial.println(") initialized OFF");
  }
}

// ============================================================
// 11. LOAD DEVICE TOKEN
// ============================================================

bool loadDeviceToken() {

  if (!preferences.begin("jarvis", true)) {

    Serial.println("[AUTH] NVS open failed");

    return false;
  }

  deviceToken =
    preferences.getString("deviceToken", "");

  preferences.end();

  if (deviceToken.length() == 0) {

    Serial.println("[AUTH] Device token missing");

    return false;
  }

  Serial.println("[AUTH] Device token loaded");

  return true;
}

// ============================================================
// 12. WIFI CONNECTION
// ============================================================

bool connectWiFi(unsigned long timeoutMs) {

  if (WiFi.status() == WL_CONNECTED) {
    return true;
  }

  Serial.println("[WIFI] Connecting...");

  WiFi.mode(WIFI_STA);

  WiFi.setSleep(false);

  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  unsigned long startedAt = millis();

  while (
    WiFi.status() != WL_CONNECTED &&
    millis() - startedAt < timeoutMs
  ) {

    delay(250);

    Serial.print(".");
  }

  Serial.println();

  if (WiFi.status() != WL_CONNECTED) {

    Serial.println("[WIFI] Connection failed");

    return false;
  }

  Serial.println("[WIFI] Connected");

  Serial.print("[WIFI] IP: ");
  Serial.println(WiFi.localIP());

  Serial.print("[WIFI] RSSI: ");
  Serial.print(WiFi.RSSI());
  Serial.println(" dBm");

  return true;
}

// ============================================================
// 13. WIFI RECONNECTION
// ============================================================

void maintainWiFi() {

  if (WiFi.status() == WL_CONNECTED) {
    return;
  }

  if (
    millis() - lastWiFiAttemptMs <
    WIFI_RETRY_INTERVAL_MS
  ) {
    return;
  }

  lastWiFiAttemptMs = millis();

  Serial.println("[WIFI] Reconnecting...");

  WiFi.disconnect();

  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  // Force a fresh HTTPS connection after reconnect.

  httpsReady = false;

  bootStatusSynced = false;
}

// ============================================================
// 14. NTP CLOCK SYNCHRONIZATION
// ============================================================

bool syncClock() {

  if (WiFi.status() != WL_CONNECTED) {
    return false;
  }

  configTime(
    0,
    0,
    "pool.ntp.org",
    "time.google.com"
  );

  Serial.println("[NTP] Synchronizing...");

  unsigned long startedAt = millis();

  while (
    time(nullptr) < 1700000000 &&
    millis() - startedAt < 15000
  ) {
    delay(250);
  }

  if (time(nullptr) < 1700000000) {

    clockSynced = false;

    Serial.println("[NTP] Sync failed");

    return false;
  }

  clockSynced = true;

  Serial.print("[NTP] UTC: ");
  Serial.println(currentUtcTime());

  return true;
}

// ============================================================
// 15. MAINTAIN CLOCK
// ============================================================

void maintainClock() {

  if (
    clockSynced &&
    time(nullptr) >= 1700000000
  ) {
    return;
  }

  if (
    millis() - lastNtpAttemptMs <
    NTP_RETRY_INTERVAL_MS
  ) {
    return;
  }

  lastNtpAttemptMs = millis();

  Serial.println("[NTP] Retrying...");

  syncClock();
}

// ============================================================
// 16. UTC TIME
// ============================================================

String currentUtcTime() {

  time_t now = time(nullptr);

  if (now < 1700000000) {
    return "";
  }

  struct tm timeInfo;

  gmtime_r(&now, &timeInfo);

  char buffer[25];

  strftime(
    buffer,
    sizeof(buffer),
    "%Y-%m-%dT%H:%M:%SZ",
    &timeInfo
  );

  return String(buffer);
}

// ============================================================
// 17. COMMON HTTPS REQUEST
// ============================================================

int sendRequest(
  const String& path,
  const String& method,
  const String& body,
  String& response
) {

  response = "";

  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[HTTP] WiFi disconnected");
    return -1;
  }

  if (
    !clockSynced ||
    time(nullptr) < 1700000000
  ) {
    Serial.println("[HTTP] Clock not ready");
    return -1;
  }

  if (deviceToken.length() == 0) {
    Serial.println("[HTTP] Token missing");
    return -1;
  }

  String url = String(SERVER_BASE) + path;

  // Keep-alive enabled for repeated requests.

  http.setReuse(true);

  http.setTimeout(HTTP_TIMEOUT_MS);

  http.setConnectTimeout(HTTP_CONNECT_TIMEOUT_MS);

  if (!http.begin(secureClient, url)) {

    Serial.println("[HTTP] Begin failed");

    return -1;
  }

  http.addHeader("X-Device-Id", DEVICE_ID);

  http.addHeader(
    "Authorization",
    String("Bearer ") + deviceToken
  );

  http.addHeader(
    "Content-Type",
    "application/json"
  );

  http.addHeader(
    "Accept",
    "application/json"
  );

  int code = -1;

  unsigned long requestStarted = millis();

  if (method == "GET") {

    code = http.GET();

  } else if (method == "POST") {

    code = http.POST(body);

  } else {

    Serial.println("[HTTP] Invalid method");

    http.end();

    return -1;
  }

  if (code > 0) {

    response = http.getString();

  } else {

    Serial.print("[HTTP] Error: ");

    Serial.println(http.errorToString(code));
  }

  unsigned long duration =
    millis() - requestStarted;

  Serial.print("[HTTP] ");
  Serial.print(method);
  Serial.print(" ");
  Serial.print(path);
  Serial.print(" | Code: ");
  Serial.print(code);
  Serial.print(" | Time: ");
  Serial.print(duration);
  Serial.println(" ms");

  http.end();

  return code;
}

// ============================================================
// 18. HTTPS HEALTH CHECK
// ============================================================

bool testHttpsHealth() {

  Serial.println("[HEALTH] Checking server...");

  String response;

  int code = sendRequest(
    "/api/health",
    "GET",
    "",
    response
  );

  if (code >= 200 && code < 300) {

    Serial.println("[HEALTH] Server ready");

    return true;
  }

  Serial.println("[HEALTH] Server unavailable");

  if (response.length()) {
    Serial.println(response);
  }

  return false;
}

// ============================================================
// 19. HEARTBEAT
// ============================================================

void sendHeartbeat() {

  StaticJsonDocument<256> doc;

  doc["firmwareVersion"] = FIRMWARE_VERSION;

  doc["rssi"] = WiFi.RSSI();

  doc["uptimeSeconds"] = millis() / 1000;

  doc["freeHeapBytes"] = ESP.getFreeHeap();

  String body;

  serializeJson(doc, body);

  String response;

  int code = sendRequest(
    "/api/esp32/heartbeat",
    "POST",
    body,
    response
  );

  if (code >= 200 && code < 300) {

    Serial.println("[HEARTBEAT] Success");

  } else {

    Serial.println("[HEARTBEAT] Failed");

    if (response.length()) {
      Serial.println(response);
    }
  }
}

// ============================================================
// 20. BOOT STATUS SYNCHRONIZATION
// ============================================================

bool sendBootStatus() {
  StaticJsonDocument<512> doc;

  doc["bootReason"] = "power_on";
  JsonArray channels = doc.createNestedArray("channels");

  for (uint8_t i = 0; i < RELAY_COUNT; i++) {
    JsonObject channel = channels.createNestedObject();
    channel["relayNumber"] = i + 1;
    channel["reportedState"] = relayStates[i] ? "on" : "off";
  }

  String body;
  serializeJson(doc, body);

  String response;
  int code = sendRequest(
    "/api/esp32/status",
    "POST",
    body,
    response
  );

  Serial.print("[BOOT STATUS] HTTP: ");
  Serial.println(code);

  if (response.length()) {
    Serial.println(response);
  }

  if (code >= 200 && code < 300) {
    Serial.println("[BOOT STATUS] Four-channel status synced");
    return true;
  }

  Serial.println("[BOOT STATUS] Sync failed");
  return false;
}

// ============================================================
// 21. COMMAND CACHE SEARCH
// ============================================================

int findProcessedCommand(const String& commandId) {

  for (uint8_t i = 0; i < COMMAND_CACHE_SIZE; i++) {

    if (
      commandCache[i].valid &&
      commandCache[i].commandId == commandId
    ) {
      return i;
    }
  }

  return -1;
}

// ============================================================
// 22. SAVE PROCESSED COMMAND
// ============================================================

void rememberProcessedCommand(
  const String& commandId,
  const String& state
) {

  commandCache[commandCacheIndex].commandId =
    commandId;

  commandCache[commandCacheIndex].reportedState =
    state;

  commandCache[commandCacheIndex].valid = true;

  commandCacheIndex++;

  if (commandCacheIndex >= COMMAND_CACHE_SIZE) {
    commandCacheIndex = 0;
  }
}

// ============================================================
// 23. SUCCESS ACKNOWLEDGEMENT
// ============================================================

bool sendAcknowledgement(
  const String& commandId,
  const String& reportedState,
  int relayNumber
) {

  StaticJsonDocument<384> doc;

  doc["status"] = "success";

  doc["reportedState"] = reportedState;

  doc["relayNumber"] = relayNumber;

  doc["executedAt"] = currentUtcTime();

  doc["result"] = "relay_updated";

  String body;

  serializeJson(doc, body);

  String path =
    "/api/esp32/commands/" +
    commandId +
    "/ack";

  String response;

  int code = sendRequest(
    path,
    "POST",
    body,
    response
  );

  if (code >= 200 && code < 300) {

    Serial.println("[ACK] Success");

    return true;
  }

  Serial.print("[ACK] Failed: ");
  Serial.println(code);

  if (response.length()) {
    Serial.println(response);
  }

  return false;
}

// ============================================================
// 24. FAILED ACKNOWLEDGEMENT
// ============================================================

bool sendFailedAcknowledgement(
  const String& commandId,
  int relayNumber,
  const String& reason
) {

  StaticJsonDocument<384> doc;

  doc["status"] = "failed";

  doc["reportedState"] = "unknown";

  doc["relayNumber"] = relayNumber;

  doc["executedAt"] = currentUtcTime();

  doc["failureReason"] = reason;

  String body;

  serializeJson(doc, body);

  String path =
    "/api/esp32/commands/" +
    commandId +
    "/ack";

  String response;

  int code = sendRequest(
    path,
    "POST",
    body,
    response
  );

  Serial.print("[FAILED ACK] HTTP: ");
  Serial.println(code);

  if (response.length()) {
    Serial.println(response);
  }

  return code >= 200 && code < 300;
}

// ============================================================
// 25. EXECUTE COMMAND
// ============================================================

void executeCommand(
  const String& commandId,
  int relayNumber,
  String action
) {
  action.trim();
  action.toLowerCase();

  Serial.println();
  Serial.println("========== COMMAND ==========");
  Serial.print("[COMMAND] ID: ");
  Serial.println(commandId);
  Serial.print("[COMMAND] Relay: ");
  Serial.println(relayNumber);
  Serial.print("[COMMAND] Action: ");
  Serial.println(action);

  // Duplicate command protection.
  int cachedIndex = findProcessedCommand(commandId);
  if (cachedIndex >= 0) {
    Serial.println("[COMMAND] Duplicate command; re-sending ACK");
    sendAcknowledgement(
      commandId,
      commandCache[cachedIndex].reportedState,
      relayNumber
    );
    return;
  }

  // Validate relay number.
  if (relayNumber < 1 || relayNumber > RELAY_COUNT) {
    Serial.println("[COMMAND] Unsupported relay number");
    sendFailedAcknowledgement(
      commandId,
      relayNumber,
      "unsupported_relay"
    );
    return;
  }

  // Validate requested action.
  if (action != "on" && action != "off") {
    Serial.println("[COMMAND] Invalid action");
    sendFailedAcknowledgement(
      commandId,
      relayNumber,
      "invalid_action"
    );
    return;
  }

  const uint8_t index = relayNumber - 1;
  const bool requestedState = (action == "on");

  // Active LOW: LOW = ON, HIGH = OFF.
  digitalWrite(
    RELAY_PINS[index],
    requestedState ? RELAY_ON : RELAY_OFF
  );

  relayStates[index] = requestedState;
  const String reportedState = requestedState ? "on" : "off";

  // Remember the command after applying the GPIO state.
  rememberProcessedCommand(commandId, reportedState);

  Serial.print("[RELAY] Relay ");
  Serial.print(relayNumber);
  Serial.print(" | GPIO ");
  Serial.print(RELAY_PINS[index]);
  Serial.print(" | State: ");
  Serial.println(reportedState);

  sendAcknowledgement(commandId, reportedState, relayNumber);
  Serial.println("=============================");
}


// ============================================================
// 26. POLL PENDING COMMANDS
// ============================================================

void pollCommands() {

  String response;

  int code = sendRequest(
    "/api/esp32/commands/pending",
    "GET",
    "",
    response
  );

  if (code != 200) {

    Serial.print("[COMMANDS] Poll failed: ");
    Serial.println(code);

    if (response.length()) {
      Serial.println(response);
    }

    // A 401/403 may mean token or device registration issue.
    // A 429 means backend rate limiting.
    return;
  }

  StaticJsonDocument<4096> doc;

  DeserializationError error =
    deserializeJson(doc, response);

  if (error) {

    Serial.print("[COMMANDS] JSON error: ");
    Serial.println(error.c_str());

    return;
  }

  JsonArray commands =
    doc["data"].as<JsonArray>();

  if (commands.isNull() || commands.size() == 0) {
    return;
  }

  // Process one command per polling cycle.

  JsonObject command = commands[0];

  String commandId =
    command["commandId"] | "";

  int relayNumber =
    command["relayNumber"] | 0;

  String action =
    command["action"] | "";

  long ttlRemainingMs =
    command["ttlRemainingMs"] | 0;

  if (commandId.length() == 0) {

    Serial.println("[COMMANDS] Missing command ID");

    return;
  }

  if (ttlRemainingMs <= 0) {

    Serial.println("[COMMANDS] Command expired");

    return;
  }

  executeCommand(
    commandId,
    relayNumber,
    action
  );
}

// ============================================================
// 27. INITIALIZE NETWORK
// ============================================================

bool initializeNetwork() {

  // Configure certificate before network retries.

  secureClient.setCACert(ROOT_CA);
  secureClient.setTimeout(HTTP_TIMEOUT_MS);
  secureClient.setHandshakeTimeout(10);

  if (!connectWiFi(20000)) {
    return false;
  }

  if (!syncClock()) {
    return false;
  }

  return true;
}

// ============================================================
// 28. SETUP
// ============================================================

void setup() {

  Serial.begin(115200);

  delay(500);

  Serial.println();

  Serial.println("====================================");

  Serial.println("       JARVIS ESP32 CONTROLLER");

  Serial.println("====================================");

  // Always initialize relays first.

  initializeRelays();

  // Initialize INMP441 without changing relay/network setup.
  micReady = initializeMicrophone();
  if (!micReady) {
    Serial.println("[MIC] Microphone unavailable; relay controller will continue.");
  }

  // Validate Wi-Fi credentials.

  if (
    String(WIFI_SSID) == "YOUR_WIFI_NAME" ||
    String(WIFI_PASSWORD) == "YOUR_WIFI_PASSWORD"
  ) {

    Serial.println("[CONFIG] Add WiFi credentials first");

    return;
  }

  // Load device token.

  if (!loadDeviceToken()) {

    Serial.println("[AUTH] STOP: Token unavailable");

    return;
  }

  WiFi.mode(WIFI_STA);

  WiFi.setSleep(false);

  // Initialize network.

  if (!initializeNetwork()) {

    Serial.println("[NETWORK] Initial setup incomplete");

    return;
  }

  // Check server.

  httpsReady = testHttpsHealth();

  if (httpsReady) {

    sendHeartbeat();

    bootStatusSynced = sendBootStatus();

    lastHeartbeatMs = millis();

    lastCommandPollMs = millis();

    Serial.println("[JARVIS] Controller ready");

  } else {

    Serial.println("[JARVIS] Server unavailable");

  }
}

// ============================================================
// 29. MAIN LOOP
// ============================================================

void loop() {

  // Keep sampling the INMP441 even if Wi-Fi/server is offline.
  processMicrophone();

  // ----------------------------------------------------------
  // WIFI
  // ----------------------------------------------------------

  maintainWiFi();

  if (WiFi.status() != WL_CONNECTED) {
    delay(20);
    return;
  }

  // ----------------------------------------------------------
  // CLOCK
  // ----------------------------------------------------------

  maintainClock();

  if (
    !clockSynced ||
    time(nullptr) < 1700000000
  ) {
    delay(20);
    return;
  }

  // ----------------------------------------------------------
  // SERVER RECOVERY
  // ----------------------------------------------------------

  if (!httpsReady) {

    if (
      millis() - lastHealthCheckMs >= 15000
    ) {

      lastHealthCheckMs = millis();

      Serial.println("[NETWORK] Checking server...");

      httpsReady = testHttpsHealth();

      if (httpsReady) {

        Serial.println("[NETWORK] Server restored");

        sendHeartbeat();

        bootStatusSynced = sendBootStatus();

        lastHeartbeatMs = millis();

        lastCommandPollMs = millis();
      }
    }

    delay(20);

    return;
  }

  // ----------------------------------------------------------
  // BOOT STATUS RETRY
  // ----------------------------------------------------------

  if (!bootStatusSynced) {

    if (
      millis() - lastHealthCheckMs >= 10000
    ) {

      lastHealthCheckMs = millis();

      bootStatusSynced = sendBootStatus();
    }
  }

  unsigned long now = millis();

  // ----------------------------------------------------------
  // HEARTBEAT
  // ----------------------------------------------------------

  if (
    now - lastHeartbeatMs >=
    HEARTBEAT_INTERVAL_MS
  ) {

    lastHeartbeatMs = now;

    sendHeartbeat();
  }

  // ----------------------------------------------------------
  // FAST COMMAND POLLING
  // ----------------------------------------------------------

  if (
    now - lastCommandPollMs >=
    COMMAND_POLL_INTERVAL_MS
  ) {

    lastCommandPollMs = now;

    pollCommands();
  }

  delay(5);
}

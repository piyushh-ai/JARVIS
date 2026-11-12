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

// ============================================================
// 1. WIFI CONFIGURATION
// ============================================================

const char* WIFI_SSID = "Airtel_sant_4785";
const char* WIFI_PASSWORD = "Air@61755";

// ============================================================
// 2. SERVER CONFIGURATION
// ============================================================

const char* SERVER_BASE =
  "https://jarvis-puce-psi.vercel.app";

const char* DEVICE_ID = "ESP32-001";

const char* FIRMWARE_VERSION = "1.2.0";

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

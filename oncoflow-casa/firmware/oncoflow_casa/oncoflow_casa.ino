// Prova de conceito: ESP32 classico + 3 botoes. Somente dados ficticios.
// Referencia de pinagem: ESP32-DevKitC V4. Confira sua placa antes de ligar.
#include <WiFi.h>
#include <HTTPClient.h>
#include <esp_system.h>

const char* WIFI_SSID = "SEU_WIFI_2G4";
const char* WIFI_PASSWORD = "SUA_SENHA";
const char* SERVER_URL = "http://192.168.1.100:8765/api/events";
const char* DEVICE_ID = "CASA-001";
const uint8_t PINS[] = {25, 26, 27};
const char* VALUES[] = {"bem", "desconforto", "contato"};
const size_t QUEUE_SIZE = 16;
struct Event { String id; uint8_t value; };
Event queueEvents[QUEUE_SIZE];
size_t head = 0, count = 0;
int rawState[] = {HIGH, HIGH, HIGH};
int stableState[] = {HIGH, HIGH, HIGH};
unsigned long changedAt[] = {0, 0, 0};
unsigned long lastSend = 0, lastReconnect = 0;
String bootId;
uint32_t sequence = 0;

void enqueue(uint8_t value) {
  if (count >= QUEUE_SIZE) {
    Serial.println("FILA CHEIA: toque nao registrado. Reconecte e tente novamente.");
    return;
  }
  size_t index = (head + count) % QUEUE_SIZE;
  queueEvents[index] = {bootId + "-" + String(++sequence), value};
  count++;
  Serial.printf("AGUARDANDO ENVIO: %s (%u na fila)\n", VALUES[value], (unsigned)count);
}

void sendNext() {
  if (!count || WiFi.status() != WL_CONNECTED) return;
  Event &event = queueEvents[head];
  WiFiClient client;
  HTTPClient http;
  http.setConnectTimeout(1500);
  http.setTimeout(1500);
  if (!http.begin(client, SERVER_URL)) return;
  http.addHeader("Content-Type", "application/json");
  String body = "{\"event_id\":\"" + event.id + "\",\"device_id\":\"" + DEVICE_ID +
      "\",\"value\":\"" + VALUES[event.value] + "\",\"source\":\"esp32\"}";
  int status = http.POST(body);
  if (status == 200 || status == 201) {
    Serial.printf("RECEBIDO PELO PAINEL: %s\n", VALUES[event.value]);
    head = (head + 1) % QUEUE_SIZE;
    count--;
  } else {
    Serial.printf("ENVIO PENDENTE: HTTP %d. Nova tentativa automatica.\n", status);
  }
  http.end();
}

void setup() {
  Serial.begin(115200);
  for (uint8_t pin : PINS) pinMode(pin, INPUT_PULLUP);
  // Random boot identifier keeps retransmissions idempotent and reboot IDs distinct.
  char randomId[33];
  snprintf(randomId, sizeof(randomId), "%08lx%08lx%08lx%08lx",
      (unsigned long)esp_random(), (unsigned long)esp_random(),
      (unsigned long)esp_random(), (unsigned long)esp_random());
  bootId = String(DEVICE_ID) + "-" + randomId;
  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.println("OncoFlow Casa DEMO. Cada botao liga seu GPIO ao GND.");
  Serial.println("GPIO25=bem; GPIO26=desconforto; GPIO27=contato.");
  Serial.println("Fila em RAM: desligar a placa perde registros ainda nao enviados.");
}

void loop() {
  unsigned long current = millis();
  for (uint8_t i = 0; i < 3; i++) {
    int read = digitalRead(PINS[i]);
    if (read != rawState[i]) { rawState[i] = read; changedAt[i] = current; }
    if (current - changedAt[i] >= 45 && stableState[i] != read) {
      stableState[i] = read;
      if (read == LOW) enqueue(i);
    }
  }
  if (WiFi.status() != WL_CONNECTED && current - lastReconnect >= 10000) {
    lastReconnect = current;
    WiFi.reconnect();
  }
  if (current - lastSend >= 2500) { lastSend = current; sendNext(); }
  delay(5);
}

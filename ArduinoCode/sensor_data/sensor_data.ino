#include <WiFi.h>
#include <HTTPClient.h>
#include <OneWire.h>
#include <DallasTemperature.h>
#include <Adafruit_Sensor.h>
#include <DHT.h>
#include <Wire.h>
#include "MAX30105.h"

// Supabase Config
const char* ssid = "Hello";
const char* password = "amibolbona";
const char* supabaseUrl = "https://eubfseugwxchapicdfqe.supabase.co";
const char* supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV1YmZzZXVnd3hjaGFwaWNkZnFlIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NzU3OTQ2MCwiZXhwIjoyMDYzMTU1NDYwfQ.o4Va7zZAu8vAJT3dJNDUpj84mueyMjtLZBXLdlOgdj8";
const char* tableEndpoint = "/rest/v1/biometrics";
const char* contentType = "application/json";

// Sensor Pins
#define GSR_PIN        32
#define ONE_WIRE_BUS   33
#define DHT_PIN        19
#define DHT_TYPE       DHT22
#define LED_GREEN      12
#define LED_RED        14

// Stress Detection Parameters
#define GSR_THRESHOLD      2500    // Higher = more stress
#define GSR_WEIGHT         0.3
#define HR_THRESHOLD       80      // BPM
#define HR_WEIGHT          0.25
#define TEMP_THRESHOLD     37.2    // °C
#define TEMP_WEIGHT        0.2
#define SPO2_THRESHOLD     95      // %
#define SPO2_WEIGHT        0.25

// Normalization factors
#define GSR_NORMAL         1500
#define HR_NORMAL          72
#define TEMP_NORMAL        36.5
#define SPO2_NORMAL        98

// GSR Normalization Range (adjust these based on your actual readings)
#define GSR_MIN           500     // Minimum expected GSR value
#define GSR_MAX           3500    // Maximum expected GSR value

// Setup sensor instances
OneWire oneWire(ONE_WIRE_BUS);
DallasTemperature bodyTempSensor(&oneWire);
DHT dht(DHT_PIN, DHT_TYPE);
MAX30105 particleSensor;

// Variables for moving average
#define STRESS_WINDOW_SIZE 5
float stressHistory[STRESS_WINDOW_SIZE];
int stressIndex = 0;
unsigned long lastLEDToggle = 0;

void setup() {
  Serial.begin(115200);
  pinMode(LED_GREEN, OUTPUT);
  pinMode(LED_RED, OUTPUT);

  // Initialize stress history
  for (int i = 0; i < STRESS_WINDOW_SIZE; i++) {
    stressHistory[i] = 0;
  }

  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\nWiFi connected!");

  dht.begin();
  bodyTempSensor.begin();
  Wire.begin(5, 4);  // SDA = 5, SCL = 4
  if (!particleSensor.begin(Wire, I2C_SPEED_STANDARD)) {
    Serial.println("MAX30102 not found");
    while (1);
  }
  particleSensor.setup();
}

float calculateStressScore(float gsr, int heartRate, int spo2, float temperature) {
    // Calculate normalized deviations from baseline
    float gsrFactor = max(0, gsr - GSR_NORMAL) / (GSR_THRESHOLD - GSR_NORMAL);
    float hrFactor = max(0, heartRate - HR_NORMAL) / (HR_THRESHOLD - HR_NORMAL);
    float tempFactor = max(0, temperature - TEMP_NORMAL) / (TEMP_THRESHOLD - TEMP_NORMAL);
    float spo2Factor = max(0, SPO2_NORMAL - spo2) / (SPO2_NORMAL - SPO2_THRESHOLD);
    
    // Calculate weighted stress score
    return (gsrFactor * GSR_WEIGHT) +
           (hrFactor * HR_WEIGHT) +
           (tempFactor * TEMP_WEIGHT) +
           (spo2Factor * SPO2_WEIGHT);
}

float normalizeGSR(float rawGsr) {
  // Constrain the value within expected range
  float constrained = constrain(rawGsr, GSR_MIN, GSR_MAX);
  // Map to 0-100 range
  return 100.0 * (constrained - GSR_MIN) / (GSR_MAX - GSR_MIN);
}

void updateLEDs(float stressScore) {
    // Turn off both LEDs first
    digitalWrite(LED_GREEN, LOW);
    digitalWrite(LED_RED, LOW);
    
    if (stressScore < 0.3) {
        // Low stress - solid green
        digitalWrite(LED_GREEN, HIGH);
    } 
    else if (stressScore < 0.7) {
        // Moderate stress - blinking green
        if (millis() - lastLEDToggle > 500) {
            digitalWrite(LED_GREEN, !digitalRead(LED_GREEN));
            lastLEDToggle = millis();
        }
    }
    else {
        // High stress - solid red
        digitalWrite(LED_RED, HIGH);
    }
}

void loop() {
    // Read sensors
    float gsrValue = analogRead(GSR_PIN);
    bodyTempSensor.requestTemperatures();
    float bodyTemp = bodyTempSensor.getTempCByIndex(0);
    float ambientTemp = dht.readTemperature();
    float humidity = dht.readHumidity();
    
    // For demo purposes - replace with actual sensor readings
    int heartRate = particleSensor.getIR() > 50000 ? random(60, 90) : 0;
    int spo2 = random(95, 100);

    // Calculate current stress score (using raw GSR value)
    float currentStress = calculateStressScore(gsrValue, heartRate, spo2, bodyTemp);
    
    // Update moving average
    stressHistory[stressIndex] = currentStress;
    stressIndex = (stressIndex + 1) % STRESS_WINDOW_SIZE;
    
    // Calculate average stress
    float avgStress = 0;
    for (int i = 0; i < STRESS_WINDOW_SIZE; i++) {
        avgStress += stressHistory[i];
    }
    avgStress /= STRESS_WINDOW_SIZE;
    
    // Update LED indicators
    updateLEDs(avgStress);
    
    // Send data to Supabase (with normalized GSR value)
    sendToSupabase(gsrValue, heartRate, spo2, bodyTemp, avgStress);
    
    delay(10000);  // 10 seconds delay
}

void sendToSupabase(float gsr, int heartRate, int spo2, float temperature, float stressScore) {
  if (WiFi.status() == WL_CONNECTED) {
    HTTPClient http;
    String url = String(supabaseUrl) + tableEndpoint;
    http.begin(url);
    http.addHeader("apikey", supabaseKey);
    http.addHeader("Authorization", String("Bearer ") + supabaseKey);
    http.addHeader("Content-Type", contentType);

    // Normalize GSR to 0-100 range for database storage
    float normalizedGsr = normalizeGSR(gsr);
    
    String payload = "[{\"user_id\": \"74acc9e1-3900-46d8-a7b8-4e385dbe08b7\", ";
    payload += "\"gsr\": " + String(normalizedGsr) + ", ";  // Send normalized value
    payload += "\"heartbeat\": " + String(heartRate) + ", ";
    payload += "\"spo2\": " + String(spo2) + ", ";
    payload += "\"temperature\": " + String(temperature) + ", ";
    payload += "\"stress_score\": " + String(stressScore) + "}]";

    // Debug output
    Serial.print("Raw GSR: ");
    Serial.print(gsr);
    Serial.print(" | Normalized GSR: ");
    Serial.println(normalizedGsr);

    int httpResponseCode = http.POST(payload);
    Serial.print("POST Status: ");
    Serial.println(httpResponseCode);
    if (httpResponseCode > 0) {
      String response = http.getString();
      Serial.println(response);
    }
    http.end();
  }
}
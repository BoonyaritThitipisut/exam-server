// ============================================================
//  config.h — WiFi & API Configuration
//  แก้ค่าตรงนี้ให้ตรงกับ Network ของคุณ
// ============================================================
#pragma once

// ── WiFi ─────────────────────────────────────────────────────
#define WIFI_SSID "Thiti4315_2.4G"
#define WIFI_PASSWORD "T0891194315"

// ── TFT Display Pins ──────────────────────────────────
#define PIN_TFT_MISO   21   // MISO  → GPIO 21
#define PIN_TFT_MOSI   20   // MOSI  → GPIO 20
#define PIN_TFT_SCK    19   // SCK   → GPIO 19
#define PIN_TFT_CS     22   // CS    → GPIO 22
#define PIN_TFT_DC      2   // DC    → GPIO 2
#define PIN_TFT_RST     3   // RST   → GPIO 3
#define PIN_TFT_BL     18   // LED   → GPIO 18
#define SCREEN_WIDTH   480
#define SCREEN_HEIGHT  320
#define SPI_SPEED      20000000

// ── API Server ───────────────────────────────────────────────
// ใส่ IP ของเครื่อง PC ที่รัน exam-server (ไม่ใช่ localhost)
// ดู IP ได้ด้วย ipconfig ใน cmd
#define SERVER_HOST "192.168.1.34" // << แก้ตรงนี้
#define SERVER_PORT      3000              // << port ของ exam-server
#define SERVER_PORT_STR  "3000"             // string version สำหรับ URL
#define SERVER_BASE_URL  "http://" SERVER_HOST ":" SERVER_PORT_STR

// ── Timeout ──────────────────────────────────────────────────
#define HTTP_TIMEOUT_MS 8000

// ── Debug ────────────────────────────────────────────────────
#define DEBUG_HTTP true // พิมพ์ request/response ไป Serial

// ── Touch XPT2046 ────────────────────────────────────────────
// ใช้ SPI bus เดียวกับ TFT (SCK=19, MOSI=20, MISO=21)
// PIN_TOUCH_CS  → GPIO 0  (T_CS)
// PIN_TOUCH_IRQ → GPIO 1  (T_IRQ)
// ถ้า touch ไม่ตรง ให้รัน:
// File → Examples → TFT_eSPI → Generic → Touch_calibrate

#include <SPI.h>


// =========================
// GUI BUTTON
// =========================
struct GuiButton {
  int x;
  int y;
  int w;
  int h;
  uint16_t fillColor;
  uint16_t borderColor;
  uint16_t textColor;
  const char* label;
  bool pressed;
} ;

// =========================
// XPT2046 command
// =========================
#define READ_X 0xD0
#define READ_Y 0x90

// =========================
// PIN CONFIG
// =========================
#define TFT_SCK   19
#define TFT_MOSI  20
#define TFT_MISO  21
#define TFT_CS    22
#define TFT_DC    2
#define TFT_RST   3
#define TFT_BL    18

// =========================
// Touch pins (XPT2046)
// =========================
#define PIN_TOUCH_CS    5
#define PIN_TOUCH_IRQ   1

// =========================
// DISPLAY SIZE
// =========================
#define TFT_WIDTH   320
#define TFT_HEIGHT  480

#define TOUCH_SPI_SPEED 2000000
#define TFT_SPI_SPEED   40000000

// =========================
// TOUCH CALIBRATION
// ปรับตามจอจริงภายหลัง
// =========================
#define TS_X_MIN  250
#define TS_X_MAX  3800
#define TS_Y_MIN  250
#define TS_Y_MAX  3800

// ถ้าพิกัดกลับด้าน ให้ปรับ 3 ตัวนี้
bool touchSwapXY = false;
bool touchInvertX = false;
bool touchInvertY = false;

// -------------------------
// Basic pin helpers
// -------------------------
inline void csHigh() { digitalWrite(TFT_CS, HIGH); }
inline void csLow()  { digitalWrite(TFT_CS, LOW);  }
inline void dcHigh() { digitalWrite(TFT_DC, HIGH); }
inline void dcLow()  { digitalWrite(TFT_DC, LOW);  }

// -------------------------
// Low-level write
// -------------------------
void writeCommand(uint8_t cmd) {
  csLow();
  dcLow();
  SPI.write(cmd);
  csHigh();
}

void writeData(uint8_t data) {
  csLow();
  dcHigh();
  SPI.write(data);
  csHigh();
}

void writeDataBuffer(const uint8_t* data, size_t len) {
  csLow();
  dcHigh();
  SPI.writeBytes(data, len);
  csHigh();
}

// -------------------------
// Reset
// -------------------------
void tftReset() {
  digitalWrite(TFT_RST, HIGH);
  delay(20);
  digitalWrite(TFT_RST, LOW);
  delay(20);
  digitalWrite(TFT_RST, HIGH);
  delay(150);
}

// -------------------------
// ILI9488 init
// -------------------------
void ili9488Init() {
  tftReset();

  writeCommand(0x01);
  delay(120);

  writeCommand(0x11);
  delay(120);

  writeCommand(0x36);
  writeData(0x48);

  writeCommand(0x3A);
  writeData(0x66);    // 18-bit/pixel

  writeCommand(0x20);
  writeCommand(0x13);
  writeCommand(0x29);
  delay(20);
}

// -------------------------
// Set drawing window
// -------------------------
void setAddrWindow(uint16_t x0, uint16_t y0, uint16_t x1, uint16_t y1) {
  uint8_t data[4];

  writeCommand(0x2A);
  data[0] = x0 >> 8;
  data[1] = x0 & 0xFF;
  data[2] = x1 >> 8;
  data[3] = x1 & 0xFF;
  writeDataBuffer(data, 4);

  writeCommand(0x2B);
  data[0] = y0 >> 8;
  data[1] = y0 & 0xFF;
  data[2] = y1 >> 8;
  data[3] = y1 & 0xFF;
  writeDataBuffer(data, 4);

  writeCommand(0x2C);
}

// -------------------------
// RGB565 -> RGB888-ish
// -------------------------
inline void color565To888(uint16_t c, uint8_t &r, uint8_t &g, uint8_t &b) {
  uint8_t r5 = (c >> 11) & 0x1F;
  uint8_t g6 = (c >> 5)  & 0x3F;
  uint8_t b5 = c & 0x1F;

  r = (r5 * 255) / 31;
  g = (g6 * 255) / 63;
  b = (b5 * 255) / 31;
}

// -------------------------
// Draw pixel
// -------------------------
void drawPixel(uint16_t x, uint16_t y, uint16_t color565) {
  if (x >= TFT_WIDTH || y >= TFT_HEIGHT) return;

  uint8_t r, g, b;
  color565To888(color565, r, g, b);

  setAddrWindow(x, y, x, y);

  SPI.beginTransaction(SPISettings(TFT_SPI_SPEED, MSBFIRST, SPI_MODE0));
  digitalWrite(PIN_TOUCH_CS, HIGH);
  csLow();
  dcHigh();
  SPI.write(r);
  SPI.write(g);
  SPI.write(b);
  csHigh();
  SPI.endTransaction();
}

// -------------------------
// Fill rectangle
// -------------------------
void fillRect(uint16_t x, uint16_t y, uint16_t w, uint16_t h, uint16_t color565) {
  if (x >= TFT_WIDTH || y >= TFT_HEIGHT) return;
  if ((x + w) > TFT_WIDTH)  w = TFT_WIDTH - x;
  if ((y + h) > TFT_HEIGHT) h = TFT_HEIGHT - y;
  if (w == 0 || h == 0) return;

  uint8_t r, g, b;
  color565To888(color565, r, g, b);

  setAddrWindow(x, y, x + w - 1, y + h - 1);

  SPI.beginTransaction(SPISettings(TFT_SPI_SPEED, MSBFIRST, SPI_MODE0));
  digitalWrite(PIN_TOUCH_CS, HIGH);
  csLow();
  dcHigh();

  const size_t PIXELS_PER_CHUNK = 128;
  uint8_t buf[PIXELS_PER_CHUNK * 3];

  for (size_t i = 0; i < PIXELS_PER_CHUNK; i++) {
    buf[i * 3 + 0] = r;
    buf[i * 3 + 1] = g;
    buf[i * 3 + 2] = b;
  }

  uint32_t total = (uint32_t)w * h;

  while (total >= PIXELS_PER_CHUNK) {
    SPI.writeBytes(buf, sizeof(buf));
    total -= PIXELS_PER_CHUNK;
  }

  while (total--) {
    SPI.write(r);
    SPI.write(g);
    SPI.write(b);
  }

  csHigh();
  SPI.endTransaction();
}

// -------------------------
// Fill entire screen
// -------------------------
void fillScreen(uint16_t color565) {
  fillRect(0, 0, TFT_WIDTH, TFT_HEIGHT, color565);
}

// -------------------------
// Simple line/rect
// -------------------------
void drawHLine(uint16_t x, uint16_t y, uint16_t w, uint16_t color565) {
  fillRect(x, y, w, 1, color565);
}

void drawVLine(uint16_t x, uint16_t y, uint16_t h, uint16_t color565) {
  fillRect(x, y, 1, h, color565);
}

void drawRect(uint16_t x, uint16_t y, uint16_t w, uint16_t h, uint16_t color565) {
  drawHLine(x, y, w, color565);
  drawHLine(x, y + h - 1, w, color565);
  drawVLine(x, y, h, color565);
  drawVLine(x + w - 1, y, h, color565);
}

// =========================
// FONT
// =========================
const uint8_t font5x7[][5] = {
  {0x00,0x00,0x00,0x00,0x00},{0x00,0x00,0x5F,0x00,0x00},{0x00,0x07,0x00,0x07,0x00},{0x14,0x7F,0x14,0x7F,0x14},
  {0x24,0x2A,0x7F,0x2A,0x12},{0x23,0x13,0x08,0x64,0x62},{0x36,0x49,0x55,0x22,0x50},{0x00,0x05,0x03,0x00,0x00},
  {0x00,0x1C,0x22,0x41,0x00},{0x00,0x41,0x22,0x1C,0x00},{0x14,0x08,0x3E,0x08,0x14},{0x08,0x08,0x3E,0x08,0x08},
  {0x00,0x50,0x30,0x00,0x00},{0x08,0x08,0x08,0x08,0x08},{0x00,0x60,0x60,0x00,0x00},{0x20,0x10,0x08,0x04,0x02},
  {0x3E,0x51,0x49,0x45,0x3E},{0x00,0x42,0x7F,0x40,0x00},{0x42,0x61,0x51,0x49,0x46},{0x21,0x41,0x45,0x4B,0x31},
  {0x18,0x14,0x12,0x7F,0x10},{0x27,0x45,0x45,0x45,0x39},{0x3C,0x4A,0x49,0x49,0x30},{0x01,0x71,0x09,0x05,0x03},
  {0x36,0x49,0x49,0x49,0x36},{0x06,0x49,0x49,0x29,0x1E},{0x00,0x36,0x36,0x00,0x00},{0x00,0x56,0x36,0x00,0x00},
  {0x08,0x14,0x22,0x41,0x00},{0x14,0x14,0x14,0x14,0x14},{0x00,0x41,0x22,0x14,0x08},{0x02,0x01,0x51,0x09,0x06},
  {0x32,0x49,0x79,0x41,0x3E},{0x7E,0x11,0x11,0x11,0x7E},{0x7F,0x49,0x49,0x49,0x36},{0x3E,0x41,0x41,0x41,0x22},
  {0x7F,0x41,0x41,0x22,0x1C},{0x7F,0x49,0x49,0x49,0x41},{0x7F,0x09,0x09,0x09,0x01},{0x3E,0x41,0x49,0x49,0x7A},
  {0x7F,0x08,0x08,0x08,0x7F},{0x00,0x41,0x7F,0x41,0x00},{0x20,0x40,0x41,0x3F,0x01},{0x7F,0x08,0x14,0x22,0x41},
  {0x7F,0x40,0x40,0x40,0x40},{0x7F,0x02,0x0C,0x02,0x7F},{0x7F,0x04,0x08,0x10,0x7F},{0x3E,0x41,0x41,0x41,0x3E},
  {0x7F,0x09,0x09,0x09,0x06},{0x3E,0x41,0x51,0x21,0x5E},{0x7F,0x09,0x19,0x29,0x46},{0x46,0x49,0x49,0x49,0x31},
  {0x01,0x01,0x7F,0x01,0x01},{0x3F,0x40,0x40,0x40,0x3F},{0x1F,0x20,0x40,0x20,0x1F},{0x3F,0x40,0x38,0x40,0x3F},
  {0x63,0x14,0x08,0x14,0x63},{0x07,0x08,0x70,0x08,0x07},{0x61,0x51,0x49,0x45,0x43},
};

bool getFontData(char c, uint8_t out[5]) {
  if (c < 32 || c > 90) c = '?';
  if (c == '?') {
    uint8_t q[5] = {0x02,0x01,0x51,0x09,0x06};
    for (int i = 0; i < 5; i++) out[i] = q[i];
    return true;
  }
  int idx = c - 32;
  for (int i = 0; i < 5; i++) out[i] = font5x7[idx][i];
  return true;
}

void drawChar(int16_t x, int16_t y, char c, uint16_t fg, uint16_t bg, uint8_t size = 1) {
  uint8_t line[5];
  getFontData(c, line);

  for (int8_t i = 0; i < 5; i++) {
    uint8_t bits = line[i];
    for (int8_t j = 0; j < 7; j++) {
      uint16_t color = (bits & 0x01) ? fg : bg;
      if (size == 1) drawPixel(x + i, y + j, color);
      else fillRect(x + (i * size), y + (j * size), size, size, color);
      bits >>= 1;
    }
  }

  if (size == 1) fillRect(x + 5, y, 1, 7, bg);
  else fillRect(x + 5 * size, y, size, 7 * size, bg);
}

void drawString(int16_t x, int16_t y, const char *text, uint16_t fg, uint16_t bg, uint8_t size = 1) {
  int16_t cursorX = x;
  while (*text) {
    if (*text == '\n') {
      cursorX = x;
      y += 8 * size;
    } else {
      drawChar(cursorX, y, *text, fg, bg, size);
      cursorX += 6 * size;
    }
    text++;
  }
}

// -------------------------
// Touch read
// -------------------------
uint16_t readXPT2046Raw(uint8_t command) {
  uint8_t hi = 0, lo = 0;

  SPI.beginTransaction(SPISettings(TOUCH_SPI_SPEED, MSBFIRST, SPI_MODE0));
  digitalWrite(TFT_CS, HIGH);
  digitalWrite(PIN_TOUCH_CS, LOW);
  delayMicroseconds(2);

  SPI.transfer(command);
  hi = SPI.transfer(0x00);
  lo = SPI.transfer(0x00);

  digitalWrite(PIN_TOUCH_CS, HIGH);
  SPI.endTransaction();

  uint16_t value = ((hi << 8) | lo) >> 3;
  return value & 0x0FFF;
}

uint16_t readXPT2046Avg(uint8_t command, uint8_t samples = 8) {
  uint32_t sum = 0;
  for (uint8_t i = 0; i < samples; i++) {
    sum += readXPT2046Raw(command);
    delayMicroseconds(50);
  }
  return sum / samples;
}

bool touchPressed() {
  return digitalRead(PIN_TOUCH_IRQ) == LOW;
}

// =========================
// COLOR DEFINES (RGB565)
// =========================
#define BLACK   0x0000
#define WHITE   0xFFFF
#define RED     0xF800
#define GREEN   0x07E0
#define BLUE    0x001F
#define YELLOW  0xFFE0
#define CYAN    0x07FF
#define MAGENTA 0xF81F
#define GRAY    0x8410
#define DARKGRAY 0x4208



GuiButton btnRed   = { 20, 380, 80, 50, RED,    WHITE, WHITE, "RED",   false };
GuiButton btnGreen = {120, 380, 80, 50, GREEN,  WHITE, WHITE, "GREEN", false };
GuiButton btnBlue  = {220, 380, 80, 50, BLUE,   WHITE, WHITE, "BLUE",  false };

uint16_t previewColor = CYAN;

// =========================
// Touch mapping
// ต้องปรับตามจอจริง
// =========================
int mapClamp(long v, long inMin, long inMax, long outMin, long outMax) {
  long r = (v - inMin

#include <SPI.h>
#include <Font.h>
#include "KeyboardUI.h"

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
  const char *label;
  bool pressed;
};

// =========================
// XPT2046 command
// =========================
#define READ_X 0xD0
#define READ_Y 0x90

// =========================
// PIN CONFIG
// =========================
#define TFT_SCK 19
#define TFT_MOSI 20
#define TFT_MISO 21
#define TFT_CS 22
#define TFT_DC 2
#define TFT_RST 3
#define TFT_BL 18

// =========================
// Touch pins (XPT2046)
// =========================
#define PIN_TOUCH_CS 5
#define PIN_TOUCH_IRQ 1

// =========================
// DISPLAY SIZE
// =========================
#define TFT_WIDTH 320
#define TFT_HEIGHT 480

#define TOUCH_SPI_SPEED 2000000
#define TFT_SPI_SPEED 40000000

// =========================
// TOUCH CALIBRATION
// ปรับตามจอจริงภายหลัง
// =========================
#define TS_X_MIN 250
#define TS_X_MAX 3800
#define TS_Y_MIN 250
#define TS_Y_MAX 3800

// ถ้าพิกัดกลับด้าน ให้ปรับ 3 ตัวนี้
bool touchSwapXY = false;
bool touchInvertX = false;
bool touchInvertY = false;

// -------------------------
// Basic pin helpers
// -------------------------
inline void csHigh() { digitalWrite(TFT_CS, HIGH); }
inline void csLow() { digitalWrite(TFT_CS, LOW); }
inline void dcHigh() { digitalWrite(TFT_DC, HIGH); }
inline void dcLow() { digitalWrite(TFT_DC, LOW); }

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

void writeDataBuffer(const uint8_t *data, size_t len) {
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
  writeData(0x66); // 18-bit/pixel

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
  uint8_t g6 = (c >> 5) & 0x3F;
  uint8_t b5 = c & 0x1F;

  r = (r5 * 255) / 31;
  g = (g6 * 255) / 63;
  b = (b5 * 255) / 31;
}

// -------------------------
// Draw pixel
// -------------------------
void drawPixel(uint16_t x, uint16_t y, uint16_t color565) {
  if (x >= TFT_WIDTH || y >= TFT_HEIGHT)
    return;

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
void fillRect(uint16_t x, uint16_t y, uint16_t w, uint16_t h,
              uint16_t color565) {
  if (x >= TFT_WIDTH || y >= TFT_HEIGHT)
    return;
  if ((x + w) > TFT_WIDTH)
    w = TFT_WIDTH - x;
  if ((y + h) > TFT_HEIGHT)
    h = TFT_HEIGHT - y;
  if (w == 0 || h == 0)
    return;

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

void drawRect(uint16_t x, uint16_t y, uint16_t w, uint16_t h,
              uint16_t color565) {
  drawHLine(x, y, w, color565);
  drawHLine(x, y + h - 1, w, color565);
  drawVLine(x, y, h, color565);
  drawVLine(x + w - 1, y, h, color565);
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

bool touchPressed() { return digitalRead(PIN_TOUCH_IRQ) == LOW; }

// =========================
// COLOR DEFINES (RGB565)
// =========================
#define BLACK 0x0000
#define WHITE 0xFFFF
#define RED 0xF800
#define GREEN 0x07E0
#define BLUE 0x001F
#define YELLOW 0xFFE0
#define CYAN 0x07FF
#define MAGENTA 0xF81F
#define GRAY 0x8410
#define DARKGRAY 0x4208

GuiButton btnRed = {20,   380, 80, 50, RED, WHITE, WHITE, "REDหก",
                    false};
GuiButton btnGreen = {120, 380, 80, 50, GREEN, WHITE, WHITE, "GREENหฟกด", false};
GuiButton btnBlue = {220, 380, 80, 50, BLUE, WHITE, WHITE, "BLUEฟหก", false};

uint16_t previewColor = CYAN;

// =========================
// Touch mapping
// ต้องปรับตามจอจริง
// =========================
int mapClamp(long v, long inMin, long inMax, long outMin, long outMax) {
  // 1. คำนวณเทียบบัญญัติไตรยางศ์ (เหมือนฟังก์ชัน map() ปกติของ Arduino)
  long r = (v - inMin) * (outMax - outMin) / (inMax - inMin) + outMin;

  // 2. ล็อคขอบเขต (Clamp) ไม่ให้ค่าพิกัดทะลุขนาดของหน้าจอ
  if (outMin < outMax) {
    if (r < outMin)
      return outMin;
    if (r > outMax)
      return outMax;
  } else {
    // รองรับกรณีที่แกนถูกกลับด้าน (Inverted axis เช่น max ไป min)
    if (r > outMin)
      return outMin;
    if (r < outMax)
      return outMax;
  }

  return (int)r;
}
// นำมาต่อท้ายไฟล์ Esp32c6spi.ino

// =========================
// ฟังก์ชันถอดรหัส UTF-8 (ภาษาไทย)
// =========================
uint32_t getUTF8Code(const char **str) {
  uint8_t c1 = **str;
  (*str)++;
  
  if (c1 < 0x80) { 
    // ภาษาอังกฤษและตัวเลข (1 Byte ASCII)
    return c1;
  } else if ((c1 & 0xE0) == 0xC0) { 
    // 2 Bytes
    uint8_t c2 = **str; (*str)++;
    return (c1 << 8) | c2;
  } else if ((c1 & 0xF0) == 0xE0) { 
    // ภาษาไทย (3 Bytes UTF-8)
    uint8_t c2 = **str; (*str)++;
    uint8_t c3 = **str; (*str)++;
    return (c1 << 16) | (c2 << 8) | c3;
  }
  return c1;
}
int getTextWidthThai(const char *text) {
  int width = 0;
  const char *str = text;
  
  while (*str != '\0') {
    uint32_t charCode = getUTF8Code(&str);
    const tChar *ch = nullptr;
    
    // หาตัวอักษร
    for (int i = 0; i < Font.length; i++) {
      if (Font.chars[i].code == charCode) {
        ch = &Font.chars[i];
        break;
      }
    }
    
    // บวกความกว้างสะสม
    if (ch != nullptr) {
      width += ch->image->width + 1; // +1 คือช่องไฟ
    } else {
      width += 8; // ถ้าหาไม่เจอให้ตีเป็นช่องว่างกว้าง 8
    }
  }
  return width;
}

// อ้างอิงตัวแปร Font จากไฟล์ Font.h
extern const tFont Font; 

void drawStringThai(int x, int y, const char *text, uint16_t color) {
  int cursorX = x;
  int consonantX = x;
  int consonantWidth = 0;
  int currentTopY = y;
  int currentBottomY = y;

  while (*text != '\0') {
    uint32_t charCode = getUTF8Code(&text);
    
    if (charCode == 0x0020) {
      cursorX += 8; 
      continue;     
    }
    
    const tChar *ch = nullptr;
    for (int i = 0; i < Font.length; i++) {
      if (Font.chars[i].code == charCode) {
        ch = &Font.chars[i];
        break;
      }
    }
    
    if (ch != nullptr) {
      int w = ch->image->width;
      int h = ch->image->height;
      const uint8_t *bitmap = ch->image->data;

      // 1. แยกประเภทอักษรไทย
      bool isTopVowel = 
        (charCode == 0x0E31 || (charCode >= 0x0E34 && charCode <= 0x0E37) || charCode == 0x0E47 || charCode == 0x0E4D) ||
        (charCode == 0xD1 || (charCode >= 0xD4 && charCode <= 0xD7) || charCode == 0xE7 || charCode == 0xED) ||
        (charCode == 0xE0B8B1 || (charCode >= 0xE0B8B4 && charCode <= 0xE0B8B7) || charCode == 0xE0B987 || charCode == 0xE0B98D);
      
      bool isToneMark = 
        (charCode >= 0x0E48 && charCode <= 0x0E4C) ||
        (charCode >= 0xE8 && charCode <= 0xEC) ||
        (charCode >= 0xE0B988 && charCode <= 0xE0B98C);
      
      bool isBottomVowel = 
        (charCode >= 0x0E38 && charCode <= 0x0E3A) ||
        (charCode >= 0xD8 && charCode <= 0xDA) ||
        (charCode >= 0xE0B8B8 && charCode <= 0xE0B8BA);
      
      bool isFloating = (isTopVowel || isToneMark || isBottomVowel);

      int drawX = cursorX;
      int drawY = y;

      // ==========================================
      // 🟢 ระบบจัดตำแหน่งและจูนระยะห่าง (ปรับเลขตรงนี้!)
      // ==========================================
      int topOffset = 17;    // ⬇️ ยิ่งค่าบวกเยอะ สระบนจะยิ่ง "เลื่อนลงมา" ใกล้พยัญชนะ
      int bottomOffset = 16; // ⬆️ ยิ่งค่าบวกเยอะ สระล่างจะยิ่ง "เลื่อนขึ้นไป" ใกล้พยัญชนะ
      
      if (isFloating) {
        // จัดแกน X ให้อยู่กึ่งกลางพยัญชนะ
        drawX = consonantX + ((consonantWidth - w) / 2);
        
        if (isTopVowel || isToneMark) {
          drawY = currentTopY - h + topOffset; // ลบความสูงแล้วบวกค่าชดเชยดึงกลับลงมา
          currentTopY = drawY;     
        } else if (isBottomVowel) {
          drawY = currentBottomY - bottomOffset; // ดึงกลับขึ้นไปหาพยัญชนะ
          currentBottomY = drawY + h; 
        }
      } else {
        consonantX = cursorX;
        consonantWidth = w;
        currentTopY = y;
        currentBottomY = y + h;
      }
      // ==========================================

      // 2. วาดพิกเซล
      int bytesPerLine = (w + 7) / 8; 
      for (int row = 0; row < h; row++) {
        for (int col = 0; col < w; col++) {
          int byteIndex = (row * bytesPerLine) + (col / 8);
          int bitShift = 7 - (col % 8); 
          bool isPixelOn = (bitmap[byteIndex] & (1 << bitShift)) == 0;
          
          if (isPixelOn) {
            drawPixel(drawX + col, drawY + row, color);
          }
        }
      }

      // 3. เลื่อนแกน X
      if (!isFloating) {
        cursorX += w + 1;
      }
      
    } else {
      cursorX += 8; 
    }
  }
}


void drawButton(GuiButton *btn) {
  // ถ้าปุ่มถูกกดอยู่ ให้เปลี่ยนสีพื้นหลังเป็นสีเทาเข้ม (DARKGRAY)
  uint16_t fill = btn->pressed ? DARKGRAY : btn->fillColor;
  
  // วาดพื้นหลังปุ่มและขอบปุ่ม
  fillRect(btn->x, btn->y, btn->w, btn->h, fill);
  drawRect(btn->x, btn->y, btn->w, btn->h, btn->borderColor);

  // ของใหม่ (วัดความกว้างจริงๆ ของอักษร)
  int textWidth = getTextWidthThai(btn->label);
  int textX = btn->x + (btn->w - textWidth) / 2;  
  int textY = btn->y + (btn->h / 2) - 8;   // ขนาด 2 สูงประมาณ 16 พิกเซล
  
  // จัดข้อความให้อยู่ในกรอบ (ป้องกัน X ติดลบ)
  if (textX < btn->x + 2) textX = btn->x + 2; 

 
  drawStringThai(textX, textY, btn->label, btn->textColor);
}

// =========================
// ฟังก์ชันตรวจสอบว่าพิกัดที่แตะ อยู่ในกรอบปุ่มหรือไม่
// =========================
bool isTouchInButton(GuiButton *btn, int touchX, int touchY) {
  return (touchX >= btn->x && touchX <= (btn->x + btn->w) &&
          touchY >= btn->y && touchY <= (btn->y + btn->h));
}


// =========================
// SETUP
// =========================

void setup() {
  Serial.begin(115200);
  
  pinMode(TFT_CS, OUTPUT);
  pinMode(TFT_DC, OUTPUT);
  pinMode(TFT_RST, OUTPUT);
  pinMode(TFT_BL, OUTPUT);
  pinMode(PIN_TOUCH_CS, OUTPUT);
  
  digitalWrite(TFT_CS, HIGH);
  digitalWrite(TFT_BL, HIGH); // หรือลอง LOW ถ้า HIGH แล้วจอยังมืด
  digitalWrite(PIN_TOUCH_CS, HIGH);

  SPI.begin(TFT_SCK, TFT_MISO, TFT_MOSI);

  // เริ่มต้นจอและล้างจอเป็นสีดำ
  ili9488Init();
  fillScreen(BLACK);
  


// 1. เทสภาษาอังกฤษ ตัวพิมพ์ใหญ่ พิมพ์เล็ก และตัวเลข
  drawStringThai(10, 10, "ABCDEFGHIJKLMNOPQRSTUVWXYZ", WHITE);
  drawStringThai(10, 40, "abcdefghijklmnopqrstuvwxyz", WHITE);
  drawStringThai(10, 70, "0123456789 !\"#$%&'()*+,-./", YELLOW);

  // 2. เทสพยัญชนะไทย
  drawStringThai(10, 100, "กขฃคฅฆงจฉชซฌญฎฏฐฑฒณดต", CYAN);
  drawStringThai(10, 130, "ถทธนบปผฝพฟภมยรฤลฦวศษสหฬอฮ", CYAN);

  // 3. เทสสระลอยและวรรณยุกต์ (ใช้ "อ" เป็นฐานให้เห็นตำแหน่งชัดๆ)
  drawStringThai(10, 160, "อะอาอำอิอีอึอือุอูเอแอโอใอไอ", GREEN);
  drawStringThai(10, 190, "อ่ อ้ อ๊ อ๋ อ็ อ์", RED);

  // 4. เทสประโยคจริง (มีตัวอักษรซ้อนกัน)
  drawStringThai(10, 220, "ผู้ใหญ่หาผ้าใหม่ ให้สะใภ้ใช้คล้องคอ", MAGENTA);
}

void loop() {
  // ว่างไว้
}

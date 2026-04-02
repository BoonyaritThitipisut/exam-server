#include <LovyanGFX.hpp>
#include <lvgl.h>
#include "config.h"

// ==========================================
// 1. ตั้งค่า LovyanGFX (ดึง Pin จาก config.h)
// ==========================================
class LGFX : public lgfx::Panel_ILI9488 {
  // **หมายเหตุ:** เปลี่ยน Panel_ST7796 เป็นชิปจอของคุณ (เช่น Panel_ILI9488) ถ้าภาพไม่ขึ้น
  lgfx::Panel_ST7796   _panel_instance; 
  lgfx::Bus_SPI        _bus_instance;
  lgfx::Touch_XPT2046  _touch_instance;

public:
  LGFX(void) {
    { // การตั้งค่า SPI Bus
      auto cfg = _bus_instance.config();
      cfg.spi_host = SPI2_HOST;     // ESP32-C6 ใช้ SPI2_HOST
      cfg.spi_mode = 0;
      cfg.freq_write = SPI_SPEED;   // 20MHz จาก config.h
      cfg.freq_read  = 16000000;
      cfg.spi_3wire  = false;
      cfg.use_lock   = true;
      cfg.dma_channel = SPI_DMA_CH_AUTO;

      cfg.pin_sclk = PIN_TFT_SCK;   // 19
      cfg.pin_mosi = PIN_TFT_MOSI;  // 20
      cfg.pin_miso = PIN_TFT_MISO;  // 21
      cfg.pin_dc   = PIN_TFT_DC;    // 2

      _bus_instance.config(cfg);
      _panel_instance.setBus(&_bus_instance);
    }

    { // การตั้งค่าหน้าจอ Panel
      auto cfg = _panel_instance.config();
      cfg.pin_cs   = PIN_TFT_CS;    // 22
      cfg.pin_rst  = PIN_TFT_RST;   // 3
      cfg.pin_busy = -1;

      // จอ 3.5 นิ้ว มักมีแกนหลัก (Native) เป็นแนวตั้ง 320x480
      cfg.panel_width  = 320; 
      cfg.panel_height = 480; 
      cfg.offset_x     = 0;
      cfg.offset_y     = 0;
      cfg.offset_rotation = 0;
      cfg.dummy_read_pixel = 8;
      cfg.dummy_read_bits  = 1;
      cfg.readable         = true;
      cfg.invert           = false; // เปลี่ยนเป็น true ถ้าสีกลับด้าน
      cfg.rgb_order        = false; // เปลี่ยนเป็น true ถ้าสีเพี้ยน (แดงสลับน้ำเงิน)
      cfg.dlen_16bit       = false;
      cfg.bus_shared       = true;

      _panel_instance.config(cfg);
    }

    { // การตั้งค่าทัชสกรีน XPT2046
      auto cfg = _touch_instance.config();
      cfg.x_min      = 0;
      cfg.x_max      = 319;
      cfg.y_min      = 0;
      cfg.y_max      = 479;
      cfg.pin_int    = 1;           // PIN_TOUCH_IRQ (จากคอมเมนต์ใน config.h)
      cfg.bus_shared = true;
      cfg.offset_rotation = 0;

      cfg.spi_host = SPI2_HOST;
      cfg.freq = 2500000;
      cfg.pin_sclk = PIN_TFT_SCK; 
      cfg.pin_mosi = PIN_TFT_MOSI;
      cfg.pin_miso = PIN_TFT_MISO;
      cfg.pin_cs   = 0;             // PIN_TOUCH_CS (จากคอมเมนต์ใน config.h)

      _touch_instance.config(cfg);
      _panel_instance.setTouch(&_touch_instance);
    }

    setPanel(&_panel_instance);
  }
};

LGFX tft;

// ==========================================
// 2. ตั้งค่า LVGL (Buffer และ Flush Callback)
// ==========================================
#define DRAW_BUF_SIZE (SCREEN_WIDTH * SCREEN_HEIGHT / 10)
static lv_disp_draw_buf_t draw_buf;
static lv_color_t buf[DRAW_BUF_SIZE];

void my_disp_flush(lv_disp_drv_t *disp_drv, const lv_area_t *area, lv_color_t *color_p) {
  uint32_t w = (area->x2 - area->x1 + 1);
  uint32_t h = (area->y2 - area->y1 + 1);

  tft.startWrite(); 
  tft.setAddrWindow(area->x1, area->y1, w, h);
  
  // เปลี่ยนจาก pushColors เป็น pushPixels สำหรับ LovyanGFX
  tft.pushPixels((uint16_t *)color_p, w * h, true); 
  
  tft.endWrite();   

  lv_disp_flush_ready(disp_drv);
}

// ==========================================
// 3. ฟังก์ชันหลัก (Setup / Loop)
// ==========================================
void setup() {
  Serial.begin(115200);

  // 1. เริ่มต้นหน้าจอด้วย LovyanGFX
  pinMode(PIN_TFT_BL, OUTPUT);
  digitalWrite(PIN_TFT_BL, HIGH); 
  
  tft.init();         // ใช้ init() แทน begin()
  tft.setRotation(1); // จอแนวนอน 480x320
  
  // ใน LovyanGFX ฟังก์ชัน setSwapBytes มักไม่จำเป็นต้องเรียกใช้ เพราะตัวไลบรารีจัดการสีผ่าน pushPixels ตรงๆ 
  // แต่ถ้าสีเพี้ยน ให้กลับไปแก้ค่า cfg.rgb_order ในคลาส LGFX ด้านบนแทน

  // 2. เริ่มต้น LVGL
  lv_init();
  
  // 3. ผูก Buffer เข้ากับ LVGL
  lv_disp_draw_buf_init(&draw_buf, buf, NULL, DRAW_BUF_SIZE);

  // 4. สร้างและลงทะเบียน Display Driver สำหรับ v8
  static lv_disp_drv_t disp_drv;
  lv_disp_drv_init(&disp_drv);
  disp_drv.hor_res = SCREEN_WIDTH;
  disp_drv.ver_res = SCREEN_HEIGHT;
  disp_drv.flush_cb = my_disp_flush;
  disp_drv.draw_buf = &draw_buf;
  lv_disp_drv_register(&disp_drv);

  // ==========================================
  // สร้าง UI 
  // ==========================================
  lv_obj_set_style_bg_color(lv_scr_act(), lv_color_hex(0xE0E0E0), LV_PART_MAIN);

  lv_obj_t * btn = lv_btn_create(lv_scr_act()); 
  lv_obj_set_size(btn, 200, 80);
  lv_obj_align(btn, LV_ALIGN_CENTER, 0, 0);

  lv_obj_t * label = lv_label_create(btn);
  lv_label_set_text(label, "Hello LovyanGFX!");
  lv_obj_center(label);
  
  Serial.println("LVGL Setup Done!");
}

void loop() {
  // ให้ LVGL จัดการวาดหน้าจอ
  lv_timer_handler();
  delay(5); 
}

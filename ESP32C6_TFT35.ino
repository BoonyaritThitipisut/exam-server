#include <LovyanGFX.hpp>
#include <lvgl.h>
#include "config.h"

// ==========================================
// 1. ตั้งค่า LovyanGFX
// ==========================================
class LGFX : public lgfx::LGFX_Device {
  lgfx::Panel_ILI9488   _panel_instance; // เปลี่ยนเป็นชิปของคุณได้ เช่น Panel_ILI9488
  lgfx::Bus_SPI        _bus_instance;
  lgfx::Touch_XPT2046  _touch_instance;

public:
  LGFX(void) {
    { // การตั้งค่า SPI Bus
      auto cfg = _bus_instance.config();
      cfg.spi_host = SPI2_HOST;
      cfg.spi_mode = 0;
      cfg.freq_write = SPI_SPEED;
      cfg.freq_read  = 16000000;
      cfg.spi_3wire  = false;
      cfg.use_lock   = true;
      cfg.dma_channel = SPI_DMA_CH_AUTO;

      cfg.pin_sclk = PIN_TFT_SCK;
      cfg.pin_mosi = PIN_TFT_MOSI;
      cfg.pin_miso = PIN_TFT_MISO;
      cfg.pin_dc   = PIN_TFT_DC;

      _bus_instance.config(cfg);
      _panel_instance.setBus(&_bus_instance);
    }

    { // การตั้งค่าหน้าจอ Panel
      auto cfg = _panel_instance.config();
      cfg.pin_cs   = PIN_TFT_CS;
      cfg.pin_rst  = PIN_TFT_RST;
      cfg.pin_busy = -1;

      cfg.panel_width  = 320; 
      cfg.panel_height = 480; 
      cfg.offset_x     = 0;
      cfg.offset_y     = 0;
      cfg.offset_rotation = 0;
      cfg.dummy_read_pixel = 8;
      cfg.dummy_read_bits  = 1;
      cfg.readable         = true;
      cfg.invert           = false; 
      cfg.rgb_order        = false; 
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
      cfg.pin_int    = 1;
      cfg.bus_shared = true;
      cfg.offset_rotation = 0;

      cfg.spi_host = SPI2_HOST;
      cfg.freq = 2500000;
      cfg.pin_sclk = PIN_TFT_SCK; 
      cfg.pin_mosi = PIN_TFT_MOSI;
      cfg.pin_miso = PIN_TFT_MISO;
      cfg.pin_cs   = 0;

      _touch_instance.config(cfg);
      _panel_instance.setTouch(&_touch_instance);
    }

    // แก้ไข: เติม this-> เพื่อระบุ Scope ให้ชัดเจน
    this->setPanel(&_panel_instance); 
  }
};

LGFX tft;

// ==========================================
// 2. ตั้งค่า LVGL
// ==========================================
#define DRAW_BUF_SIZE (SCREEN_WIDTH * SCREEN_HEIGHT / 10)
static lv_disp_draw_buf_t draw_buf;
static lv_color_t buf[DRAW_BUF_SIZE];

void my_disp_flush(lv_disp_drv_t *disp_drv, const lv_area_t *area, lv_color_t *color_p) {
  uint32_t w = (area->x2 - area->x1 + 1);
  uint32_t h = (area->y2 - area->y1 + 1);

  tft.startWrite(); 
  
  // แก้ไข: ใช้คำสั่ง pushImage จบในบรรทัดเดียว (ทำงานเร็วกว่าด้วย)
  tft.pushImage(area->x1, area->y1, w, h, (uint16_t *)&color_p->full);
  
  tft.endWrite();   

  lv_disp_flush_ready(disp_drv);
}

void my_touchpad_read(lv_indev_drv_t * indev_drv, lv_indev_data_t * data) {
  uint16_t touchX, touchY;
  
  // ให้ LovyanGFX อ่านค่าการสัมผัส
  bool touched = tft.getTouch(&touchX, &touchY);

  if (!touched) {
    data->state = LV_INDEV_STATE_REL; // ปล่อยนิ้ว
  } else {
    data->state = LV_INDEV_STATE_PR;  // กำลังกด
    data->point.x = touchX;
    data->point.y = touchY;
  }
}

// ==========================================
// 3. ฟังก์ชันหลัก (Setup / Loop)
// ==========================================
// ==========================================
// ฟังก์ชันเมื่อปุ่มถูกกด (Event Callback)
// ==========================================
static void btn_event_cb(lv_event_t * e) {
  lv_event_code_t code = lv_event_get_code(e);
  
  if(code == LV_EVENT_CLICKED) {
    Serial.println("ทัชสกรีนทำงาน! ปุ่มถูกกดแล้ว 🎉");
  }
}

// ==========================================
// ฟังก์ชันหลัก (Setup)
// ==========================================
void setup() {
  Serial.begin(115200);

  // 1. เปิดไฟหน้าจอและเริ่มทำงาน LovyanGFX
  pinMode(PIN_TFT_BL, OUTPUT);
  digitalWrite(PIN_TFT_BL, HIGH); 
  
  tft.begin();         
  tft.setRotation(1); 
  
  // 2. เริ่มทำงาน LVGL
  lv_init();
  lv_disp_draw_buf_init(&draw_buf, buf, NULL, DRAW_BUF_SIZE);

  // 3. ลงทะเบียนหน้าจอ
  static lv_disp_drv_t disp_drv;
  lv_disp_drv_init(&disp_drv);
  disp_drv.hor_res = SCREEN_WIDTH;
  disp_drv.ver_res = SCREEN_HEIGHT;
  disp_drv.flush_cb = my_disp_flush;
  disp_drv.draw_buf = &draw_buf;
  lv_disp_drv_register(&disp_drv);

  // 4. ลงทะเบียน Input Driver สำหรับทัชสกรีน
  static lv_indev_drv_t indev_drv;
  lv_indev_drv_init(&indev_drv);
  indev_drv.type = LV_INDEV_TYPE_POINTER;
  indev_drv.read_cb = my_touchpad_read;
  lv_indev_drv_register(&indev_drv);

  // ==========================================
  // 5. สร้าง UI (สร้างปุ่มแค่ครั้งเดียวตรงนี้)
  // ==========================================
  lv_obj_set_style_bg_color(lv_scr_act(), lv_color_hex(0xE0E0E0), LV_PART_MAIN);

  // สร้างปุ่ม
  lv_obj_t * btn = lv_btn_create(lv_scr_act()); 
  lv_obj_set_size(btn, 200, 80);
  lv_obj_align(btn, LV_ALIGN_CENTER, 0, 0);
  
  // ผูก Event ให้ปุ่ม (เมื่อถูกกดจะไปเรียกฟังก์ชัน btn_event_cb)
  lv_obj_add_event_cb(btn, btn_event_cb, LV_EVENT_ALL, NULL); 

  // ใส่ข้อความในปุ่ม
  lv_obj_t * label = lv_label_create(btn);
  lv_label_set_text(label, "Hello LovyanGFX!");
  lv_obj_center(label);
  
  Serial.println("LVGL Setup Done!");
}

void loop() {
  lv_timer_handler();
  delay(5); 
}

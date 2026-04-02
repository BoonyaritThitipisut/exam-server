#include <SPI.h>
#include <TFT_eSPI.h>
#include <lvgl.h>
#include "config.h"

TFT_eSPI tft = TFT_eSPI();

// --- 1. กำหนดขนาด Buffer สำหรับ LVGL v8 ---
#define DRAW_BUF_SIZE (SCREEN_WIDTH * SCREEN_HEIGHT / 10)
static lv_disp_draw_buf_t draw_buf;
static lv_color_t buf[DRAW_BUF_SIZE];

// --- 2. ฟังก์ชันส่งข้อมูลสี (Flush Callback ของ v8) ---
void my_disp_flush(lv_disp_drv_t *disp_drv, const lv_area_t *area, lv_color_t *color_p) {
  uint32_t w = (area->x2 - area->x1 + 1);
  uint32_t h = (area->y2 - area->y1 + 1);

  tft.startWrite(); 
  tft.setAddrWindow(area->x1, area->y1, w, h); 
  
  // โยนข้อมูลสีลงจอ (ดึงค่าจาก color_p)
  tft.pushColors((uint16_t *)color_p, w * h, true); 
  
  tft.endWrite();   

  // บอก LVGL v8 ว่าวาดเสร็จแล้ว
  lv_disp_flush_ready(disp_drv);
}

void setup() {
  Serial.begin(115200);

  // 1. เริ่มต้นหน้าจอ TFT_eSPI
  pinMode(PIN_TFT_BL, OUTPUT);
  digitalWrite(PIN_TFT_BL, HIGH); 
  
  tft.begin();
  tft.setRotation(1); 
  tft.setSwapBytes(true); 

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
  // สร้าง UI (อัปเดตคำสั่งสำหรับ v8)
  // ==========================================
  
  // เปลี่ยนสีพื้นหลัง
  lv_obj_set_style_bg_color(lv_scr_act(), lv_color_hex(0xE0E0E0), LV_PART_MAIN);

  // สร้างปุ่ม (v8 ใช้ lv_btn_create และ lv_scr_act)
  lv_obj_t * btn = lv_btn_create(lv_scr_act()); 
  lv_obj_set_size(btn, 200, 80);
  lv_obj_align(btn, LV_ALIGN_CENTER, 0, 0);

  // ใส่ข้อความลงในปุ่ม
  lv_obj_t * label = lv_label_create(btn);
  lv_label_set_text(label, "Hello LVGL 8!");
  lv_obj_center(label);
  
  Serial.println("LVGL Setup Done!");
}

void loop() {
  // ให้ LVGL จัดการวาดหน้าจอ
  lv_timer_handler();
  delay(5); 
}
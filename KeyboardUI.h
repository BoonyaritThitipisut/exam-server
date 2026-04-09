// KeyboardUI.h
#ifndef KEYBOARD_UI_H   // 🟢 ป้องกันการ include ซ้ำซ้อน (Include Guard)
#define KEYBOARD_UI_H

#include <Arduino.h>    // 🟢 จำเป็นต้องใส่ เพื่อให้รู้จัก String, int, boolean
// #include <TFT_eSPI.h> // ถ้าใช้ไลบรารีจออะไร ให้ include ไว้ที่นี่ด้วย

// ประกาศโครงสร้างปุ่ม
struct TouchButton {
    int x, y, w, h;
    const char* label;
    bool isPressed;
};

// ประกาศชื่อฟังก์ชัน (ยังไม่ต้องเขียนไส้ใน)
void drawKeyboard();
bool isTouched(int tx, int ty, TouchButton btn);
void drawStringThai(int x, int y, const char *text, uint16_t color);

#endif
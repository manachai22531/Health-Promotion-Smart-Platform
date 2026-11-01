# ตัวติดตั้ง Windows v7.65.01

[ดาวน์โหลดตัวติดตั้ง v7.65.01](https://github.com/manachai22531/Health-Promotion-Smart-Platform/raw/refs/heads/installers/v7.65.01/HealthCheck-v7.65.01-PRODUCTION-WINDOWS-INSTALLER.zip)

- หน้าบริษัทตามมอคอัพรุ่น 3: หมายเหตุตรงกลาง สถานะ/แก้ไขปีด้านซ้าย ปุ่มและสถิติด้านขวา สีพื้นแยกปี
- แถบเลือกรายชื่อลูกค้าและปุ่มคำสั่งอยู่บรรทัดเดียว พร้อม sidebar หุบ–กาง
- ลูกค้าเลือกแพ็กเกจหลักตามสิทธิ์ พร้อมราคาและยอดรวมรายการเสริม
- เจ้าหน้าที่บันทึกแทนลูกค้าจากหน้าค้นหาได้ตามสิทธิ์ พร้อม audit ผู้ทำรายการ

ซอร์สเต็ม: [38b9843](https://github.com/manachai22531/Health-Promotion-Smart-Platform/commit/38b984368655234357171b5a75fbb1d2c6ab123b) ใน branch releases/v7.65.01 และ main

ติดตั้ง: สำรองฐานข้อมูล → แตก ZIP ทั้งหมด → เปิด INSTALL-REPAIR.bat ด้วย Administrator → รอ health check → Ctrl+F5 ตรวจ v7.65.01

ผ่าน build, release tests 125 รายการ, Chromium 3 suites และการบันทึกผ่าน HTTP/PostgreSQL โดยใช้ข้อมูลสมมติ ยังไม่ทดสอบ Windows GUI/UAC หรือ HIS โรงพยาบาลจริง

SHA256: `73c40783a511575c3e38504578d0b6a0019b3663c7d1787ae6f9c1c2a004813d`

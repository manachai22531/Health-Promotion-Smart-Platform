# ตัวติดตั้ง Production v7.64.92

จัดปุ่มดาวน์โหลดเทมเพลตใน Patient Demographic ให้เสมอแถว
- ช่องเลือกไฟล์ ช่องเลือกชีต และปุ่มดาวน์โหลด สูงเท่ากัน 44px
- ขอบบนและล่างตรงกันบนจอใหญ่/โน้ตบุ๊ก จอเล็กเรียงเป็นคอลัมน์เดียว
- คงฟังก์ชันค้นด้วยชื่อ–นามสกุลและการตรวจเลือกผู้ป่วยจาก v7.64.91

[ดาวน์โหลดตัวติดตั้ง v7.64.92](https://github.com/manachai22531/Health-Promotion-Smart-Platform/raw/refs/heads/installers/v7.64.92/HealthCheck-v7.64.92-PRODUCTION-WINDOWS-INSTALLER.zip)

แตก ZIP ทั้งหมด → INSTALL-REPAIR.bat → Run as administrator
รอ health check ผ่าน แล้วเปิดเว็บกด Ctrl+F5 ตรวจ v7.64.92

ผ่าน build และ 117 release tests; ตรวจรูปแบบจริงใน Chromium ที่ 1920/1366/1024/430px
ยังไม่ได้รัน GUI/UAC/Robocopy ของตัวติดตั้งบน Windows จริง

SHA256: d3f33fda0dc025374801baa343cd1a2bbe263df8b385524b4f9fa72f7d201301

Branch นี้เก็บเฉพาะตัวติดตั้ง ไม่เปลี่ยน main

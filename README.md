# ตัวติดตั้ง v7.64.92 — Patient Demographic HISGender Hotfix

แก้ Export Excel คอลัมน์ HISGender ว่าง แม้หน้าต่าง HIS แสดง FEMALE โดยใช้ gender_label และ fallback gender ให้ตรงกันทั้งหน้าเว็บและสองชีต Excel

[ดาวน์โหลดตัวติดตั้ง Windows พร้อม hotfix](https://github.com/manachai22531/Health-Promotion-Smart-Platform/raw/refs/heads/installers/v7.64.92-hisgender-hotfix/HealthCheck-v7.64.92-PRODUCTION-WINDOWS-INSTALLER-HISGENDER-FIX.zip)

[ดาวน์โหลด SHA256](https://github.com/manachai22531/Health-Promotion-Smart-Platform/raw/refs/heads/installers/v7.64.92-hisgender-hotfix/HealthCheck-v7.64.92-PRODUCTION-WINDOWS-INSTALLER-HISGENDER-FIX.zip.sha256)

วิธีติดตั้ง: สำรองข้อมูลตามขั้นตอนเดิม → แตก ZIP ทั้งหมด → เปิด INSTALL-REPAIR.bat → อนุญาตสิทธิ์ Administrator → รอ health check ผ่าน → เปิดเว็บ กด Ctrl+F5 แล้ว Export ใหม่

แพ็กเกจนี้ยังระบุเวอร์ชัน v7.64.92 เป็น hotfix สำหรับติดตั้ง/ซ่อมผ่าน INSTALL-REPAIR.bat ไม่ใช้ Update Center ที่ต้องการหมายเลขเวอร์ชันใหม่กว่า

ซอร์สฐาน: installers/v7.64.92 commit 003692ab76b2c843e32cb73777bc6422aba704ea ไม่ใช้ main

ผลทดสอบ: build และ release tests ผ่าน 117 รายการ; Chromium regression ตรวจไฟล์ Excel จริงผ่านก่อนและหลังตรวจเลือกผู้ป่วย ไม่ได้ทดสอบ GUI/UAC ตัวติดตั้งบน Windows จริง

SHA256: 4947d4605f09810569842937925c1056bf650e94bdb260a738ab9bf92e5927c9

ซอร์สที่แก้, patch และ regression test อยู่ใน patient-demographic-hisgender-fix/

---

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

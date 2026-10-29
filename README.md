# ตัวติดตั้ง Production v7.64.90 — Patient Demographic

เพิ่มแท็บ DataCenter > Patient Demographic ต่อจาก v7.64.89
- อัปโหลด Excel เลือกชีต จับคู่คอลัมน์ ID, Passport, FirstName, LastName, DOB, Gender
- ค้น HIS ตาม ID → Passport → ชื่อ+นามสกุล+วันเกิด+Gender ไปขั้นถัดไปเมื่อไม่พบเท่านั้น
- พบหลายคนจะไม่เลือกคนแรกให้; พบแต่ข้อมูลต่างกันจะแสดงให้ตรวจสอบ
- รองรับ ID ที่ขึ้นต้นด้วย 0, วันเกิด พ.ศ./ค.ศ., Excel date serial (1900/1904)
- ดูรายละเอียด กรองผล หยุดค้นหา และ Export Excel พร้อม HN/วิธีจับคู่/สถานะ
- มีเทมเพลตให้ดาวน์โหลด ใช้การเชื่อมต่อ Patient Package/Radiology เดิมใน System & API
- ค้นหาแบบ read-only ไม่เขียน HIS และไม่บันทึกทับรายชื่อบริษัท
- ใช้สิทธิ์ DataCenter + customerSensitiveView

[ดาวน์โหลด ZIP ตัวติดตั้ง v7.64.90](https://github.com/manachai22531/Health-Promotion-Smart-Platform/raw/refs/heads/installers/v7.64.90/HealthCheck-v7.64.90-PRODUCTION-WINDOWS-INSTALLER.zip)

ติดตั้ง: แตก ZIP ทั้งหมด → INSTALL-REPAIR.bat → Run as administrator
รอ health check ผ่าน จากนั้นเปิดเว็บกด Ctrl+F5 ตรวจ v7.64.90
ดูรายละเอียด PATIENT-DEMOGRAPHIC-README-TH.txt ภายใน ZIP

ผ่าน build และ 136 tests (112 release/unit + 14 PostgreSQL HIS fixture/HTTP + 10 Chromium/Excel)
ยังไม่ได้ทดสอบกับ HIS โรงพยาบาลจริง หรือ GUI/UAC/VBS/Robocopy บน Windows จริง

SHA256: 98bdae77141666d866b7e08b3e15ae27c6595539cd56ad6993f06ae024897427

Branch นี้เก็บเฉพาะแพ็กเกจตัวติดตั้ง ไม่เปลี่ยน main

# ตัวติดตั้ง Production v7.64.99 — รวมงานและมอคอัพล่าสุด

[ดาวน์โหลดตัวติดตั้ง v7.64.99](https://github.com/manachai22531/Health-Promotion-Smart-Platform/raw/refs/heads/installers/v7.64.99/HealthCheck-v7.64.99-PRODUCTION-WINDOWS-INSTALLER.zip)

- สีระยะเวลาตรวจตรงกับหน้าค้นหา 5 สถานะ
- หัวตาราง 2 แถวตรึงขณะเลื่อนลง พร้อมคอลัมน์ตรึงด้านซ้าย
- ช่องค้นหาสั้นลง รายการ Booking มีแถวเต็มความกว้างสำหรับชื่อ/จำนวนหลายโครงการ
- กล่องเงื่อนไขพื้นขาว แถบแพ็กเกจและปุ่มลูกค้ารวมแถวเดียว
- พื้นหลังกลุ่มข้อมูลอ่อนลง ขอบเปลี่ยนตามธีม คงสีสถานะและรายการตรวจ
- รวมตัวแก้ก่อนหน้าทั้งหมดจาก v7.64.98

สำรองข้อมูล → แตก ZIP ทั้งหมด → เปิด INSTALL-REPAIR.bat → อนุญาต Administrator → รอ health check ผ่าน → Ctrl+F5 ตรวจ v7.64.99

Build และ release tests 118 รายการผ่าน; Chromium regression 6 รายการผ่าน รวม 100 แถว, Booking ชื่อยาว, 3 ธีม, จอ 1920/1366/430px
ยังไม่ได้ทดสอบ Windows GUI/UAC หรือ HIS โรงพยาบาลจริง

SHA256: bb20fafcf2673182592762907a0358ef0ca908d9b7dd7cad5b8e13a7b632f357

ซอร์สเต็มใน ZIP และ patch/ผลทดสอบใน source-changes-v7.64.99/
[นโยบายรวมซอร์สกลับ main ในรอบ 7.65.00](RELEASE-POLICY.md) — รุ่นนี้ยังไม่แก้ main

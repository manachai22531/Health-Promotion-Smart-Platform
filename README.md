# ตัวติดตั้ง Production v7.64.98 — รวมงานแก้และมอคอัพ

[ดาวน์โหลดตัวติดตั้ง v7.64.98](https://github.com/manachai22531/Health-Promotion-Smart-Platform/raw/refs/heads/installers/v7.64.98/HealthCheck-v7.64.98-PRODUCTION-WINDOWS-INSTALLER.zip)

- หน้าบริษัทแบบกระชับ ระยะเวลาตรวจต่อท้ายปี ขยายข้อมูลรายปี/Booking ลดช่องว่างเมื่อไม่มี Booking
- แก้แถบเครื่องมือและปุ่มซ้อนในตาราง 100 แถว ปุ่มคัดลอกอยู่ในกลุ่มเดียวกับปุ่มจัดการ
- พื้นหลังแยกผู้ป่วย 6 ส่วนตามมอคอัพ คงสีสถานะ/รายการตรวจและปุ่มเดิม
- คงคัดลอกข้อมูลถึง Company รวมลำดับ, คอลัมน์ตรึงเลือก/จัดการ/HN/VN, ลำดับต่อ VN ไม่ตรึง, ฟอร์มแก้ไขเต็มจอ
- รวม HISGender Excel, หน้าลูกค้าแบบอ่านอย่างเดียว, แถบลูกค้าแสดงตลอด, ตัวแก้ปุ่มล้างซ้ำ และชื่อพิมพ์สรุปรายการตรวจ

สำรองข้อมูล → แตก ZIP ทั้งหมด → เปิด INSTALL-REPAIR.bat → อนุญาต Administrator → รอ health check ผ่าน → Ctrl+F5 ตรวจ v7.64.98

Build, release tests 118 รายการ และ Chromium browser regressions 6 รายการผ่าน รวมจอ 1920/1366/430px และตาราง 100 แถวหลายความหนาแน่น
ยังไม่ได้ทดสอบ Windows GUI/UAC หรือ HIS โรงพยาบาลจริง

SHA256: dcf55b261ee4cb008fb5b2eb5816704d536658e9316f2953e6606b1f4e03ffea

ฐาน installers/v7.64.97 ไม่ใช้ main; ซอร์สเต็มอยู่ใน ZIP; source-changes-v7.64.98/ มีไฟล์ที่แก้ patch และผลทดสอบ

[นโยบายรวมซอร์สกลับ main ในรอบ 7.65.00](RELEASE-POLICY.md)

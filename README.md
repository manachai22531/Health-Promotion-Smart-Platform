# ตัวติดตั้ง Windows v7.65.00 — รวมงานทั้งหมดและแถบซ้ายหุบ–กาง

[ดาวน์โหลดตัวติดตั้ง v7.65.00](https://github.com/manachai22531/Health-Promotion-Smart-Platform/raw/refs/heads/installers/v7.65.00/HealthCheck-v7.65.00-PRODUCTION-WINDOWS-INSTALLER.zip)

- ใช้มอคอัพ HTML แบบ 3 ในโปรแกรมจริง: แถบค้นหา/Booking ด้านซ้ายหุบ–กางได้ ขยายพื้นที่ตารางและคงข้อมูลการค้นหา Booking ปลายทางและรายการที่เลือก
- แก้รายการที่รับจากลูกค้าแล้วได้ พร้อมอัปเดต A4 คงรายการพนักงาน/แพ็กเกจหลัก และเงื่อนไขสิทธิ์/OrderHIS/ปิดค่าใช้จ่ายเดิม
- รวม hotfix ทุกชุดจนถึง v7.64.99 รวม HISGender Excel, CSV, หัวตารางตรึง, ปุ่มไม่ซ้อน, หน้าบริษัท/ปีแบบกระชับ, ระยะเวลาตรวจ, พื้นสีแยกกลุ่ม/ขอบตามธีม, หน้าลูกค้า และชื่อปุ่มพิมพ์

ซอร์สเต็มรวมกลับ main ในรอบ v7.65.00 ตามที่กำหนด; development source commit [228917c](https://github.com/manachai22531/Health-Promotion-Smart-Platform/commit/228917c) จาก installer v7.64.99 ไม่ใช้ซอร์ส main v7.64.00 มาทับฐานใหม่

ติดตั้ง: สำรองข้อมูล → แตก ZIP ทั้งหมด → เปิด INSTALL-REPAIR.bat → อนุญาต Administrator → รอ health check ผ่าน → Ctrl+F5 ตรวจ v7.65.00

ตรวจ build, release 123 tests และ Chromium 7 suites ผ่าน; ตรวจ ZIP และ manifest SHA-256 ครบทุกไฟล์ ยังไม่รัน Windows GUI/UAC หรือ HIS โรงพยาบาลจริงใน Linux

SHA256: `e5326acff20f8fc9fe566b32faf9929514996e203b4d68629205fc8f39c17b20`

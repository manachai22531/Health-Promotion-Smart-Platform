# ตัวติดตั้ง Production v7.64.94

แก้ปุ่มเปิดหน้าลูกค้ากดไม่ไปจาก v7.64.93 โดยใช้ลิงก์เปิดแท็บจริงแทน window.open ที่ชนกับฟังก์ชัน modal ในแอป

[ดาวน์โหลดตัวติดตั้ง v7.64.94](https://github.com/manachai22531/Health-Promotion-Smart-Platform/raw/refs/heads/installers/v7.64.94/HealthCheck-v7.64.94-PRODUCTION-WINDOWS-INSTALLER.zip)

สำรองข้อมูล → แตก ZIP ทั้งหมด → เปิด INSTALL-REPAIR.bat → อนุญาต Administrator → รอ health check ผ่าน → Ctrl+F5 ตรวจ v7.64.94

คงข้อมูลจริงแบบอ่านอย่างเดียวตามสิทธิ์เจ้าหน้าที่ แถบแสดงตลอด และรวม HISGender Excel hotfix

ทดสอบ build, release tests 118 รายการ และ Chromium คลิกเปิดแท็บจริงผ่าน รวมกรณี window.open ถูกฟังก์ชัน modal ทับ ไม่ได้ทดสอบ Windows GUI/UAC จริง

SHA256: 664be1b62e5449798be2a5a59b7d20a72c68e2f0b6493d314e60dbc85c1bb767

ฐานซอร์ส installers/v7.64.93 ไม่ใช้ main ซอร์สเต็มอยู่ใน ZIP และ patch อยู่ใน source-changes-v7.64.94/

[นโยบายรวมซอร์สกลับ main ในรอบ 7.65.00](RELEASE-POLICY.md)

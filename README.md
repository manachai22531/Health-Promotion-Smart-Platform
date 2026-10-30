# ตัวติดตั้ง Production v7.64.93

แถบข้อมูลแพ็กเกจลูกค้าแสดงตลอด พร้อมปุ่มเปิดข้อมูลจริงแบบลูกค้าสำหรับเจ้าหน้าที่ (อ่านอย่างเดียว) และจำนวนรายการที่ลูกค้าเลือก รวม HISGender Excel hotfix

[ดาวน์โหลดตัวติดตั้ง v7.64.93](https://github.com/manachai22531/Health-Promotion-Smart-Platform/raw/refs/heads/installers/v7.64.93/HealthCheck-v7.64.93-PRODUCTION-WINDOWS-INSTALLER.zip)

[ดาวน์โหลด checksum SHA256](https://github.com/manachai22531/Health-Promotion-Smart-Platform/raw/refs/heads/installers/v7.64.93/HealthCheck-v7.64.93-PRODUCTION-WINDOWS-INSTALLER.zip.sha256)

สำรองข้อมูลตามขั้นตอนเดิม → แตก ZIP ทั้งหมด → INSTALL-REPAIR.bat → อนุญาต Administrator → รอ health check ผ่าน → เปิดเว็บ Ctrl+F5 ตรวจ v7.64.93

แถบแสดงแม้ยังไม่ยืนยันการตรวจหรือไม่มีรายการ (0) พนักงานที่มีสิทธิ์ค้นหาและดูข้อมูลส่วนบุคคลเปิดหน้าลูกค้าของรายนั้นได้ ไม่สร้าง session ลูกค้า ไม่ส่งรายการแทนลูกค้า

QR ลูกค้ายังคงต้องยืนยันการตรวจและตั้งค่า URL ที่มือถือเข้าถึงได้ ตามเงื่อนไขเดิม

ฐานซอร์ส: installers/v7.64.92 commit 003692ab76b2c843e32cb73777bc6422aba704ea พร้อม HISGender hotfix ไม่ใช้ main

ทดสอบ build, release tests 118 รายการ และ Chromium regression 2 รายการผ่าน ตรวจ startup/ฐานข้อมูลและปฏิเสธ anonymous preview ผ่าน ยังไม่ได้ทดสอบ GUI/UAC บน Windows จริงหรือ HIS โรงพยาบาลจริง

SHA256: 7b02ce0754f2e00e4f845122419e426b490db21fc4a53be2625ed33cce8cde44

ซอร์สที่แก้และ patch: source-changes-v7.64.93/ ส่วนซอร์สเต็มอยู่ใน ZIP

[นโยบายรวมซอร์สพร้อม hotfix กลับ main ในรอบ 7.65.00](RELEASE-POLICY.md)

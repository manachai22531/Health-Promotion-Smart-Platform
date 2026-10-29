# ตัวติดตั้ง Production v7.64.89

รุ่นต่อจาก v7.64.88 แก้หน้าสร้างโครงการแสดงไม่ครบจากการขยาย body 110%
- หัวหน้าต่าง ปุ่มปิด และปุ่มบันทึกอยู่ภายในจอ
- เลื่อนเฉพาะส่วนฟอร์ม ไม่เลื่อนหน้าหลักด้านหลัง
- ฟอร์มคอลัมน์เดียวบนจอเล็ก
- คงฟังก์ชันบริษัท/ปี ประวัติไฟล์นำเข้า และระบบเดิมของ v7.64.88

[ดาวน์โหลด ZIP ตัวติดตั้ง](https://github.com/manachai22531/Health-Promotion-Smart-Platform/raw/refs/heads/installers/v7.64.89/HealthCheck-v7.64.89-PRODUCTION-WINDOWS-INSTALLER.zip)

ติดตั้ง: แตก ZIP ทั้งหมด → คลิกขวา INSTALL-REPAIR.bat → Run as administrator
รอจน health check ผ่าน จากนั้นเปิดเว็บแล้วกด Ctrl+F5 ตรวจรุ่น v7.64.89

ผ่าน build, 102 release tests และ Chromium layout tests 6 ข้อ (5 ขนาดหน้าจอ พร้อมตรวจคืนขนาดหน้าหลัก)
ยังไม่ได้รัน GUI/UAC/Robocopy ของตัวติดตั้งบน Windows จริง

SHA256: b0118a71b255a9a9c9efd5f7c6592abbe94ba5819df3ec0f111fe1842780e6a8

Branch นี้เก็บเฉพาะแพ็กเกจตัวติดตั้ง ไม่เปลี่ยน branch main

# ตัวติดตั้ง Production v7.64.95

แก้ปุ่ม × ล้างคำค้นซ้ำในค้นหาบริษัทและค้นหารายชื่อลูกค้า ให้เหลือช่องละตัว ซ่อนปุ่ม native เฉพาะช่องที่มี custom clear อยู่แล้ว คงปุ่มล้างของ browser ในช่องอื่น

[ดาวน์โหลดตัวติดตั้ง v7.64.95](https://github.com/manachai22531/Health-Promotion-Smart-Platform/raw/refs/heads/installers/v7.64.95/HealthCheck-v7.64.95-PRODUCTION-WINDOWS-INSTALLER.zip)

สำรองข้อมูล → แตก ZIP ทั้งหมด → เปิด INSTALL-REPAIR.bat → อนุญาต Administrator → รอ health check ผ่าน → Ctrl+F5 ตรวจ v7.64.95

คงตัวแก้ปุ่มเปิดหน้าลูกค้า v7.64.94 และ HISGender Excel hotfix

Build และ release tests 118 รายการผ่าน รวม Chromium regression ตรวจ native clear จริง การล้างค่า focus และจอเล็ก ผ่าน ทดสอบเดิมบน CSS v7.64.94 พบอาการซ้ำตามที่แจ้ง ยังไม่ได้ทดสอบตัวติดตั้ง Windows GUI/UAC จริง

SHA256: 7dd1ed80306128ea164a86be9c321fc6b9d8d732d0cc94ab0598780753d67b39

ซอร์สเต็มอยู่ใน ZIP และไฟล์ที่แก้พร้อม patch อยู่ใน source-changes-v7.64.95/

[นโยบายรวมซอร์สกลับ main ในรอบ 7.65.00](RELEASE-POLICY.md)

# Health Check Smart Search — v7.65.00

[ดาวน์โหลดตัวติดตั้ง Windows v7.65.00](https://github.com/manachai22531/Health-Promotion-Smart-Platform/raw/refs/heads/installers/v7.65.00/HealthCheck-v7.65.00-PRODUCTION-WINDOWS-INSTALLER.zip)

รวมซอร์สแอปพลิเคชันเต็มจาก installer v7.64.99 พร้อม hotfix ทั้งหมดตั้งแต่ v7.64.92 และงานที่ยังไม่ออกตัวติดตั้ง ตาม RELEASE-POLICY.md

- มอคอัพแบบ 3 ใช้งานจริง: แถบค้นหาและ Booking ด้านซ้ายหุบ–กางได้ เพื่อขยายตาราง ข้อมูลการค้นหาและรายการที่เลือกยังคงอยู่
- แก้ไขรายการที่รับจากลูกค้าแล้วได้ โดยคงรายการเดิมของพนักงาน แพ็กเกจหลัก สิทธิ์ และเงื่อนไขทางคลินิก บันทึกแล้วอัปเดต A4
- รวมงานก่อนหน้า: HISGender Excel, CSV, หัวตารางตรึง, ปุ่มไม่ซ้อน, บริษัท/ปีแบบกระชับ, ระยะเวลาตรวจ, สีพื้น/ขอบตามธีม, หน้าลูกค้า และชื่อปุ่มพิมพ์

สำรองข้อมูล → แตก ZIP ทั้งหมด → เปิด INSTALL-REPAIR.bat → อนุญาต Administrator → รอ health check ผ่าน → Ctrl+F5 และตรวจ v7.65.00

พัฒนา: `npm ci`, `npm run build`, `npm run test:release` สำหรับชุดตรวจรุ่นปัจจุบัน (ไฟล์ release tests เก่ายังคงอยู่เพื่ออ้างอิงรุ่นเดิม)

ตรวจ build, release 123 tests และ Chromium 7 suites ผ่าน รายละเอียดใน TEST-RESULTS-v7.65.00.txt ยังไม่ได้ทดสอบ Windows GUI/UAC และ HIS จริงในสภาพแวดล้อม Linux นี้

บรรจุตัวติดตั้ง: `python3 tools/build-windows-package.py --output-dir /path/to/output` ตรวจ manifest SHA-256 ของทุกไฟล์ใน ZIP อัตโนมัติ ไม่บรรจุฐานข้อมูล .env/API keys, logs หรือ node_modules

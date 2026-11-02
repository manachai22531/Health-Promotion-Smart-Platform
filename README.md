# ตัวติดตั้ง Windows v7.65.04

[ดาวน์โหลดตัวติดตั้ง v7.65.04](https://github.com/manachai22531/Health-Promotion-Smart-Platform/raw/refs/heads/installers/v7.65.04/HealthCheck-v7.65.04-PRODUCTION-WINDOWS-INSTALLER.zip)

- หน้า System & API ใหม่ทั้งหน้าแบบเมนูซ้าย ตามแบบ 1 ที่อนุมัติ รวม API, ฐานข้อมูล, SQL, External API, URL ลูกค้า, เมนูหลัก, ระบบ, Backup/Update และ Log
- แก้/ทดสอบ/เปิดใช้ SQL HIS ได้ 9 กลุ่มย่อย พร้อม version, เหตุผล, Log ก่อน–หลังและผลรันจริง ต้องมี apiManage และปลดล็อกด้วยรหัสผ่าน ทดสอบสำเร็จก่อนบันทึก และย้อนกลับ SQL เดิมได้
- แถว Booking จัดพื้นที่วันที่ / ชื่อและรหัส / EMR ให้ตรงแนวข้อมูลรายปีทุกแถว
- รวมงานเดิมถึง 7.65.03 ทั้งแพ็กเกจหลัก หน้าลูกค้า บันทึกแทนลูกค้า PDF และหัวข้อ 14

ซอร์สเต็ม: [32f5358](https://github.com/manachai22531/Health-Promotion-Smart-Platform/commit/32f53583e765866a88d68e32e33faaeb11b6f5a8)

ติดตั้ง: สำรองฐานข้อมูล → แตก ZIP ทั้งหมด → เปิด INSTALL-REPAIR.bat ด้วย Administrator → รอ health check → Ctrl+F5 ตรวจ v7.65.04

SQL: ตั้งค่าฐานข้อมูล HIS เดิมก่อน เลือกกลุ่มงานในเมนู SQL ทดสอบด้วยค่าจริงและเหตุผล แล้วจึงบันทึกเปิดใช้ คงพารามิเตอร์/คอลัมน์ที่กำหนดไว้ Log ไม่เก็บรหัสผ่าน ค่าพารามิเตอร์ หรือค่าผลข้อมูลผู้ป่วย

ผ่าน build, release 130 tests, Chromium 5 suites, PostgreSQL integration และ HTTP login/config-unlock smoke ชุดตรวจ PDF layout เก่า 5 จุดมี baseline failure เดิม ดู TEST-RESULTS-v7.65.04.txt ยังไม่ได้ทดสอบติดตั้งผ่าน Windows GUI/UAC หรือเชื่อมต่อ HIS โรงพยาบาลจริง

SHA256: `e8152407e105dad8c94bf49cb1a5354a413279281c24fd48b904b55db829510b`

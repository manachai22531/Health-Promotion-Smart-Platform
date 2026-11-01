# Health Check Smart Search — v7.65.01

[ดาวน์โหลดตัวติดตั้ง Windows v7.65.01](https://github.com/manachai22531/Health-Promotion-Smart-Platform/raw/refs/heads/installers/v7.65.01/HealthCheck-v7.65.01-PRODUCTION-WINDOWS-INSTALLER.zip)

รวมงานที่อนุมัติจากมอคอัพรุ่น 3 และปรับหน้าลูกค้าให้เลือกแพ็กเกจหลักตามสิทธิ์ พร้อมบันทึกแทนลูกค้าจากหน้าค้นหาได้

- หน้าบริษัท: ปี/ช่วงตรวจด้านซ้าย สถานะและปุ่มแก้ไขใต้ปี หมายเหตุเด่นตรงกลาง ปุ่มและสถิติด้านขวา สีพื้นอ่อนแยกปี
- หน้ารายชื่อลูกค้า: กลุ่มเลือกทั้งหมดอยู่ต้นแถบคำสั่งบรรทัดเดียว พร้อม sidebar ค้นหา/Booking หุบ–กางได้
- หน้าลูกค้า: เลือกแพ็กเกจหลักเมื่อยังไม่มี โดยอิงโปรแกรมพนักงานในเอกสารรายปีหรือ Booking แสดงราคาแพ็กเกจหลักและยอดรวมรายการเสริม
- เจ้าหน้าที่บันทึกแทนลูกค้าได้ตามสิทธิ์ customerEdit พร้อมประวัติผู้ทำรายการ ยังตรวจราคาปัจจุบันและข้อจำกัด OrderHIS/ปิดค่าใช้จ่าย
- แก้การแจ้งเตือนบันทึกเอกสารรายปี: พาไปช่องเบอร์โทรเจ้าหน้าที่ขายที่ผิดรูปแบบเพื่อแก้ไขได้ทันที

ติดตั้ง: สำรองฐานข้อมูล → แตก ZIP ทั้งหมด → เปิด INSTALL-REPAIR.bat ด้วย Administrator → รอ health check → Ctrl+F5 ตรวจ v7.65.01

พัฒนา: `npm ci`, `npm run build`, `npm run test:release`

รายละเอียด: RELEASE-v7.65.01-CHANGES.txt และ TEST-RESULTS-v7.65.01.txt
ผ่าน release 125 tests, Chromium 3 suites และ PostgreSQL integration test ยังไม่ทดสอบ Windows GUI/UAC และ HIS จริง

บรรจุตัวติดตั้ง: `python3 tools/build-windows-package.py --output-dir /path/to/output`

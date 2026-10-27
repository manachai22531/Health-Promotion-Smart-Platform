# ตัวติดตั้ง Production v7.64.85

เพิ่มปุ่มคัดลอกเฉพาะโค้ด Payor และ Agreement ข้างรหัส คลิกรหัสหรือไอคอนเพื่อคัดลอกเฉพาะรหัส รวมรหัสที่มีขีด เช่น 1100000915-1 ปุ่มคัดลอกทั้งหมดด้านขวายังคัดลอกรหัสและชื่อ

รวมงานทั้งหมดจาก v7.64.84: รายงานจากปุ่มพิมพ์ด้านหน้า/ด้านในตรงกัน, แยก Payor/Agreement พร้อมรหัส, ซ่อน Office จากหน้าสรุปและคง Location, พับ–เปิดรายการภายในแพคเกจ และงานก่อนหน้า
QR และอายุลิงก์คงเดิม

ติดตั้ง: แตก ZIP ทั้งหมด → INSTALL-REPAIR.vbs → อนุญาต UAC → รอ Complete SUCCESS → เปิดเว็บแล้ว Ctrl+F5 ตรวจ v7.64.85
ห้ามเปิดตัวติดตั้งซ้อนกัน

ตรวจสอบ: build, 80 release tests, Chromium clipboard values/keyboard/mobile/ชื่อจาก Master, PostgreSQL อัปเกรด v7.64.84→v7.64.85 พร้อมรักษาข้อมูล/รหัสผ่าน/นโยบาย/การตั้งค่า และ login/browser/API/restart
ยังไม่ได้ทดสอบ GUI/UAC/VBS/Task Scheduler และเครื่องพิมพ์บน Windows เครื่องจริง

Installer SHA256: `fc3c67b3fb6c7797f8681b44ed3049c4f71f2799b1e65ea06690309c624c7aec`

This branch contains installer artifacts only.

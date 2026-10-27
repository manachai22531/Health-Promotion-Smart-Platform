# ตัวติดตั้ง Production v7.64.83

เพิ่มการพับ–เปิดรายการภายในแพคเกจตรวจสุขภาพหลักฝั่งซ้าย เริ่มต้นพับไว้ แสดงหัวข้อและจำนวนรายการ เปิดเมื่อแก้ประเภทหรือสถานี พับกลับแล้วคงค่าที่แก้ไว้ รองรับคีย์บอร์ด มือถือ และสิทธิ์อ่านอย่างเดียว

PDF/A4 และ QR คงเดิม ไม่มีการแก้อายุลิงก์หรือระบบ QR ในรุ่นนี้ รวมงานเดิมทั้งหมดจาก v7.64.82

วิธีติดตั้ง: แตก ZIP ทั้งหมด → INSTALL-REPAIR.vbs → อนุญาต UAC → รอ Complete SUCCESS → เปิดเว็บแล้ว Ctrl+F5 ตรวจ v7.64.83
ห้ามเปิดตัวติดตั้งซ้อนกัน

ตรวจสอบ: TypeScript build, 77 release tests, Chromium actual renderer/production CSS, พับ–เปิด/คงค่าประเภทและสถานี/สิทธิ์/มือถือ/PDF เดิม และ PostgreSQL อัปเกรด v7.64.82→v7.64.83 พร้อมตรวจข้อมูลและ credentials/settings เดิม
ยังไม่ได้ทดสอบ GUI/UAC/VBS/Task Scheduler และเครื่องพิมพ์บน Windows เครื่องจริง

Installer SHA256: `25be790c8003dcab40f488d3983ef8b33cc461c93f9020abf2405cb6714162e4`

This branch contains installer artifacts only.

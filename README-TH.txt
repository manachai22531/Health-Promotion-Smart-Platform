# ตัวติดตั้ง Production v7.64.87

เพิ่มหน้าสถานะคำสั่ง HIS พร้อมเลขอ้างอิง ขั้นตอน เวลารอ ประวัติ และปุ่มตรวจสอบผล ตรวจผลทุก 10 วินาทีขณะเปิดหน้าต่าง
OpenVisit กู้ VN จากคำตอบรับเดิมเมื่อ HIS ยืนยัน HN/VN/Location ตรงกัน ไม่เปิด Visit ซ้ำ เปิดให้ลองใหม่เฉพาะกรณีปลอดภัย ผลไม่ชัดเจนคงล็อกไว้
บันทึกคำขอให้ผู้ดูแลตรวจสอบในประวัติเคสพร้อมเลขอ้างอิง ไม่มีการส่งข้อความภายนอกอัตโนมัติ
แก้เลือก Booking แล้วไม่พบ และรองรับผู้ป่วยไม่มี Booking โดยผูกเข้าโครงการที่เลือกเมื่อยืนยัน ตรวจบริษัท/ปี/สิทธิ์และไม่สร้างซ้ำ
คงงานรุ่นก่อนรวมรีวิวเล่ม/PDF/Gemini และ QR/อายุลิงก์ตามเดิม

ติดตั้ง: แตก ZIP ทั้งหมด → INSTALL-REPAIR.vbs → รอ Complete SUCCESS → เปิดเว็บ Ctrl+F5 ตรวจ v7.64.87
ห้ามเปิดตัวติดตั้งซ้อนกัน

ผ่าน build และ 102 release tests; PostgreSQL upgrade v7.64.86→v7.64.87 รักษาข้อมูลและรหัสผ่าน; actual server + HIS จำลอง + Chromium รวมมือถือ; PowerShell syntax/BOM 22 scripts; ZIP CRC และ 817 payload hashes
ไม่ได้เรียก HIS โรงพยาบาลจริง และยังไม่ได้ทดสอบ Windows GUI/UAC/VBS หรือเครื่องพิมพ์จริง

SHA256: 85057cbc6a68e88d9e50b17bf2fd1b0b0b07cb50f483be4fd19c02abcec32fc6

This branch contains installer artifacts only.

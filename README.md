# ตัวติดตั้ง Production v7.64.91 — ค้น Patient Demographic ด้วยชื่อ–นามสกุล

รุ่นต่อจาก v7.64.90 แก้ให้ใช้ Excel ที่มีแค่ชื่อและนามสกุลได้
- ไม่บังคับวันเกิดและ Gender; ถ้าระบุจะใช้ช่วยกรองเสมอ ไม่ละทิ้งเงื่อนไขที่กรอก
- ยังค้น ID ก่อน ตามด้วย Passport แล้วชื่อ–นามสกุล
- ผลจากชื่ออย่างเดียวต้องตรวจเลือกผู้ป่วย แม้พบคนเดียว ไม่เลือก HN ให้อัตโนมัติ
- กดดูข้อมูล HIS → เลือกผู้ป่วยรายนี้ → ตรวจ HN/ชื่อ/วันเกิด/Gender แล้วกดยืนยัน
- Export มี CandidateHN เพื่อใช้ตรวจสอบ; HN ที่ยืนยันจะมีหลังเลือก และมีชีตตรวจเลือกแล้ว
- ไม่แก้ไขหรือเขียนข้อมูล HIS; คงระบบเดิม v7.64.90

[ดาวน์โหลดตัวติดตั้ง v7.64.91](https://github.com/manachai22531/Health-Promotion-Smart-Platform/raw/refs/heads/installers/v7.64.91/HealthCheck-v7.64.91-PRODUCTION-WINDOWS-INSTALLER.zip)

แตก ZIP ทั้งหมด → INSTALL-REPAIR.bat → Run as administrator
รอ health check ผ่าน เปิดเว็บแล้วกด Ctrl+F5 ตรวจ v7.64.91

ผ่าน build และ 145 tests (117 release/unit + 16 HIS fixture/HTTP + 12 Chromium/Excel)
ทดสอบไฟล์ที่แนบว่าอ่านและส่งค้นชื่อได้ครบ 24 รายชื่อกับ HIS จำลอง ไม่ได้ยืนยันข้อมูลผู้ป่วยกับ HIS โรงพยาบาลจริง
ไม่ได้รัน GUI/UAC/VBS/Robocopy บน Windows จริง

SHA256: 39b37578ceb904f8f91601b876faa7bb38c8bf2a8eda0fec39b96f4e5820e726

Branch นี้เก็บเฉพาะตัวติดตั้ง ไม่เปลี่ยน main

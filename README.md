# ตัวติดตั้ง Windows v7.65.03

[ดาวน์โหลดตัวติดตั้ง v7.65.03](https://github.com/manachai22531/Health-Promotion-Smart-Platform/raw/refs/heads/installers/v7.65.03/HealthCheck-v7.65.03-PRODUCTION-WINDOWS-INSTALLER.zip)

- แก้ข้อความรายละเอียดแพทย์/พยาบาลและต้อนรับ/การเงินให้แสดงตรงแถวใน PDF
- เพิ่มหัวข้อ 14 หมายเหตุข้อมูลรายปี พร้อมบันทึกแยกหัวข้อและแสดงใน PDF
- ย้ายรายละเอียดเอกสารแนบท้ายไปต้นกล่องเอกสารแนบ พร้อมปุ่มบันทึก
- เพิ่มช่องรายละเอียด / เงื่อนไขเพิ่มเติมในหัวข้อ 10 บัญชีลูกหนี้
- รวมความสามารถเดิมของ v7.65.02 ครบ

ซอร์ส: [c29916c](https://github.com/manachai22531/Health-Promotion-Smart-Platform/commit/c29916cfd637891864e2db83ebb6d53d9172aaad)

สำรองฐานข้อมูล → แตก ZIP ทั้งหมด → เปิด INSTALL-REPAIR.bat ด้วย Administrator → รอ health check → Ctrl+F5 ตรวจ v7.65.03

ผ่าน build, release 128 tests และ Chromium 2 suites; ชุดตรวจ layout เก่า 5 จุดยังล้มเหลวเหมือนฐานเดิม ดู TEST-RESULTS-v7.65.03.txt ยังไม่ทดสอบ Windows GUI/UAC และ HIS จริง

SHA256: `867f40d18fd0fb2271f78de7be867ef79062dfd3534e06e9e2655cf634ccffcb`

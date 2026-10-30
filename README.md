# ตัวติดตั้ง Production v7.64.97

รวมงานมอคอัพที่อนุมัติ:
- คัดลอกข้อมูลแถวถึง Company/Year คั่นด้วย , รวมลำดับ ไม่รวมปุ่ม/checkbox และไม่ดึงข้อมูลที่ซ่อนตามสิทธิ์
- เครื่องมือรายชื่อลูกค้ากระชับขึ้น ย้ายจัดการมาหน้าสุดและตรึง เลือก/จัดการ/HN/VN
- ลำดับอยู่ถัดจาก VN เลื่อนได้ ไม่ตรึง
- เพิ่ม/แก้ไขลูกค้าเต็มจอ หัวข้อและปุ่มบันทึกอยู่ประจำที่
- ระยะเวลาตรวจในคอลัมน์ปีของบริษัท ใช้วันเริ่ม/สิ้นสุดของบริษัท/ปี ไม่ใช้วัน Booking

[ดาวน์โหลดตัวติดตั้ง v7.64.97](https://github.com/manachai22531/Health-Promotion-Smart-Platform/raw/refs/heads/installers/v7.64.97/HealthCheck-v7.64.97-PRODUCTION-WINDOWS-INSTALLER.zip)

สำรองข้อมูล → แตก ZIP ทั้งหมด → เปิด INSTALL-REPAIR.bat → อนุญาต Administrator → รอ health check ผ่าน → Ctrl+F5 ตรวจ v7.64.97

ฐานซอร์ส installers/v7.64.96 รวมตัวแก้เดิมทั้งหมด ไม่ใช้ main
Build, release tests 118 รายการ และ Chromium regressions 4 รายการผ่าน (รวมจอ 1920/1366/430px) ยังไม่ได้ทดสอบ Windows GUI/UAC หรือ HIS โรงพยาบาลจริง

SHA256: 42a7d76d0eec08b0ab1e4a034f99203d57fbbef3bd777f386887f31247876b20

ซอร์สเต็มใน ZIP, patch ใน source-changes-v7.64.97/
[นโยบายรวมซอร์สกลับ main ในรอบ 7.65.00](RELEASE-POLICY.md)

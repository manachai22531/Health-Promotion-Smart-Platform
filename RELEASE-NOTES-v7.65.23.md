# v7.65.23 Production

- ตั้งค่าจากช่องใบนำทางก่อน แล้วผูก Order ได้หลายรายการต่อช่อง
- ถอดกฎแบบกลุ่มออกทั้งหน้าจอและการประมวลผล เก็บนิยามเดิมไว้ใน audit เมื่อบันทึก
- รวม Consult Location & Order ใน Station 7 ใช้ Location master เดิม แถวกระชับและเลือก Order ผ่านกล่องค้นหา
- เพิ่ม Other ใน Station 4 และ 5 พร้อมเลือกอัตโนมัติ รายละเอียด Order และ PDF; รักษาหมายเหตุเดิม
- บันทึก mapping และ Location ใน transaction เดียว ตรวจ revision ทั้งสองส่วน ป้องกันข้อมูลค้างบางส่วน
- คงฟีเจอร์รุ่นก่อน: เทมเพลต Excel/HTML ออฟไลน์สำหรับลูกค้าและพนักงาน, PDF ใบนำทาง, บันทึกรวม, performance และตัวติดตั้งที่ตรวจ checksum ทุกไฟล์

Validation: browser regressions, isolated PostgreSQL transaction/conflict/rollback tests and one-page PDF generation; build and release suite. Windows GUI/UAC and live HIS require validation on the target machine.

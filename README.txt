HealthCheck v7.64.68 - Installer Hotfix 2

แตก ZIP ทั้งหมด แล้วดับเบิลคลิก INSTALL-REPAIR.vbs ที่โฟลเดอร์หลัก
เปิดเฉพาะหน้าต่าง Production Installer ไม่แสดงคอนโซล PowerShell ด้านหลัง
Windows ยังแสดงหน้าต่าง UAC เพื่อขอสิทธิ์ Administrator ตามปกติ
INSTALL-REPAIR.bat ยังใช้งานได้ แต่อาจเห็นหน้าต่าง CMD ชั่วครู่
การเปิดไฟล์ .ps1 โดยตรงอาจยังเห็นหน้าต่าง PowerShell ของผู้ใช้

รวมการแก้ Hotfix 1: live log / heartbeat ทุก 15 วินาที / ไม่รอ stdin
แอปและฐานข้อมูลคง v7.64.68 เดิม ไม่เปลี่ยนการสำรองข้อมูล
จาก log ของผู้ใช้ การรอนานอยู่ระหว่าง Compressing source backup
ไม่ใช่หลักฐานว่า Deploy หรือ Health Check ผ่านแล้ว
อย่าเปิดติดตั้งซ้ำขณะตัวเดิมยังทำงาน

ตรวจ syntax PowerShell / SHA256 และโครงสร้างเส้นทางเปิดตัวติดตั้ง
ยังไม่ได้ตรวจ UI / UAC / VBScript บน Windows จริง

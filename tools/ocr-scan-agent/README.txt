HealthCheck Scan Agent v7.63.53 - TWAIN MEMORY x86

สิ่งที่แก้ในรุ่นนี้
- เลือก TWAIN Source ชื่อ "Scan" อัตโนมัติเป็นอันดับแรก (เหมาะกับ Kyocera TWAIN Driver Setting)
- ตัด Source ที่ขึ้นต้น WIA- / WIA: ออกจากการเลือก TWAIN
- ใช้ TWAIN Buffered Memory Transfer เป็นหลัก แทน Native Transfer ที่ Kyocera บางรุ่นตอบ ReturnCode 1
- ตั้ง ADF/Feeder + AutoFeed + XferCount แบบ best-effort
- เมื่อ TWAIN error จะอ่าน DAT_STATUS / ConditionCode และแสดงรหัสจริง เช่น SEQERROR, BADVALUE, PAPERJAM, NOMEDIA
- ไม่สลับไป WIA อัตโนมัติสำหรับ Kyocera เพื่อหลีกเลี่ยง "The WIA device is busy"
- รองรับ 1/8/24/32 bit uncompressed memory image และส่งเป็น BMP เข้า OCR Batch Queue
- ถ้า Source ไม่รองรับ Memory transfer จะ fallback เป็น TWAIN Native (ยังไม่ใช้ WIA)

ติดตั้ง
1) แตก ZIP ให้ครบ
2) ดับเบิลคลิก INSTALL-SCAN-AGENT.cmd
3) รอ SUCCESS
4) กด TEST-TWAIN-SOURCES.cmd
5) รายการควรมี Source "Scan" และมีเครื่องหมายใช้อัตโนมัติ
6) กลับหน้า OCR แล้วกด Scan Scanner

Kyocera
- ใน Kyocera TWAIN Driver Setting ให้ Source ชื่อ Scan ชี้ไปที่ ECOSYS M2640idw และ IP ของเครื่องจริง
- ใส่กระดาษใน ADF/Feeder ก่อนกด Scan Scanner

Log
%LOCALAPPDATA%\HealthCheckScanAgent\scan-agent.log

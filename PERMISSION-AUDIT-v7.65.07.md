# Permission audit — v7.65.07

วันที่ตรวจ: 2 พฤศจิกายน 2026

## ผลตรวจ

- รายการสิทธิ์กลางมี 95 สิทธิ์ และหน้า Role แสดงช่องตั้งค่าครบ 95/95
- ชื่อสิทธิ์ที่อ้างผ่าน `can(...)`, `guard(...)`, `data-permission`, `staffPermissionRequired(...)` และ `staffPagePermissionRequired(...)` อยู่ในรายการกลางทั้งหมด
- เพิ่มสิทธิ์ที่หน้า Role เคยขาดสำหรับ Package HIS: `packageStationView` และ `packageStationEdit`
- โหมดตารางรายชื่อลูกค้าใช้สิทธิ์เดิมแยกตามคำสั่ง ปุ่มจะแสดงแต่ปิดใช้งานเมื่อไม่มีสิทธิ์หรือยังไม่ได้เลือกรายการ
- `permission-coverage.test.js` ตรวจไม่ให้สิทธิ์ที่ใช้งานจริง รายการกลาง และหน้า Role แตกต่างกันในรุ่นถัดไป

## สิทธิ์ที่โหมดตารางใช้

| คำสั่ง | สิทธิ์ |
| --- | --- |
| รายละเอียด | `search` |
| แก้ไขข้อมูล | `customerEdit` |
| ยืนยันการตรวจ | `receiveCreate` หรือ `receiveEdit` ตามสถานะ |
| เปิดหน้าลูกค้า | `customerSensitiveView` |
| ดูนัดหมาย | `appointmentView` |
| ดูเล่ม | `hisView` และต้องมี HN |
| เอกสารเวียน | `companyEdit` |
| Export | `customerExport` |

## ข้อจำกัดฝั่ง Server

การตั้งค่าและการซ่อน/ปิดเมนูฝั่งหน้าจอครบตามรายการที่ประกาศแล้ว แต่ API รุ่นเก่าบางกลุ่มยังใช้ `localOnly` หรือ guard เฉพาะงานแทน Role guard โดยตรง โดยเฉพาะ state รุ่นเก่า, HIS patient/visit บางเส้นทาง, SetUpMaster รุ่นเก่า, PDF form รุ่นเก่า, Package HIS บางคำสั่ง, Booking บางคำสั่ง และ company document รุ่นเก่า

ดังนั้นผล 95/95 หมายถึงรายการสิทธิ์และหน้า Role ครบถ้วน ไม่ได้หมายความว่า Server route ทุกรายการบังคับ Role ครบแล้ว งานเพิ่ม Server guard ควรแยกทดสอบกับ integration ของ HIS และกระบวนการหน้างานก่อนนำขึ้น Production

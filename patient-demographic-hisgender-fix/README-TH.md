# Patient Demographic HISGender hotfix — v7.64.92

ซอร์ส: branch `installers/v7.64.92`, commit `003692ab76b2c843e32cb73777bc6422aba704ea` จาก ZIP ที่ตรวจ SHA256 ผ่านแล้ว ไม่ใช้ main

สาเหตุ: หน้าต่างข้อมูล HIS แสดง gender_label แต่ Excel อ่านเฉพาะ gender เมื่อ gender ว่างจึงไม่ส่งออก FEMALE

แก้: ใช้ gender_label ที่ตัดช่องว่าง ถ้าไม่มีจึงใช้ gender ให้ตรงกันในตาราง หน้าต่างตรวจเลือก ข้อความยืนยัน และ HISGender ทั้งสองชีต ไม่อนุมานเพศจาก InputGender คงเงื่อนไขการเลือกผู้ป่วยและ HN เดิม เปลี่ยน cache key ของโมดูลเพื่อโหลด JavaScript ใหม่

แพ็กเกจ `HealthCheck-v7.64.92-PRODUCTION-WINDOWS-INSTALLER-HISGENDER-FIX.zip` คงเลขเวอร์ชัน 7.64.92 เป็น hotfix พร้อมสร้าง source integrity manifests ใหม่ และไฟล์ .sha256 ตรวจ ZIP

สำหรับเครื่องที่ติดตั้ง 7.64.92: ใช้ซอร์ส assets/patient-demographic.js และ datacenter/patient-demographic.html ในโฟลเดอร์นี้แทนไฟล์ตำแหน่งเดียวกัน แล้วรีโหลด Ctrl+F5 หรือใช้แพ็กเกจเต็มผ่าน INSTALL-REPAIR.bat ตามขั้นตอนติดตั้งเดิม ห้ามใช้เป็นแพ็กเกจอัปเดตข้ามเวอร์ชัน: hotfix นี้ไม่ได้เพิ่มหมายเลขเวอร์ชัน

การตรวจสอบ:
- โค้ดเดิม: regression test ล้มเหลวเมื่ออ่าน Excel จริง (HISGender ว่างขณะที่ dialog แสดง FEMALE)
- โค้ดแก้: Chromium regression ผ่าน ทั้งข้อมูล label อย่างเดียว, normalized gender, ช่องว่าง, ไทย, O/U, ไม่มีเพศ, หลาย candidate และหลัง manual selection ทั้งสองชีต
- npm run build ผ่าน
- npm run test:release ผ่าน 117 tests, ไม่ข้าม tests
- ไม่ได้ติดต่อ HIS จริงหรือรันตัวติดตั้ง Windows บนเครื่องจริง

รัน regression ในซอร์สที่แตก ZIP: `CHROMIUM_EXECUTABLE=/usr/bin/chromium node --test tools/patient-demographic-export.test.cjs`

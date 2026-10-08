# HealthCheck v7.63.74 — Production Readiness UAT

ใช้หน้า **ศูนย์ปฏิบัติการ > Production Readiness** เป็นตัวบันทึกผลหลัก

## UAT Flow
1. Login / Role / Permission — ทดสอบอย่างน้อย Admin และ User ที่มีสิทธิ์จำกัด
2. Project Booking — เปิดโครงการ ค้นหา/กรอง Booking ตรวจ compact/sticky และปุ่ม action
3. HN / VN — ใช้ข้อมูลทดสอบที่ได้รับอนุมัติ ตรวจ HN แล้วตรวจ VN
4. patientlog Status — ตรวจว่า Status ตรงกับ `tovalue` ล่าสุดของ HN+VN และ auto refresh ทำงาน
5. Bulk EMR — เลือกหลายโครงการ รับ EMR ตรวจ Live Progress และการป้องกันกดซ้ำ
6. HIS User Sync — ดึง User จาก HIS กำหนด Role และยืนยันว่า User ใหม่ไม่ถูกเปิดใช้งานผิดคน
7. Backup / Restore — สร้าง Backup, Verify SHA-256 และทำ Restore Drill บนฐานทดสอบหรือ Maintenance window
8. Update / Rollback — ตรวจ preflight, pre-backup, dry-run/validation และ rollback prerequisites

## Load Test Matrix
ทำใน Production-like environment ก่อนช่วงใช้งานหนัก ไม่แนะนำสร้างข้อมูลทดสอบจำนวนมากบน Production จริง

| Scenario | Booking data | Concurrent users | เป้าหมาย |
|---|---:|---:|---|
| Small | 1,000 | 5 | หน้า Booking/ค้นหา p95 < 2s |
| Medium | 5,000 | 10 | Error rate < 1%, DB pool ไม่มี waiting ต่อเนื่อง |
| Large | 10,000 | 20 | ไม่มี timeout/500, memory ไม่โตต่อเนื่อง |

ในหน้า Production Readiness มี **Safe DB Read Benchmark** สำหรับตรวจ latency/concurrency แบบไม่แก้ข้อมูล (สูงสุด 500 requests / 20 concurrency) เพื่อใช้เป็น baseline เท่านั้น

## Backup / Restore Acceptance
- มีไฟล์ Backup ล่าสุดและขนาด > 1 KB
- Verify SHA-256 สำเร็จ
- `pg_restore` Restore ลงฐานทดสอบสำเร็จ
- เปิดระบบด้วยฐานที่ restore แล้วตรวจ `/api/system/health`
- สุ่มตรวจ Project/Booking/HN/VN/EMR อย่างน้อย 10 รายการ

## Rollback Acceptance
- Updater helper และ restore script พร้อม
- มี Database backup ก่อน deploy
- Update directory writable
- Dry validation ผ่าน
- การ rollback จริงควรทำใน Maintenance window เท่านั้น

## Security Acceptance
- Production-only lock / PORT 3000
- HttpOnly + SameSite=Lax session cookie
- Login throttle: ผิด 5 ครั้งภายใน window แล้ว lock 5 นาที
- Security response headers
- Server-side permission guard
- ไม่มี `.env` หรือ secret อยู่ใน Update ZIP

## Database Maintenance
- ตรวจ dead rows / autovacuum / autoanalyze
- ตรวจ index usage
- ตรวจ table size
- ถ้า dead rows สูง >15% และ >1,000 ให้พิจารณา VACUUM (ANALYZE)
- หน้า Readiness อนุญาต ANALYZE เฉพาะ table ใน allowlist เท่านั้น

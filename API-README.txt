Health Check Up Smart Search - External REST API v1

Base URL
http://localhost:3000/external-api/v1

การยืนยันตัวตน
ส่ง API Key ที่ตัวติดตั้งสร้างไว้ในไฟล์ API-KEY.txt ด้วย Header:
X-API-Key: YOUR_API_KEY

หรือ:
Authorization: Bearer YOUR_API_KEY

Endpoints
GET    /health
GET    /companies?q=
GET    /customers?q=&companyId=&limit=100&offset=0
GET    /customers/:key
POST   /customers
PUT    /customers/:key
DELETE /customers/:key
GET    /packages?q=
GET    /statistics?companyId=

ตัวอย่างค้นหาลูกค้า
curl -H "X-API-Key: YOUR_API_KEY" "http://localhost:3000/external-api/v1/customers?q=สมชาย&limit=20"

ตัวอย่างเพิ่มลูกค้า
curl -X POST "http://localhost:3000/external-api/v1/customers" ^
  -H "Content-Type: application/json" ^
  -H "X-API-Key: YOUR_API_KEY" ^
  -d "{\"companyId\":\"COMPANY_ID\",\"firstName\":\"สมชาย\",\"lastName\":\"ตัวอย่าง\",\"idPassport\":\"1234567890123\",\"packageCode\":\"PKG001\",\"packageName\":\"ตรวจสุขภาพพื้นฐาน\"}"

ตัวอย่างแก้ไขลูกค้า (แทน CUSTOMER_KEY ด้วย key ที่ได้จาก GET /customers)
curl -X PUT "http://localhost:3000/external-api/v1/customers/CUSTOMER_KEY" ^
  -H "Content-Type: application/json" ^
  -H "X-API-Key: YOUR_API_KEY" ^
  -d "{\"firstName\":\"สมชาย\",\"lastName\":\"แก้ไขแล้ว\"}"

ตัวอย่างลบลูกค้า (key ใน URL และ body ต้องตรงกัน)
curl -X DELETE "http://localhost:3000/external-api/v1/customers/CUSTOMER_KEY" ^
  -H "Content-Type: application/json" ^
  -H "X-API-Key: YOUR_API_KEY" ^
  -d "{\"key\":\"CUSTOMER_KEY\"}"

ฟิลด์ข้อมูลลูกค้าที่รองรับ
companyId, title, firstName, lastName, idPassport, birthDate, sex,
packageCode, packageName, visitedAt

หมายเหตุด้านความปลอดภัย
- ห้ามใส่ API Key ไว้ใน URL
- อย่าเผยแพร่ไฟล์ API-KEY.txt
- หากต้องการเปลี่ยน Key ให้แก้ EXTERNAL_API_KEY ในไฟล์ .env แล้วเปิดโปรแกรมใหม่
- หากเชื่อมจากเครื่องอื่น ต้องอนุญาตพอร์ต 3000 ใน Windows Firewall และใช้ IP ของเครื่อง Server แทน localhost

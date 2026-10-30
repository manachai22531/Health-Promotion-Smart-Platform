'use strict';
const normalize=value=>String(value??'').trim().toUpperCase(),hn=value=>normalize(value).replace(/[^A-Z0-9]/g,''),date=value=>String(value??'').trim().slice(0,10);
function matchesSelectedBooking(row){
 if(!row)return false;
 const company=normalize(row.project_company_id),companies=[row.anchor_company_id,row.anchor_company_year_id].map(normalize).filter(Boolean);
 if(!companies.includes(company))return false;
 if(row.project_year&&row.anchor_year&&normalize(row.project_year)!==normalize(row.anchor_year))return false;
 if(row.booking_customer_id&&String(row.booking_customer_id)===String(row.anchor_customer_id))return true;
 const anchorIds=[row.anchor_id,row.anchor_passport].map(normalize).filter(Boolean),bookingIds=[row.booking_id_passport,row.booking_identity,row.booking_passport].map(normalize).filter(Boolean);
 if(anchorIds.length&&bookingIds.length&&!anchorIds.some(id=>bookingIds.includes(id)))return false;
 const aBirth=date(row.anchor_birth),bBirth=date(row.booking_customer_birth||row.booking_birth);
 if(aBirth&&bBirth&&aBirth!==bBirth)return false;
 if(anchorIds.length&&bookingIds.some(id=>anchorIds.includes(id)))return true;
 return Boolean(hn(row.anchor_hn)&&[row.booking_hn,row.booking_customer_hn].some(v=>hn(v)===hn(row.anchor_hn)));
}
async function selectedBookingForRecord(pool,recordKey,bookingId){
 const row=(await pool.query(`SELECT b.id AS booking_id,b.scheduled_date,p.id AS project_id,p.payor_options,
   p.company_id AS project_company_id,p.screening_year AS project_year,
   a.customer_id AS anchor_customer_id,a.company_year_id AS anchor_company_year_id,cy.company_id AS anchor_company_id,cy.screening_year AS anchor_year,
   c.identification_number AS anchor_id,c.passport_number AS anchor_passport,c.hn AS anchor_hn,c.birth_date AS anchor_birth,
   b.id_passport AS booking_id_passport,b.hn AS booking_hn,b.birth_date AS booking_birth,
   linked.customer_id AS booking_customer_id,bc.identification_number AS booking_identity,bc.passport_number AS booking_passport,bc.hn AS booking_customer_hn,bc.birth_date AS booking_customer_birth
   FROM company_customers a JOIN customers c ON c.id=a.customer_id JOIN company_years cy ON cy.id=a.company_year_id
   JOIN checkup_bookings b ON b.id=$2 JOIN checkup_projects p ON p.id=b.project_id
   LEFT JOIN company_customers linked ON linked.legacy_record_key=b.record_key LEFT JOIN customers bc ON bc.id=linked.customer_id
   WHERE a.legacy_record_key=$1 AND b.booking_status<>'CANCELLED' AND p.status<>'CANCELLED' AND p.project_code<>'HIS-OPEN-VISIT'
   LIMIT 1`,[recordKey,bookingId])).rows[0];
 return matchesSelectedBooking(row)?row:null;
}
module.exports={matchesSelectedBooking,selectedBookingForRecord};

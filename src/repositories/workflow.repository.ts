import type { DatabaseClientLike } from './his-connection.repository';

export interface CheckupProjectRow extends Record<string, unknown> {
  id: string;
  company_id?: string;
  company_name?: string;
  default_package_code?: string;
  default_package_name?: string;
  start_date?: string | null;
}

export interface CheckupBookingRow extends Record<string, unknown> {
  id: string;
  project_id: string;
  record_key: string;
  booking_status: string;
}

export const FIND_PROJECT_SQL = 'SELECT * FROM checkup_projects WHERE id=$1';
export const INSERT_BOOKING_SQL = `INSERT INTO checkup_bookings(id,project_id,record_key,hn,employee_code,patient_name,id_passport,birth_date,sex,company_id,company_name,department_name,position_name,package_code,package_name,scheduled_date,booking_status,remark,created_by,updated_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,'BOOKED',$17,$18,$18) RETURNING *`;
export const INSERT_BULK_BOOKING_SQL = `INSERT INTO checkup_bookings(id,project_id,record_key,hn,employee_code,patient_name,id_passport,birth_date,sex,company_id,company_name,department_name,position_name,package_code,package_name,scheduled_date,booking_status,created_by,updated_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,'BOOKED',$17,$17)`;

export async function findCheckupProjectById(
  client: DatabaseClientLike,
  projectId: unknown,
): Promise<CheckupProjectRow | null> {
  const result = await client.query<CheckupProjectRow>(FIND_PROJECT_SQL, [projectId]);
  return result.rows[0] || null;
}

export async function insertCheckupBooking(
  client: DatabaseClientLike,
  values: unknown[],
): Promise<CheckupBookingRow> {
  const result = await client.query<CheckupBookingRow>(INSERT_BOOKING_SQL, values);
  return result.rows[0];
}

export async function insertBulkCheckupBooking(
  client: DatabaseClientLike,
  values: unknown[],
): Promise<void> {
  await client.query(INSERT_BULK_BOOKING_SQL, values);
}

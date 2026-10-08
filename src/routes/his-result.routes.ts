import { chooseHisVisit, findHisEmrPayload } from '../services/his-payload.service';

type Next = () => void;
type Middleware = (request: RequestLike, response: ResponseLike, next: Next) => unknown;
type Handler = (request: RequestLike, response: ResponseLike) => unknown;

interface RequestLike {
  body?: Record<string, unknown>;
}

interface ResponseLike {
  status(code: number): ResponseLike;
  json(body: unknown): ResponseLike;
  set(name: string, value: string): ResponseLike;
}

interface AppLike {
  post(path: string, middleware: Middleware, handler: Handler): unknown;
}

interface StateRecord extends Record<string, unknown> {
  key?: unknown;
  id?: unknown;
}

interface AppState extends Record<string, unknown> {
  records?: StateRecord[];
  at?: string;
}

interface HisCall {
  data: unknown;
}

export interface HisResultRouteDependencies {
  app: AppLike;
  localOnly: Middleware;
  callConfiguredHisJson(
    systemCode: string,
    payload: Record<string, unknown>,
  ): Promise<HisCall>;
  readState(): Promise<AppState>;
  writeState(state: AppState): Promise<unknown>;
  contextKey?: string;
}

const text = (value: unknown): string => String(value || '').trim();
const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const patientRoot = (data: unknown): Record<string, unknown> => {
  if (Array.isArray(data)) return (data[0] || {}) as Record<string, unknown>;
  if (data && typeof data === 'object') {
    const record = data as Record<string, unknown>;
    return (record.Patient || record) as Record<string, unknown>;
  }
  return {};
};

const findRecord = (state: AppState, recordKey: string): StateRecord | undefined =>
  (state.records || []).find(record => String(record.key || record.id) === recordKey);

export function registerHisResultRoutes(dependencies: HisResultRouteDependencies): void {
  const { app, localOnly, callConfiguredHisJson, readState, writeState } = dependencies;
  const defaultContextKey = dependencies.contextKey || 'Vimut2022';

  app.post('/api/his/visit', localOnly, async (request, response) => {
    try {
      const body = request.body || {};
      const HN = text(body.HN || body.hn);
      const recordKey = text(body.recordKey);
      const requestedVisitUID = text(body.VisitUID);
      if (!HN) return response.status(400).json({ error: 'กรุณาระบุ HN' });
      const visitRequest = {
        HN,
        Location: text(body.Location),
        ContextKey: text(body.ContextKey) || defaultContextKey,
      };
      const visitCall = await callConfiguredHisJson('GET_VISIT', visitRequest);
      const root = patientRoot(visitCall.data);
      const selectedVisit = chooseHisVisit(root, requestedVisitUID);
      let revision: unknown = null;
      if (recordKey) {
        const state = await readState();
        const record = findRecord(state, recordKey);
        if (record) {
          record.hisLastVisitUID = String(selectedVisit?.VisitUID || '');
          record.hisLastVisitAt = new Date().toISOString();
          record.hisVisitResult = {
            patient: {
              UID: root.UID || null,
              HN: root.HN || HN,
              FirstName: root.FirstName || '',
              LastName: root.LastName || '',
              Company: root.Company || '',
              PackageName: root.PackageName || '',
              CheckupDate: root.CheckupDate || '',
            },
            visits: Array.isArray(root.Visit) ? root.Visit : [],
          };
          state.at = new Date().toISOString();
          revision = await writeState(state);
        }
      }
      response.set('Cache-Control', 'no-store');
      return response.json({
        ok: true, revision, visitRequest,
        visitResponse: visitCall.data, selectedVisit,
      });
    } catch (error) {
      return response.status(502).json({
        error: `ตรวจสอบ Visit/VN จาก HIS ไม่สำเร็จ: ${errorMessage(error)}`,
      });
    }
  });

  app.post('/api/his/emr', localOnly, async (request, response) => {
    try {
      const body = request.body || {};
      const HN = text(body.HN || body.hn);
      const recordKey = text(body.recordKey);
      const VisitUID = text(body.VisitUID);
      const deferPersist = body.deferPersist === true;
      if (!HN) return response.status(400).json({ error: 'กรุณาระบุ HN' });
      if (!VisitUID) return response.status(400).json({ error: 'กรุณาระบุ VisitUID' });
      const emrRequest = {
        HN, VisitUID,
        Request: text(body.Request),
        DoctorNumber: text(body.DoctorNumber),
        Licensenumber: text(body.Licensenumber),
        ContextKey: text(body.ContextKey) || defaultContextKey,
      };
      const emrCall = await callConfiguredHisJson('GET_EMR_RESULT', emrRequest);
      const emrData = findHisEmrPayload(emrCall.data);
      let revision: unknown = null;
      if (recordKey && !deferPersist) {
        const state = await readState();
        const record = findRecord(state, recordKey);
        if (record) {
          record.hisLastVisitUID = VisitUID;
          record.hisLastResultAt = new Date().toISOString();
          record.hisEmrResult = emrData;
          state.at = new Date().toISOString();
          revision = await writeState(state);
        }
      }
      response.set('Cache-Control', 'no-store');
      return response.json({
        ok: true, revision, emrRequest,
        emrResponse: emrData, rawEmrResponse: emrCall.data,
      });
    } catch (error) {
      return response.status(502).json({
        error: `รับ EMR จาก HIS ไม่สำเร็จ: ${errorMessage(error)}`,
      });
    }
  });

  app.post('/api/his/checkup-result', localOnly, async (request, response) => {
    try {
      const body = request.body || {};
      const HN = text(body.HN || body.hn);
      const recordKey = text(body.recordKey);
      const requestedVisitUID = text(body.VisitUID);
      const deferPersist = body.deferPersist === true;
      if (!HN) return response.status(400).json({ error: 'กรุณาระบุ HN' });
      const ContextKey = text(body.ContextKey) || defaultContextKey;
      const visitRequest = { HN, Location: text(body.Location), ContextKey };
      const visitCall = await callConfiguredHisJson('GET_VISIT', visitRequest);
      const root = patientRoot(visitCall.data);
      const selectedVisit = chooseHisVisit(root, requestedVisitUID);
      if (!selectedVisit?.VisitUID) {
        return response.status(404).json({
          error: 'HIS ไม่พบ Visit สำหรับ HN นี้',
          visitRequest,
          visitResponse: visitCall.data,
        });
      }
      const emrRequest = {
        HN,
        VisitUID: String(selectedVisit.VisitUID),
        Request: text(body.Request),
        DoctorNumber: text(body.DoctorNumber),
        Licensenumber: text(body.Licensenumber),
        ContextKey,
      };
      const emrCall = await callConfiguredHisJson('GET_EMR_RESULT', emrRequest);
      const emrData = findHisEmrPayload(emrCall.data);
      let revision: unknown = null;
      if (recordKey && !deferPersist) {
        const state = await readState();
        const record = findRecord(state, recordKey);
        if (record) {
          record.hisLastVisitUID = String(selectedVisit.VisitUID);
          record.hisLastResultAt = new Date().toISOString();
          record.hisVisitResult = {
            patient: {
              UID: root.UID || null,
              HN: root.HN || HN,
              FirstName: root.FirstName || '',
              LastName: root.LastName || '',
              Company: root.Company || '',
              PackageName: root.PackageName || '',
              CheckupDate: root.CheckupDate || '',
            },
            visits: Array.isArray(root.Visit) ? root.Visit : [],
          };
          record.hisEmrResult = emrData;
          state.at = new Date().toISOString();
          revision = await writeState(state);
        }
      }
      response.set('Cache-Control', 'no-store');
      return response.json({
        ok: true, revision, visitRequest,
        visitResponse: visitCall.data, selectedVisit,
        emrRequest, emrResponse: emrData, rawEmrResponse: emrCall.data,
      });
    } catch (error) {
      return response.status(502).json({
        error: `เรียกผลตรวจ HIS ไม่สำเร็จ: ${errorMessage(error)}`,
      });
    }
  });
}

import type { EMR, JsonValue, Patient, Visit } from '../types/domain';
import http from 'node:http';
import https from 'node:https';
import { normalizeHisApiPayload } from './his-payload.service';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface HisApiConnection {
  endpointUrl: string;
  method: HttpMethod;
  apiKey?: string;
  headers?: Record<string, string>;
  timeoutMs?: number;
}

export interface HisApiResponse<T> {
  data: T;
  status: number;
  headers: Record<string, string>;
}

export interface StoredHisApiConnection {
  endpointUrl: string;
  apiName: string;
  method: HttpMethod;
  contentType?: string;
  apiKey?: string;
}

export interface LegacyCompatibleHisResponse<T = unknown> {
  status: number;
  data: T;
  method: HttpMethod;
  url: string;
}

export interface VisitRequest {
  HN: string;
  Location?: string;
  ContextKey: string;
}

export interface EmrRequest {
  HN: string;
  VisitUID: string;
  Request?: string;
  DoctorNumber?: string;
  Licensenumber?: string;
  ContextKey: string;
}

export class HisApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly responseBody?: string,
  ) {
    super(message);
    this.name = 'HisApiError';
  }
}

/**
 * Node transport matching the existing server.js behavior. It deliberately
 * keeps the current TLS setting and response/error shapes during migration.
 */
export function requestConfiguredHisJson<T = unknown>(
  connection: StoredHisApiConnection,
  payload: Record<string, unknown>,
  options: { timeoutMs?: number; maxBytes?: number } = {},
): Promise<LegacyCompatibleHisResponse<T>> {
  const timeoutMs = options.timeoutMs ?? 30_000;
  const maxBytes = options.maxBytes ?? 12 * 1024 * 1024;
  const url = new URL(connection.endpointUrl);
  const method = connection.method.toUpperCase() as HttpMethod;

  if (method === 'GET') {
    for (const [key, value] of Object.entries(payload || {})) {
      if (value != null && String(value) !== '') url.searchParams.set(key, String(value));
    }
  }

  const bodyText = method === 'GET' || method === 'DELETE'
    ? ''
    : JSON.stringify(payload || {});
  const client = url.protocol === 'https:' ? https : http;

  return new Promise((resolve, reject) => {
    const headers: Record<string, string | number> = {
      Accept: 'application/json',
      'Content-Type': connection.contentType || 'application/json',
    };
    if (connection.apiKey) headers['x-api-key'] = connection.apiKey;
    if (bodyText) headers['Content-Length'] = Buffer.byteLength(bodyText);

    const request = client.request(url, {
      method,
      headers,
      timeout: timeoutMs,
      rejectUnauthorized: false,
    }, response => {
      const chunks: Buffer[] = [];
      let size = 0;
      response.on('data', (chunk: Buffer) => {
        size += chunk.length;
        if (size > maxBytes) {
          request.destroy(new Error(
            `Response ${connection.apiName} เกิน ${Math.round(maxBytes / 1024 / 1024)} MB`,
          ));
          return;
        }
        chunks.push(chunk);
      });
      response.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8');
        let data: unknown = null;
        try {
          data = raw ? JSON.parse(raw) : null;
        } catch {
          data = raw;
        }
        data = normalizeHisApiPayload(data);
        const status = response.statusCode || 502;
        if (status < 200 || status >= 300) {
          const objectData = data && typeof data === 'object' ? data as Record<string, unknown> : null;
          const apiMessage = objectData
            ? objectData.Message ?? objectData.message ?? objectData.ErrorMessage ?? objectData.errorMessage ?? objectData.ErrorDetail ?? objectData.errorDetail ?? objectData.errordetail ?? objectData.error
            : null;
          const detailText = apiMessage || (typeof data === 'string' ? data : '');
          const detail = detailText ? ` · ${String(detailText).slice(0, 1000)}` : '';
          reject(new Error(`${connection.apiName} ตอบกลับ HTTP ${status}${detail}`));
          return;
        }
        resolve({ status, data: data as T, method, url: String(url) });
      });
    });
    request.on('timeout', () => request.destroy(new Error(
      `${connection.apiName} ไม่ตอบกลับภายใน ${Math.round(timeoutMs / 1000)} วินาที`,
    )));
    request.on('error', reject);
    if (bodyText) request.write(bodyText);
    request.end();
  });
}

/** Typed transport for progressively replacing the inline HIS calls in server.js. */
export class HisApiService {
  constructor(private readonly defaultTimeoutMs = 30_000) {}

  async request<TResponse, TPayload extends object>(
    connection: HisApiConnection,
    payload: TPayload,
  ): Promise<HisApiResponse<TResponse>> {
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      connection.timeoutMs ?? this.defaultTimeoutMs,
    );

    try {
      const method = connection.method.toUpperCase() as HttpMethod;
      const headers: Record<string, string> = {
        Accept: 'application/json',
        ...connection.headers,
      };
      if (connection.apiKey) headers['x-api-key'] = connection.apiKey;

      const url = new URL(connection.endpointUrl);
      const init: RequestInit = { method, headers, signal: controller.signal };
      if (method === 'GET') {
        for (const [key, value] of Object.entries(payload)) {
          if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
        }
      } else {
        headers['content-type'] = 'application/json';
        init.body = JSON.stringify(payload);
      }

      const response = await fetch(url, init);
      const body = await response.text();
      if (!response.ok) {
        throw new HisApiError(`HIS API returned HTTP ${response.status}`, response.status, body);
      }

      let data: TResponse;
      try {
        data = (body ? JSON.parse(body) : null) as TResponse;
      } catch {
        throw new HisApiError('HIS API returned invalid JSON', response.status, body);
      }

      return {
        data,
        status: response.status,
        headers: Object.fromEntries(response.headers.entries()),
      };
    } catch (error) {
      if (error instanceof HisApiError) throw error;
      if (error instanceof Error && error.name === 'AbortError') {
        throw new HisApiError('HIS API request timed out');
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  getVisit(connection: HisApiConnection, request: VisitRequest) {
    return this.request<{ Patient?: Partial<Patient> & { Visit?: Visit[] } } | JsonValue, VisitRequest>(
      connection,
      request,
    );
  }

  getEmr(connection: HisApiConnection, request: EmrRequest) {
    return this.request<EMR | JsonValue, EmrRequest>(connection, request);
  }
}

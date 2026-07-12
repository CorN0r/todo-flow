/// <reference types="node" />

import type { IncomingMessage, ServerResponse } from 'node:http';
import type {
  AckRequest,
  AttachmentUploadInitRequest,
  DeviceRegistrationRequest,
  PullRequest,
  PushRequest,
} from './types';
import { FileBackedSyncStore } from './store';

export interface SyncApiRequest {
  method: 'GET' | 'POST';
  path: string;
  headers?: Record<string, string | undefined>;
  body?: unknown;
}

export interface SyncApiResponse {
  status: number;
  body: unknown;
}

function header(headers: Record<string, string | undefined> | undefined, key: string) {
  if (!headers) return undefined;
  const found = Object.entries(headers).find(([name]) => name.toLowerCase() === key.toLowerCase());
  return found?.[1];
}

function accountId(request: SyncApiRequest) {
  return header(request.headers, 'x-account-id') ?? 'local-dev';
}

function ok(body: unknown, status = 200): SyncApiResponse {
  return { status, body };
}

function badRequest(message: string): SyncApiResponse {
  return { status: 400, body: { error: 'bad_request', message } };
}

function notFound(path: string): SyncApiResponse {
  return { status: 404, body: { error: 'not_found', path } };
}

function bodyAs<T>(request: SyncApiRequest): T {
  return (request.body ?? {}) as T;
}

export function handleSyncRequest(store: FileBackedSyncStore, request: SyncApiRequest): SyncApiResponse {
  const url = new URL(request.path, 'http://todoflow.local');
  const path = url.pathname;
  if (!path.startsWith('/v1/')) return notFound(path);
  const account = accountId(request);

  if (request.method === 'POST' && path === '/v1/devices/register') {
    const input = bodyAs<DeviceRegistrationRequest>(request);
    if (!input.client_device_key || !input.platform) return badRequest('client_device_key and platform are required');
    return ok({ device: store.registerDevice(account, input) }, 201);
  }

  if ((request.method === 'GET' || request.method === 'POST') && path === '/v1/bootstrap') {
    return ok(store.bootstrap(account));
  }

  if (request.method === 'POST' && path === '/v1/sync/push') {
    const input = bodyAs<PushRequest>(request);
    if (!input.device_id || !Array.isArray(input.operations)) return badRequest('device_id and operations are required');
    return ok(store.push(account, input));
  }

  if (request.method === 'POST' && path === '/v1/sync/pull') {
    const input = bodyAs<PullRequest>(request);
    if (typeof input.cursor !== 'number') return badRequest('cursor is required');
    return ok(store.pull(account, input));
  }

  if (request.method === 'POST' && path === '/v1/sync/ack') {
    const input = bodyAs<AckRequest>(request);
    if (!input.device_id) return badRequest('device_id is required');
    return ok(store.ack(account, input));
  }

  if (request.method === 'POST' && path === '/v1/attachments/initiate-upload') {
    const input = bodyAs<AttachmentUploadInitRequest>(request);
    if (!input.device_id || !input.task_id || !input.filename || !input.mime_type || typeof input.byte_size !== 'number') {
      return badRequest('device_id, task_id, filename, mime_type, and byte_size are required');
    }
    return ok(store.initAttachmentUpload(account, input), 201);
  }

  return notFound(path);
}

export function createNodeHandler(store = new FileBackedSyncStore()) {
  return async (request: IncomingMessage, response: ServerResponse) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    const rawBody = Buffer.concat(chunks).toString('utf8');
    const body = rawBody ? JSON.parse(rawBody) : undefined;
    const result = handleSyncRequest(store, {
      method: request.method === 'GET' ? 'GET' : 'POST',
      path: request.url ?? '/',
      headers: Object.fromEntries(Object.entries(request.headers).map(([key, value]) => [key, Array.isArray(value) ? value.join(',') : value])),
      body,
    });
    response.statusCode = result.status;
    response.setHeader('content-type', 'application/json; charset=utf-8');
    response.end(JSON.stringify(result.body));
  };
}

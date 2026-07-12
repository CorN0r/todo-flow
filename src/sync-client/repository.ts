import { handleSyncRequest, FileBackedSyncStore } from '../sync-server';
import type {
  AckRequest,
  AckResponse,
  AttachmentUploadInitRequest,
  AttachmentUploadInitResponse,
  BootstrapResponse,
  DeviceRegistrationRequest,
  PullRequest,
  PullResponse,
  PushRequest,
  PushResponse,
  RegisteredDevice,
} from '../sync-server';

export type RemoteSyncStatus = 'idle' | 'syncing' | 'failed' | 'offline';

export interface RemoteSyncRepository {
  registerDevice(input: DeviceRegistrationRequest): Promise<RegisteredDevice>;
  bootstrap(): Promise<BootstrapResponse>;
  push(input: PushRequest): Promise<PushResponse>;
  pull(input: PullRequest): Promise<PullResponse>;
  ack(input: AckRequest): Promise<AckResponse>;
  initAttachmentUpload(input: AttachmentUploadInitRequest): Promise<AttachmentUploadInitResponse>;
  getStatus(): Promise<RemoteSyncStatus>;
}

function expectBody<T>(status: number, body: unknown, successStatus = 200): T {
  if (status !== successStatus) {
    const message = typeof body === 'object' && body && 'message' in body ? String((body as { message: unknown }).message) : `HTTP ${status}`;
    throw new Error(message);
  }
  return body as T;
}

export class LocalServerSyncRepository implements RemoteSyncRepository {
  private status: RemoteSyncStatus = 'idle';
  private readonly store: FileBackedSyncStore;
  private readonly accountId: string;

  constructor(
    store: FileBackedSyncStore,
    accountId = 'local-dev',
  ) {
    this.store = store;
    this.accountId = accountId;
  }

  async registerDevice(input: DeviceRegistrationRequest): Promise<RegisteredDevice> {
    const response = handleSyncRequest(this.store, {
      method: 'POST',
      path: '/v1/devices/register',
      headers: { 'x-account-id': this.accountId },
      body: input,
    });
    return expectBody<{ device: RegisteredDevice }>(response.status, response.body, 201).device;
  }

  async bootstrap(): Promise<BootstrapResponse> {
    const response = handleSyncRequest(this.store, {
      method: 'POST',
      path: '/v1/bootstrap',
      headers: { 'x-account-id': this.accountId },
    });
    return expectBody<BootstrapResponse>(response.status, response.body);
  }

  async push(input: PushRequest): Promise<PushResponse> {
    this.status = 'syncing';
    const response = handleSyncRequest(this.store, {
      method: 'POST',
      path: '/v1/sync/push',
      headers: { 'x-account-id': this.accountId },
      body: input,
    });
    this.status = response.status === 200 ? 'idle' : 'failed';
    return expectBody<PushResponse>(response.status, response.body);
  }

  async pull(input: PullRequest): Promise<PullResponse> {
    this.status = 'syncing';
    const response = handleSyncRequest(this.store, {
      method: 'POST',
      path: '/v1/sync/pull',
      headers: { 'x-account-id': this.accountId },
      body: input,
    });
    this.status = response.status === 200 ? 'idle' : 'failed';
    return expectBody<PullResponse>(response.status, response.body);
  }

  async ack(input: AckRequest): Promise<AckResponse> {
    const response = handleSyncRequest(this.store, {
      method: 'POST',
      path: '/v1/sync/ack',
      headers: { 'x-account-id': this.accountId },
      body: input,
    });
    return expectBody<AckResponse>(response.status, response.body);
  }

  async initAttachmentUpload(input: AttachmentUploadInitRequest): Promise<AttachmentUploadInitResponse> {
    const response = handleSyncRequest(this.store, {
      method: 'POST',
      path: '/v1/attachments/initiate-upload',
      headers: { 'x-account-id': this.accountId },
      body: input,
    });
    return expectBody<AttachmentUploadInitResponse>(response.status, response.body, 201);
  }

  async getStatus(): Promise<RemoteSyncStatus> {
    return this.status;
  }
}

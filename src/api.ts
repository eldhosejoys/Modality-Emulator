const API_BASE = '/api';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || res.statusText);
  }
  return res.json();
}

// ─── Shared Types ────────────────────────────
export interface LogEntry {
  id: string | number;
  timestamp: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
  isExternal?: boolean;
}

// ─── Settings ────────────────────────────────
export interface RemoteSystem {
  id: string;
  name: string;
  ipAddress: string;
  port: number;
  aeTitle: string;
}

export interface EmulatorConfig {
  systemName: string;
  aeTitle: string;
  listenPort: number;
}

export interface Settings {
  emulator: EmulatorConfig;
  ris: RemoteSystem[];
  pacs: RemoteSystem[];
  selectedRisId?: string;
  selectedPacsId?: string;
}

export const getSettings = () => request<Settings>('/settings');
export const saveSettings = (s: Settings) =>
  request<Settings>('/settings', { method: 'PUT', body: JSON.stringify(s) });

// ─── Emulator ────────────────────────────────
export interface EmulatorStatus {
  running: boolean;
  port?: number;
  aeTitle?: string;
}

export const getEmulatorStatus = () => request<EmulatorStatus>('/emulator/status');
export const startEmulator = () =>
  request<EmulatorStatus>('/emulator/start', { method: 'POST' });
export const stopEmulator = () =>
  request<EmulatorStatus>('/emulator/stop', { method: 'POST' });
export const getEmulatorLogs = () => request<LogEntry[]>('/emulator/logs');
export const clearEmulatorLogs = () => request<{ success: boolean }>('/emulator/logs', { method: 'DELETE' });

// ─── DICOM Operations ───────────────────────
export interface DicomResult {
  success: boolean;
  message: string;
  data?: unknown;
}

export const pingHost = (target: string) =>
  request<DicomResult>('/dicom/ping', { method: 'POST', body: JSON.stringify({ target }) });

export const dicomEcho = (target: string) =>
  request<DicomResult>('/dicom/echo', { method: 'POST', body: JSON.stringify({ target }) });

export interface WorklistQuery {
  PatientName?: string;
  PatientID?: string;
  AccessionNumber?: string;
  Modality?: string;
  ScheduledProcedureStepStartDate?: string;
  ScheduledPerformingPhysicianName?: string;
  [key: string]: any;
}

export const requestWorklist = (query: WorklistQuery = {}, targetRisId?: string) =>
  request<DicomResult>('/dicom/worklist', { method: 'POST', body: JSON.stringify({ query, targetRisId }) });

export const storeImages = (filenames: string[], targetPacsId?: string, worklistData?: any, fileOverrides?: Record<string, any>) =>
  request<DicomResult>('/dicom/store', { method: 'POST', body: JSON.stringify({ filenames, targetPacsId, worklistData, fileOverrides }) });

// ─── Files ──────────────────────────────────
export interface FileInfo {
  name: string;
  size: number;
  modified: string;
}

export interface DicomTag {
  tag: string;
  name: string;
  vr: string;
  value: string;
  isHeader?: boolean;
}

export const listFiles = (type: 'worklist' | 'images') =>
  request<FileInfo[]>(`/files/${type}`);

export const deleteFile = (type: 'worklist' | 'images', filename: string) =>
  request<{ success: boolean }>(`/files/${type}/${encodeURIComponent(filename)}`, { method: 'DELETE' });

export const parseFile = (type: 'worklist' | 'images', filename: string) =>
  request<DicomTag[]>(`/files/parse/${type}/${encodeURIComponent(filename)}`);

export const getFileJson = (type: 'worklist' | 'images', filename: string) =>
  request<any>(`/files/json/${type}/${encodeURIComponent(filename)}`);

export async function uploadFiles(type: 'worklist' | 'images', files: FileList): Promise<FileInfo[]> {
  const formData = new FormData();
  for (let i = 0; i < files.length; i++) {
    formData.append('files', files[i]);
  }
  const res = await fetch(`${API_BASE}/files/${type}`, {
    method: 'POST',
    body: formData,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || res.statusText);
  }
  return res.json();
}

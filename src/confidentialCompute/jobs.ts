export type JobStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface ComputeJobMeta {
  id: string;
  type: string;
  owner: string;
  status: JobStatus;
  createdAt: number;
}

export interface ComputeJobPayload {
  type: string;
  encryptedInput: Uint8Array;
  meta?: Record<string, any>;
}

export interface ComputeJobResult {
  jobId: string;
  encryptedResult: Uint8Array;
  completedAt: number;
}

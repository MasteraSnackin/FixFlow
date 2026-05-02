import type { Contractor, Diagnosis, Vetting, WorkOrder } from "./schemas";

// POST /api/diagnose
export interface DiagnoseRequest {
  requestId: string;
}

export interface DiagnoseResponse {
  diagnosis: Diagnosis;
}

// POST /api/contractors
export interface ContractorsRequest {
  requestId: string;
  category: string;
  address: string;
}

export interface ContractorsResponse {
  contractors: Contractor[];
}

// POST /api/vet (Person 3)
export interface VetRequest {
  requestId: string;
  contractors: Contractor[];
  repairType: string;
  city: string;
}

export interface VetResponse {
  vetting: Vetting[];
}

// POST /api/work-order (Person 3)
export interface WorkOrderRequest {
  requestId: string;
}

export interface WorkOrderResponse {
  workOrder: WorkOrder;
}

// POST /api/notify (Person 3)
export interface NotifyRequest {
  requestId: string;
}

export interface NotifyResponse {
  audioUrl: string;
  transcript: string;
  call?: {
    ok: boolean;
    sid?: string;
    error?: string;
  };
  email?: {
    ok: boolean;
    id?: string;
    error?: string;
  };
  quote_status?: string;
  quote_source?: string[];
}

// POST /api/requests (submission + orchestrator)
export interface SubmitRequestResponse {
  requestId: string;
}

// Shared error shape for all routes
export interface ApiError {
  error: string;
  details?: string;
}

import type { AircraftBoard, WorkItem, InspectionDraft, CaptureResult, ClarificationAnswer } from '@/data/board'
import type { Employee } from '@/data/employees'
import type { AircraftVisit } from '@/data/aircraft'

export class ApiError extends Error {
  transcript?: string
  constructor(message: string, transcript?: string) {
    super(message)
    this.transcript = transcript
  }
}

let token: string | null = null
const baseUrl = import.meta.env.VITE_API_URL || '/api/v1'

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  })
  if (!response.ok) {
    if (response.status === 401 && token) {
      token = null
      window.dispatchEvent(new Event('nimbus:session-expired'))
    }
    const body = await response.json().catch(() => null)
    throw new ApiError(typeof body?.detail === 'string' ? body.detail : 'Check the form fields and try again.', typeof body?.transcript === 'string' ? body.transcript : undefined)
  }
  return response.status === 204 ? undefined as T : response.json()
}

export interface HandoffQuestion { taskId: string; question: string }
export interface HandoffAnswer extends HandoffQuestion { answer: string }
export interface HandoffReview { questions: HandoffQuestion[]; reviewedTaskCount: number; warnings: string[] }
export interface HandoffReport { report: string; warnings: string[] }

export interface HandoffRecord {
  id: string
  aircraft: AircraftVisit
  items: WorkItem[]
  employees: Employee[]
  outgoing: Employee
  incoming: Employee | null
  status: 'draft' | 'confirmed' | 'completed'
  recipients: Employee[]
  verifiedAt: string | null
  acknowledgements: { taskId: string; question: string; resolution: string; acknowledgedAt: string }[]
  acknowledgedTaskIds: string[]
  requiredTaskIds: string[]
  answers: HandoffAnswer[]
  report: string
  createdAt: string
  confirmedAt: string | null
  completedAt: string | null
}

export type HandoffOut = HandoffRecord

export const api = {
  fillHandoffAnswers: (registration: string, transcript: string, questions: (HandoffQuestion & { answer: string })[]) =>
    request<{ answers: string[]; transcript: string }>(`/aircraft/${encodeURIComponent(registration)}/handoff/answers/text`, { method: 'POST', body: JSON.stringify({ transcript, questions }) }),
  startHandoff: (registration: string, answers: HandoffAnswer[]) =>
    request<HandoffRecord>(`/aircraft/${encodeURIComponent(registration)}/handoff/start`, { method: 'POST', body: JSON.stringify({ answers }) }),
  getHandoff: (registration: string, id: string) =>
    request<HandoffRecord>(`/aircraft/${encodeURIComponent(registration)}/handoff/${encodeURIComponent(id)}`),
  verifyHandoff: (registration: string, id: string, userId: string, pin: string) =>
    request<HandoffRecord>(`/aircraft/${encodeURIComponent(registration)}/handoff/${encodeURIComponent(id)}/verify`, { method: 'POST', body: JSON.stringify({ userId, pin }) }),
  acknowledgeHandoff: (registration: string, id: string, taskId: string, question = '', resolution = '') =>
    request<HandoffRecord>(`/aircraft/${encodeURIComponent(registration)}/handoff/${encodeURIComponent(id)}/acknowledge`, { method: 'POST', body: JSON.stringify({ taskId, question, resolution }) }),
  confirmHandoff: (registration: string, id: string) =>
    request<HandoffRecord>(`/aircraft/${encodeURIComponent(registration)}/handoff/${encodeURIComponent(id)}/confirm`, { method: 'POST' }),
  finishHandoff: (registration: string, id: string) =>
    request<HandoffRecord>(`/aircraft/${encodeURIComponent(registration)}/handoff/${encodeURIComponent(id)}/finish`, { method: 'POST' }),
  reviewHandoff: (registration: string) =>
    request<HandoffReview>(`/aircraft/${encodeURIComponent(registration)}/handoff/review`, { method: 'POST' }),
  buildHandoffReport: (registration: string, answers: HandoffAnswer[]) =>
    request<HandoffReport>(`/aircraft/${encodeURIComponent(registration)}/handoff/report`, { method: 'POST', body: JSON.stringify({ answers }) }),
  employees: () => request<Employee[]>('/auth/employees'),
  async login(userId: string, pin: string) {
    const result = await request<{ token: string; employee: Employee }>('/auth/login', {
      method: 'POST', body: JSON.stringify({ user_id: userId, pin }),
    })
    token = result.token
    return result.employee
  },
  async logout() {
    await request<void>('/auth/logout', { method: 'POST' })
    token = null
  },
  saveItem: (registration: string, draft: InspectionDraft, id?: string) =>
    request<WorkItem>(`/aircraft/${encodeURIComponent(registration)}/items${id ? `/${encodeURIComponent(id)}` : ''}`, { method: id ? 'PUT' : 'POST', body: JSON.stringify(draft) }),
  captureText: (registration: string, transcript: string, draft: InspectionDraft, clarifications: ClarificationAnswer[] = []) =>
    request<CaptureResult>(`/aircraft/${encodeURIComponent(registration)}/capture/text`, { method: 'POST', body: JSON.stringify({ transcript, draft, clarifications }) }),
  transcribeAnswer: (registration: string, audio: Blob) => {
    const form = new FormData()
    form.append('audio', audio, 'answer.wav')
    return request<{ transcript: string }>(`/aircraft/${encodeURIComponent(registration)}/capture/transcribe`, { method: 'POST', body: form })
  },
  captureAudio: (registration: string, audio: Blob, draft: InspectionDraft) => {
    const form = new FormData()
    form.append('audio', audio, 'inspection.wav')
    form.append('draft', JSON.stringify(draft))
    return request<CaptureResult>(`/aircraft/${encodeURIComponent(registration)}/capture/audio`, { method: 'POST', body: form })
  },
  board: (registration: string) => request<AircraftBoard>(`/aircraft/${encodeURIComponent(registration)}/board`),
  aircraft: () => request<AircraftVisit[]>('/aircraft'),
  selectAircraft: (registration: string) => request<AircraftVisit>(`/aircraft/${encodeURIComponent(registration)}`),
  createVisit: (visit: Omit<AircraftVisit, 'openItems' | 'handoffItems' | 'completedItems' | 'totalItems'>) =>
    request<AircraftVisit>('/aircraft', { method: 'POST', body: JSON.stringify(visit) }),
}

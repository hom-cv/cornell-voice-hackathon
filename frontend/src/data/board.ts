import type { AircraftVisit } from './aircraft'
import type { Employee } from './employees'

export type WorkStatus = 'not_started' | 'open' | 'in_progress' | 'blocked' | 'done'
export interface WorkItem {
  id: string
  title: string
  area: string
  assigneeId: string | null
  status: WorkStatus
  stoppedAt: string
  leftOpen: boolean
  handoffReviewRequired: boolean
  manualReference: string
  found: string
  workDone: string
  nextAction: string
  photoData: string
}
export interface AircraftBoard {
  aircraft: AircraftVisit
  items: WorkItem[]
  employees: Employee[]
}

export type InspectionDraft = Omit<WorkItem, 'id' | 'assigneeId'>
export interface ClarificationAnswer { question: string; answer: string }
export interface CaptureResult { transcript: string; draft: InspectionDraft; warnings: string[]; questions: string[] }

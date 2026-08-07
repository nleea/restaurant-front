// Typed Business Profile ("Perfil del negocio") API layer over the foundation's Axios instance.
// Reads are open to any authenticated user; every write requires `menu.manage`. All JSON here is
// camelCase (unlike the older snake_case modules). Operating-hours times are minutes-from-midnight
// (480 = 08:00, 1440 = 24:00); weekday is 0=Monday … 6=Sunday; a weekday with no window = closed.
import { http } from '@/lib/http'

export interface OperatingHoursWindow {
  id: string
  weekday: number
  openMinute: number
  closeMinute: number
}

export interface BranchProfile {
  id: string
  name: string
  // Nullable: the backend returns null for details that were never set.
  address: string | null
  phone: string | null
  isPrimary: boolean
  hours: OperatingHoursWindow[]
}

export interface BusinessProfile {
  tenantId: string
  name: string
  taxId: string | null
  email: string | null
  phone: string | null
  photoUrl: string | null
  paymentQrUrl: string | null
  bannerUrl: string | null
  staffCount: number
  branches: BranchProfile[]
}

// The write payload is a deliberate subset: identity fields plus editable per-branch details.
export interface UpdateBranchInput {
  id: string
  address: string
  phone: string
  // Editable porque es lo que ve el cliente: la carta pública y el saludo de WhatsApp lo
  // interpolan. Nace como "Main Branch" en la semilla. Omitirlo deja el nombre como estaba.
  name?: string
}

export interface UpdateBusinessProfileInput {
  name: string
  taxId: string
  email: string
  phone: string
  photoUrl?: string
  paymentQrUrl?: string
  branches: UpdateBranchInput[]
}

// A single operating-hours window as sent when saving a branch's weekly schedule.
export interface HoursWindowInput {
  weekday: number
  openMinute: number
  closeMinute: number
}

export async function getBusinessProfile(): Promise<BusinessProfile> {
  return (await http.get<BusinessProfile>('/business/profile')).data
}

export async function updateBusinessProfile(
  payload: UpdateBusinessProfileInput,
): Promise<BusinessProfile> {
  return (await http.put<BusinessProfile>('/business/profile', payload)).data
}

export async function getBranchHours(branchId: string): Promise<OperatingHoursWindow[]> {
  return (await http.get<OperatingHoursWindow[]>(`/business/branches/${branchId}/hours`)).data
}

export async function setBranchHours(
  branchId: string,
  windows: HoursWindowInput[],
): Promise<OperatingHoursWindow[]> {
  return (
    await http.put<OperatingHoursWindow[]>(`/business/branches/${branchId}/hours`, { windows })
  ).data
}

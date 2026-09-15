import { http } from './http'
import type {
  CurrentUserResponse,
  LoginPayload,
  LoginResponse
} from '@/types/auth'

export function loginApi(payload: LoginPayload) {
  return http.post<LoginResponse>('/auth/login', payload)
}

export function getCurrentUserApi() {
  return http.get<CurrentUserResponse>('/auth/me')
}

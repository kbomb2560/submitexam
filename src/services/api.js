import { composeFullName, deriveGenderFromPrefix, normalizeRegistrationWindow } from '../utils/helpers.js'

const LOGIN_API_URL = 'https://academic.pcru.ac.th/api-dev/submit-api/login_api.php'
const REGISTRATION_API_URL = 'https://academic.pcru.ac.th/api-dev/submit-api/api/'

const DEFAULT_TIMEOUT_MS = 10000

const API_KEY = import.meta.env?.VITE_SUBMIT_API_KEY || 'academic-pcru'

const defaultHeaders = {
  'Content-Type': 'application/json',
  ...(API_KEY ? { 'X-API-KEY': API_KEY } : {}),
}

const timeoutMessage = 'การเชื่อมต่อหมดเวลา กรุณาลองใหม่'

function createAbortSignal(timeout = DEFAULT_TIMEOUT_MS) {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeout)

  return {
    signal: controller.signal,
    cancel: () => clearTimeout(timeoutId),
  }
}

function wrapNetworkError(error, fallback) {
  if (error.name === 'AbortError') {
    return new Error(timeoutMessage)
  }
  if (error instanceof TypeError) {
    return new Error('ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์')
  }
  return new Error(error?.message || fallback)
}

export async function login({ username, password, timeout = DEFAULT_TIMEOUT_MS }) {
  if (!username || !password) {
    throw new Error('กรุณากรอกข้อมูลให้ครบถ้วน')
  }

  const params = new URLSearchParams({
    action: 'login',
    username: username.trim(),
    password,
  })

  const url = `${LOGIN_API_URL}?${params.toString()}`

  const { signal, cancel } = createAbortSignal(timeout)

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(API_KEY ? { 'X-API-KEY': API_KEY } : {}),
      },
      signal,
    })

    const payload = await response.json().catch(() => null)

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        throw new Error('ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง')
      }
      throw new Error(payload?.message || 'ไม่สามารถเข้าสู่ระบบได้ กรุณาลองใหม่')
    }

    const isSuccess = payload?.status ?? payload?.success

    if (!isSuccess) {
      throw new Error(payload?.message || 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง')
    }

    const data = payload?.data

    if (!data) {
      throw new Error('ไม่พบข้อมูลผู้ใช้จากระบบ')
    }

    const raw = data?.raw_data && typeof data.raw_data === 'object' ? data.raw_data : {}

    const rawUserTypeValue = (raw.USER_TYPE ?? data.user_type ?? 'employee').toString().trim()
    const normalizedUserType = rawUserTypeValue !== '' ? rawUserTypeValue.toLowerCase() : 'employee'
    const rawUserRoleValue = (raw.USER_ROLE ?? data.user_role ?? '').toString().toLowerCase()
    const normalizedUserRole =
      rawUserRoleValue.includes('admin') ||
      rawUserRoleValue.includes('administrator') ||
      rawUserRoleValue.includes('ผู้ดูแล') ||
      normalizedUserType.includes('admin')
        ? 'admin'
        : 'user'
    const prefixName = raw.PREFIX_NAME ?? data.prefix_name ?? ''
    const firstName = raw.FIRST_NAME ?? data.first_name ?? ''
    const lastName = raw.LAST_NAME ?? data.last_name ?? ''
    const fullName = composeFullName(prefixName, firstName, lastName, raw.FULL_NAME ?? data.full_name ?? '')

    const normalized = {
      ...raw,
      EMP_CODE: raw.EMP_CODE ?? data.emp_code ?? data.user_id ?? '',
      PREFIX_NAME: prefixName,
      FIRST_NAME: firstName,
      LAST_NAME: lastName,
      FULL_NAME: fullName,
      FIRST_NAME_ENG: raw.FIRST_NAME_ENG ?? '',
      LAST_NAME_ENG: raw.LAST_NAME_ENG ?? '',
      FULL_NAME_ENG: raw.FULL_NAME_ENG ?? '',
      POSITION_NAME: raw.POSITION_NAME ?? raw.POSITION ?? '',
      LEVEL_NAME: raw.LEVEL_NAME ?? raw.LEVEL ?? '',
      LEVEL_CODE: raw.LEVEL_CODE ?? raw.LEVEL_ID ?? data.level_code ?? '',
      SECTION_NAME: raw.SECTION_NAME ?? raw.SECTION ?? '',
      DEPARTMENT_NAME: raw.DEPARTMENT_NAME ?? data.department_name ?? '',
      PHONE: raw.PHONE ?? data.phone ?? '',
      USER_TYPE: normalizedUserType || 'employee',
      USER_ROLE: normalizedUserRole,
      GENDER: raw.GENDER ?? deriveGenderFromPrefix(raw.PREFIX_NAME ?? ''),
    }

    return normalized
  } catch (error) {
    throw wrapNetworkError(error, 'ไม่สามารถเข้าสู่ระบบได้ กรุณาลองใหม่')
  } finally {
    cancel()
  }
}

export async function submitRegistration(data, { timeout = DEFAULT_TIMEOUT_MS } = {}) {
  const { signal, cancel } = createAbortSignal(timeout)

  try {
    const response = await fetch(REGISTRATION_API_URL, {
      method: 'POST',
      headers: defaultHeaders,
      body: JSON.stringify(data),
      signal,
    })

    const payload = await response.json().catch(() => null)

    if (response.status === 409 || payload?.message === 'Already registered') {
      const error = new Error('คุณได้ลงทะเบียนแล้ว')
      error.code = 'ALREADY_REGISTERED'
      error.details = payload?.data || null
      throw error
    }

    if (!response.ok) {
      throw new Error(payload?.message || 'ไม่สามารถบันทึกข้อมูลได้ กรุณาลองใหม่')
    }

    if (!payload?.status) {
      throw new Error(payload?.message || 'ไม่สามารถบันทึกข้อมูลได้ กรุณาลองใหม่')
    }

    return payload.data
  } catch (error) {
    throw wrapNetworkError(error, 'ไม่สามารถบันทึกข้อมูลได้ กรุณาลองใหม่')
  } finally {
    cancel()
  }
}

export async function fetchRegistrationDetail(empCode, { timeout = DEFAULT_TIMEOUT_MS } = {}) {
  if (!empCode) {
    throw new Error('Missing employee code')
  }

  const { signal, cancel } = createAbortSignal(timeout)

  try {
    const url = `${REGISTRATION_API_URL}?action=detail&emp_code=${encodeURIComponent(empCode)}`
    const response = await fetch(url, {
      method: 'GET',
      headers: defaultHeaders,
      signal,
    })

    const payload = await response.json().catch(() => null)

    if (response.status === 404) {
      return null
    }

    if (!response.ok) {
      throw new Error(payload?.message || 'ไม่สามารถดึงข้อมูลได้')
    }

    const isSuccess = payload?.status ?? payload?.success

    if (!isSuccess) {
      return null
    }

    return payload?.data ?? null
  } catch (error) {
    throw wrapNetworkError(error, 'ไม่สามารถดึงข้อมูลได้')
  } finally {
    cancel()
  }
}

export async function fetchRegistrations({
  timeout = DEFAULT_TIMEOUT_MS,
  userType,
  userRole,
  empCode,
  limit = 1000,
} = {}) {
  const { signal, cancel } = createAbortSignal(timeout)

  try {
    const params = new URLSearchParams({ action: 'list' })
    if (Number.isInteger(limit)) {
      params.set('limit', String(limit))
    }
    if (userType) params.set('user_type', userType)
    if (userRole) params.set('user_role', userRole)
    if (empCode) params.set('emp_code', empCode)

    const response = await fetch(`${REGISTRATION_API_URL}?${params.toString()}`, {
      method: 'GET',
      headers: defaultHeaders,
      signal,
    })

    const payload = await response.json().catch(() => null)

    if (!response.ok) {
      throw new Error(payload?.message || 'ไม่สามารถดึงข้อมูลการลงทะเบียนได้')
    }

    const isSuccess = payload?.status ?? payload?.success

    if (!isSuccess) {
      throw new Error(payload?.message || 'ไม่สามารถดึงข้อมูลการลงทะเบียนได้')
    }

    return payload?.data ?? []
  } catch (error) {
    throw wrapNetworkError(error, 'ไม่สามารถดึงข้อมูลการลงทะเบียนได้')
  } finally {
    cancel()
  }
}

export async function fetchRegistrationTotal({ timeout = DEFAULT_TIMEOUT_MS } = {}) {
  const { signal, cancel } = createAbortSignal(timeout)

  try {
    const response = await fetch(`${REGISTRATION_API_URL}?action=public_total`, {
      method: 'GET',
      headers: defaultHeaders,
      signal,
    })

    const payload = await response.json().catch(() => null)

    if (!response.ok) {
      throw new Error(payload?.message || 'ไม่สามารถดึงจำนวนผู้ลงทะเบียนได้')
    }

    const isSuccess = payload?.status ?? payload?.success ?? false

    if (!isSuccess) {
      throw new Error(payload?.message || 'ไม่สามารถดึงจำนวนผู้ลงทะเบียนได้')
    }

    return payload?.data ?? { total: 0 }
  } catch (error) {
    throw wrapNetworkError(error, 'ไม่สามารถดึงจำนวนผู้ลงทะเบียนได้')
  } finally {
    cancel()
  }
}

export async function fetchRegistrationWindow({ timeout = DEFAULT_TIMEOUT_MS } = {}) {
  const { signal, cancel } = createAbortSignal(timeout)

  try {
    const response = await fetch(`${REGISTRATION_API_URL}?action=window`, {
      method: 'GET',
      headers: defaultHeaders,
      signal,
    })

    const payload = await response.json().catch(() => null)

    if (!response.ok) {
      throw new Error(payload?.message || 'ไม่สามารถดึงช่วงเวลาลงทะเบียนได้')
    }

    const isSuccess = payload?.status ?? payload?.success ?? false

    if (!isSuccess) {
      throw new Error(payload?.message || 'ไม่สามารถดึงช่วงเวลาลงทะเบียนได้')
    }

    return normalizeRegistrationWindow(payload?.data ?? null)
  } catch (error) {
    throw wrapNetworkError(error, 'ไม่สามารถดึงช่วงเวลาลงทะเบียนได้')
  } finally {
    cancel()
  }
}



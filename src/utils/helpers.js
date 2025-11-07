export const EXAM_DATE_BUDDHIST = '2568-12-07'
export const REGISTRATION_DEADLINE_BUDDHIST = '2568-11-12T23:59'
export const SESSION_TIMEOUT_MS = 10 * 60 * 1000

export function deriveGenderFromPrefix(prefix) {
  const text = (prefix || '').toString().trim()
  if (!text) return 'ไม่ระบุ'

  if (text.startsWith('นาย') || text.startsWith('Mr')) {
    return 'ชาย'
  }
  if (text.startsWith('นางสาว') || text.startsWith('นาง') || text.startsWith('Mrs') || text.startsWith('Ms')) {
    return 'หญิง'
  }

  return 'ไม่ระบุ'
}

export function createSequenceNumber(empCode, timestamp) {
  const codeFragment = String(empCode || '').slice(-3) || '000'
  const timeFragment = String(timestamp).slice(-5)
  return Number(`${codeFragment}${timeFragment}`)
}

export function composeFullName(prefixName, firstName, lastName, fallback = '') {
  const prefix = (prefixName || '').toString().trim()
  const first = (firstName || '').toString().trim()
  const last = (lastName || '').toString().trim()

  const parts = []
  if (prefix) parts.push(prefix)
  if (first) parts.push(first)
  if (last) parts.push(last)

  const composed = parts.join(parts.length === 2 && prefix ? '' : ' ').trim()
  if (composed) {
    return composed
  }
  return (fallback || '').toString().trim()
}

export function getExamDate() {
  const [buddhistYear, buddhistMonth, buddhistDay] = EXAM_DATE_BUDDHIST.split('-').map(Number)
  if (!buddhistYear || !buddhistMonth || !buddhistDay) {
    return new Date()
  }
  const gregorianYear = buddhistYear - 543
  return new Date(Date.UTC(gregorianYear, buddhistMonth - 1, buddhistDay, 0, 0, 0, 0))
}

export function getRegistrationDeadline() {
  const [datePart, timePart = '23:59'] = REGISTRATION_DEADLINE_BUDDHIST.split('T')
  const [buddhistYear, buddhistMonth, buddhistDay] = datePart.split('-').map(Number)
  if (!buddhistYear || !buddhistMonth || !buddhistDay) {
    return new Date()
  }
  const [hour = 23, minute = 59] = timePart.split(':').map(Number)
  const gregorianYear = buddhistYear - 543
  return new Date(gregorianYear, buddhistMonth - 1, buddhistDay, hour, minute, 0, 0)
}

export function calculateCountdown(targetDate, referenceDate = new Date()) {
  const targetTime = targetDate instanceof Date ? targetDate.getTime() : new Date(targetDate).getTime()
  const referenceTime = referenceDate instanceof Date ? referenceDate.getTime() : new Date(referenceDate).getTime()

  const totalMs = Math.max(0, targetTime - referenceTime)

  let remaining = totalMs
  const days = Math.floor(remaining / (1000 * 60 * 60 * 24))
  remaining -= days * 1000 * 60 * 60 * 24
  const hours = Math.floor(remaining / (1000 * 60 * 60))
  remaining -= hours * 1000 * 60 * 60
  const minutes = Math.floor(remaining / (1000 * 60))

  return {
    totalMs,
    days,
    hours,
    minutes,
  }
}

export function createRegistrationTimestamps() {
  const registrationTimestamp = Date.now()
  const registrationDatetime = new Date(registrationTimestamp).toISOString()

  return {
    registrationTimestamp,
    registrationDatetime,
  }
}

export function createRegistrationPayload(user, formData, timestamps) {
  const sequenceNumber = createSequenceNumber(user?.EMP_CODE, timestamps.registrationTimestamp)
  const gender = deriveGenderFromPrefix(user?.PREFIX_NAME)
  const rawUserType = (user?.USER_TYPE ?? 'employee').toString().trim()
  const normalizedUserType = rawUserType !== '' ? rawUserType.toLowerCase() : 'employee'
  const roleSource = (user?.USER_ROLE ?? '').toString().toLowerCase()
  const userRole =
    roleSource.includes('admin') || roleSource.includes('ผู้ดูแล') || normalizedUserType.includes('admin')
      ? 'admin'
      : 'user'
  const phoneNumber = formData?.phone?.toString().trim() || user?.PHONE || ''
  const levelCode = user?.LEVEL_CODE || ''
  const prefixName = user?.PREFIX_NAME ?? ''
  const firstName = user?.FIRST_NAME ?? ''
  const lastName = user?.LAST_NAME ?? ''
  const fullName = composeFullName(prefixName, firstName, lastName, user?.FULL_NAME)

  return {
    emp_code: user?.EMP_CODE ?? '',
    prefix_name: prefixName,
    first_name: firstName,
    last_name: lastName,
    full_name: fullName,
    full_name_eng: user?.FULL_NAME_ENG ?? '',
    position_name: user?.POSITION_NAME ?? '',
    level_name: user?.LEVEL_NAME ?? '',
    level_code: levelCode,
    section_name: user?.SECTION_NAME ?? '',
    department_name: user?.DEPARTMENT_NAME ?? '',
    exam_date: EXAM_DATE_BUDDHIST,
    registration_timestamp: timestamps.registrationTimestamp,
    registration_datetime: timestamps.registrationDatetime,
    sequence_number: sequenceNumber,
    phone_number: phoneNumber,
    user_type: normalizedUserType,
    user_role: userRole,
    gender,
    confirmed_data: Boolean(formData?.confirmedData),
    confirmed_exam: Boolean(formData?.confirmedExam),
    status: 'registered',
  }
}

export function formatThaiDateTime(value) {
  if (!value) return '-'

  try {
    const date = typeof value === 'string' || typeof value === 'number' ? new Date(value) : value

    const formatter = new Intl.DateTimeFormat('th-TH', {
      dateStyle: 'long',
      timeStyle: 'medium',
      hour12: false,
    })

    return formatter.format(date)
  } catch {
    return value
  }
}

export function formatQueueNumber(queueNumber) {
  if (queueNumber === null || queueNumber === undefined) return '-'
  return Number.isFinite(queueNumber) ? queueNumber.toString().padStart(3, '0') : String(queueNumber)
}

export function summarizeRegistrations(registrations = []) {
  const total = registrations.length

  const byUserType = new Map()
  const byDepartment = new Map()
  const byLevel = new Map()
  const byGender = new Map()

  const byUserRole = new Map()

  registrations.forEach((item) => {
    const typeRaw = (item.user_type || item.USER_TYPE || '').toString().trim()
    const type = typeRaw !== '' ? typeRaw : 'ไม่ระบุ'
    const roleRaw = (item.user_role || item.USER_ROLE || '').toString().toLowerCase()
    const role = roleRaw.includes('admin') ? 'ผู้ดูแลระบบ' : 'ผู้ใช้งานทั่วไป'
    const department = item.department_name || item.DEPARTMENT_NAME || 'ไม่ระบุ'
    const level = item.level_name || item.LEVEL_NAME || 'ไม่ระบุ'
    const gender = item.gender || deriveGenderFromPrefix(item.prefix_name || item.PREFIX_NAME)

    byUserType.set(type, (byUserType.get(type) || 0) + 1)
    byUserRole.set(role, (byUserRole.get(role) || 0) + 1)
    byDepartment.set(department, (byDepartment.get(department) || 0) + 1)
    byLevel.set(level, (byLevel.get(level) || 0) + 1)
    byGender.set(gender, (byGender.get(gender) || 0) + 1)
  })

  const normalizeMap = (map) =>
    Array.from(map.entries())
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count)

  return {
    total,
    byUserType: normalizeMap(byUserType),
    byUserRole: normalizeMap(byUserRole),
    byDepartment: normalizeMap(byDepartment),
    byLevel: normalizeMap(byLevel),
    byGender: normalizeMap(byGender),
  }
}



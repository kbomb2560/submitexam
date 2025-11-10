import { useCallback, useEffect, useMemo, useState } from 'react'
import { Clock } from 'lucide-react'
import LoginForm from './components/LoginForm.jsx'
import RegistrationForm from './components/RegistrationForm.jsx'
import SuccessPage from './components/SuccessPage.jsx'
import AdminDashboard from './components/AdminDashboard.jsx'
import {
  fetchRegistrationDetail,
  fetchRegistrationTotal,
  fetchRegistrationWindow,
  fetchRegistrations,
  login,
  submitRegistration,
} from './services/api.js'
import {
  SESSION_TIMEOUT_MS,
  createRegistrationPayload,
  createRegistrationTimestamps,
  summarizeRegistrations,
  calculateCountdown,
  normalizeRegistrationWindow,
  formatThaiDateTime,
} from './utils/helpers.js'

const initialState = {
  session: null,
  view: 'login',
  loginError: '',
  registrationError: '',
  message: '',
}

const HISTORY_STATE_KEY = '__submitexam__'

function App() {
  const [session, setSession] = useState(initialState.session)
  const [view, setView] = useState(initialState.view)
  const [loginError, setLoginError] = useState(initialState.loginError)
  const [registrationError, setRegistrationError] = useState(initialState.registrationError)
  const [toastMessage, setToastMessage] = useState(initialState.message)
  const [isLoggingIn, setIsLoggingIn] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [registrationResult, setRegistrationResult] = useState(null)
  const [isLoadingDashboard, setIsLoadingDashboard] = useState(false)
  const [dashboardError, setDashboardError] = useState('')
  const [dashboardSummary, setDashboardSummary] = useState(null)
  const [dashboardUpdatedAt, setDashboardUpdatedAt] = useState(null)
  const [adminTab, setAdminTab] = useState('profile')
  const [isLoadingProfile, setIsLoadingProfile] = useState(false)
  const [profileError, setProfileError] = useState('')
  const [dashboardRegistrations, setDashboardRegistrations] = useState([])
  const [now, setNow] = useState(Date.now())
  const [registrationWindow, setRegistrationWindow] = useState(null)
  const [isLoadingWindow, setIsLoadingWindow] = useState(true)
  const [windowError, setWindowError] = useState('')
  const [publicRegistrationTotal, setPublicRegistrationTotal] = useState(null)
  const [publicRegistrationUpdatedAt, setPublicRegistrationUpdatedAt] = useState(null)

  const user = session?.user
  const userRoleValue = (user?.USER_ROLE || '').toString().toLowerCase()
  const registrationRoleValue = (registrationResult?.user_role || '').toString().toLowerCase()
  const isAdmin = userRoleValue === 'admin' || registrationRoleValue === 'admin'
  const openTimestamp = registrationWindow?.openTimestamp ?? null
  const closeTimestamp = registrationWindow?.closeTimestamp ?? null
  const registrationOpenDate = registrationWindow?.opensAt ?? null
  const registrationCloseDate = registrationWindow?.closesAt ?? null
  const isBeforeOpen = registrationWindow ? now < openTimestamp : false
  const isAfterClose = registrationWindow ? now > closeTimestamp : false
  const openCountdown = useMemo(() => {
    if (!registrationOpenDate) return null
    return calculateCountdown(registrationOpenDate, new Date(now))
  }, [registrationOpenDate, now])
  const closeCountdown = useMemo(() => {
    if (!registrationCloseDate) return null
    return calculateCountdown(registrationCloseDate, new Date(now))
  }, [registrationCloseDate, now])
  const showClosedState = !isLoadingWindow && Boolean(registrationWindow) && (isBeforeOpen || isAfterClose)

  const loadDashboardSummary = useCallback(
    async (force = false, contextUser, contextRole) => {
      const effectiveUser = contextUser || user
      const effectiveRole = (contextRole || effectiveUser?.USER_ROLE || registrationRoleValue || '')
        .toString()
        .toLowerCase()
      const effectiveType = (effectiveUser?.USER_TYPE || '').toString().toLowerCase()
      const canAccess = effectiveRole === 'admin' || effectiveType.includes('admin')

      if (!canAccess && !force) return

      setIsLoadingDashboard(true)
      setDashboardError('')

      try {
        const data = await fetchRegistrations({
          userType: effectiveUser?.USER_TYPE,
          userRole: contextRole || effectiveUser?.USER_ROLE || registrationRoleValue,
          empCode: effectiveUser?.EMP_CODE,
        })
        const items = Array.isArray(data) ? data : data?.items ?? []
        setDashboardRegistrations(items)
        setDashboardSummary(summarizeRegistrations(items))
        setDashboardUpdatedAt(Date.now())
      } catch (error) {
        setDashboardError(error.message || 'ไม่สามารถโหลดสถิติการลงทะเบียนได้')
        setDashboardRegistrations([])
      } finally {
        setIsLoadingDashboard(false)
      }
    },
    [user, registrationRoleValue]
  )

  const persistState = useCallback((sessionValue, viewValue, registrationValue, adminTabValue) => {
    if (typeof window === 'undefined' || typeof window.history === 'undefined') return

    const currentState = window.history.state && typeof window.history.state === 'object' ? { ...window.history.state } : {}

    if (sessionValue && sessionValue.expiresAt > Date.now()) {
      currentState[HISTORY_STATE_KEY] = {
        session: sessionValue,
        view: viewValue,
        registrationResult: registrationValue,
        adminTab: adminTabValue,
      }
    } else {
      delete currentState[HISTORY_STATE_KEY]
    }

    window.history.replaceState(currentState, document.title)
  }, [])

  const handleLogout = useCallback((reason) => {
    setSession(null)
    setView('login')
    setRegistrationResult(null)
    setRegistrationError('')
    setDashboardSummary(null)
    setDashboardUpdatedAt(null)
    setDashboardRegistrations([])
    setAdminTab('profile')
    persistState(null, null, null, 'profile')

    if (reason === 'timeout') {
      setToastMessage('เซสชันหมดเวลา กรุณาเข้าสู่ระบบอีกครั้ง')
    } else if (reason === 'success') {
      setToastMessage('ออกจากระบบเรียบร้อยแล้ว')
    } else {
      setToastMessage(reason || '')
    }
  }, [persistState])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const persisted = window.history.state && window.history.state[HISTORY_STATE_KEY]
    if (!persisted || !persisted.session) {
      return
    }

    if (persisted.session.expiresAt <= Date.now()) {
      persistState(null, null, null, 'profile')
      return
    }

    setSession(persisted.session)
    setView(persisted.view || 'register')
    if (persisted.registrationResult) {
      setRegistrationResult(persisted.registrationResult)
    }
    if (persisted.adminTab) {
      setAdminTab(persisted.adminTab)
    }
    setToastMessage('คุณยังคงเข้าสู่ระบบอยู่')
  }, [persistState])

  useEffect(() => {
    if (!session?.expiresAt) return undefined

    const remaining = session.expiresAt - Date.now()

    if (remaining <= 0) {
      handleLogout('timeout')
      return undefined
    }

    const timer = setTimeout(() => {
      handleLogout('timeout')
    }, remaining)

    return () => clearTimeout(timer)
  }, [session?.expiresAt, handleLogout])

  useEffect(() => {
    persistState(session, view, registrationResult, adminTab)
  }, [session, view, registrationResult, adminTab, persistState])

  useEffect(() => {
    let cancelled = false
    let timerId

    const fetchTotal = async () => {
      try {
        const data = await fetchRegistrationTotal()
        if (cancelled) return
        const totalValue = data?.total
        if (typeof totalValue === 'number' && Number.isFinite(totalValue)) {
          setPublicRegistrationTotal(totalValue)
        }
        setPublicRegistrationUpdatedAt(Date.now())
      } catch (error) {
        if (cancelled) return
        console.warn('ไม่สามารถดึงยอดรวมผู้ลงทะเบียนได้', error)
      }
    }

    fetchTotal()
    timerId = setInterval(fetchTotal, 10 * 1000)

    return () => {
      cancelled = true
      clearInterval(timerId)
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    const loadWindow = async (showLoading = true) => {
      if (showLoading) {
        setIsLoadingWindow(true)
      }
      setWindowError('')
      try {
        const data = await fetchRegistrationWindow()
        if (cancelled) return
        setRegistrationWindow(data)
      } catch (error) {
        if (cancelled) return
        setWindowError(error.message || 'ไม่สามารถดึงช่วงเวลาลงทะเบียนได้')
        setRegistrationWindow(normalizeRegistrationWindow(null))
      } finally {
        if (!cancelled) {
          setIsLoadingWindow(false)
        }
      }
    }

    loadWindow(true)
    const interval = setInterval(() => {
      loadWindow(false)
    }, 5 * 60 * 1000)

    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [])

  useEffect(() => {
    const timer = setInterval(() => {
      setNow(Date.now())
    }, 1000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    if (!registrationWindow) return
    if (isAdmin && user && view !== 'admin' && !isBeforeOpen && !isAfterClose) {
      setView('admin')
      setAdminTab((previous) => previous || 'profile')
    }
  }, [isAdmin, user, view, isBeforeOpen, isAfterClose, registrationWindow])

  const handleLogin = async ({ username, password }) => {
    if (isLoadingWindow) {
      setLoginError('กำลังตรวจสอบช่วงเวลาลงทะเบียน กรุณารอสักครู่')
      return
    }
    if (!registrationWindow) {
      setLoginError('ไม่สามารถตรวจสอบช่วงเวลาลงทะเบียนได้')
      return
    }
    if (isBeforeOpen) {
      setLoginError('ระบบยังไม่เปิดให้ลงทะเบียน')
      return
    }
    if (isAfterClose) {
      setLoginError('ระบบปิดรับลงทะเบียนแล้ว')
      return
    }
    setIsLoggingIn(true)
    setLoginError('')
    setToastMessage('')

    try {
      const data = await login({ username, password })
      const now = Date.now()
      setSession({
        user: data,
        loginAt: now,
        expiresAt: now + SESSION_TIMEOUT_MS,
      })
      const isAdminUser = (data?.USER_ROLE || '').toString().toLowerCase() === 'admin'

      let detail = null
      if (data?.EMP_CODE) {
        try {
          detail = await fetchRegistrationDetail(data.EMP_CODE)
        } catch (detailError) {
          console.warn('ไม่สามารถตรวจสอบสถานะการลงทะเบียนได้', detailError)
        }
      }

      if (detail?.registration) {
        const existing = detail.registration
        setRegistrationResult({
          registration_id: existing.id,
          queue_number: detail.queue_number ?? null,
          registration_datetime: existing.registration_datetime,
          registration_timestamp: existing.registration_timestamp,
          sequence_number: existing.sequence_number,
          phone_number: existing.phone_number,
          user_type: existing.user_type,
          user_role: existing.user_role,
          department_name: existing.department_name,
          level_name: existing.level_name,
          level_code: existing.level_code,
          gender: existing.gender,
          emp_code: existing.emp_code || data?.EMP_CODE || user?.EMP_CODE,
        })
        setRegistrationError('')
        setToastMessage('คุณได้ลงทะเบียนเรียบร้อยแล้ว แสดงข้อมูลที่บันทึกไว้')
        if (isAdminUser) {
          setView('admin')
          loadDashboardSummary(true, data, existing.user_role || data?.USER_ROLE)
        } else {
          setView('success')
        }
        return
      }

      if (isAdminUser) {
        setView('admin')
        loadDashboardSummary(true, data, data?.USER_ROLE)
      } else {
        setView('register')
      }
    } catch (error) {
      setLoginError(error.message)
    } finally {
      setIsLoggingIn(false)
    }
  }

  const handleRegistrationSubmit = async (formData) => {
    if (!user) return

    setIsSubmitting(true)
    setRegistrationError('')

    const timestamps = createRegistrationTimestamps()
    const payload = createRegistrationPayload(user, formData, timestamps)

    try {
      const result = await submitRegistration(payload)
      setRegistrationResult({
        ...result,
        registration_datetime: timestamps.registrationDatetime,
        registration_timestamp: timestamps.registrationTimestamp,
        sequence_number: payload.sequence_number,
        phone_number: payload.phone_number,
        user_type: payload.user_type,
        user_role: payload.user_role,
        department_name: payload.department_name,
        level_name: payload.level_name,
        level_code: payload.level_code,
        gender: payload.gender,
        emp_code: payload.emp_code || user?.EMP_CODE,
      })
      if (isAdmin) {
        setView('admin')
        loadDashboardSummary(true, user, payload.user_role)
      } else {
        setView('success')
      }
    } catch (error) {
      if (error.code === 'ALREADY_REGISTERED' && error.details?.registration) {
        const existing = error.details.registration
        const queueNumber = error.details.queue_number ?? null
        setRegistrationResult({
          registration_id: existing.id,
          queue_number: queueNumber,
          registration_datetime: existing.registration_datetime,
          registration_timestamp: existing.registration_timestamp,
          sequence_number: existing.sequence_number,
          phone_number: existing.phone_number,
          user_type: existing.user_type,
          user_role: existing.user_role,
          department_name: existing.department_name,
          level_name: existing.level_name,
          level_code: existing.level_code,
          gender: existing.gender,
          emp_code: existing.emp_code || user?.EMP_CODE,
        })
        setRegistrationError('')
        if (isAdmin) {
          setView('admin')
          loadDashboardSummary(true, user, existing.user_role)
        } else {
          setView('success')
        }
        setToastMessage('คุณได้ลงทะเบียนเรียบร้อยแล้ว แสดงข้อมูลที่บันทึกไว้')
      } else {
        setRegistrationError(error.message || 'ไม่สามารถบันทึกข้อมูลได้ กรุณาลองใหม่')
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  useEffect(() => {
    if (isAdmin && view === 'admin' && adminTab === 'dashboard') {
      loadDashboardSummary(false, user, registrationRoleValue)
    }
  }, [view, adminTab, isAdmin, registrationRoleValue, user, loadDashboardSummary])

  useEffect(() => {
    if (!user?.EMP_CODE) return

    const currentEmpCode = user.EMP_CODE
    const hasCurrentData = registrationResult?.emp_code === currentEmpCode

    if (hasCurrentData) return

    let cancelled = false
    setIsLoadingProfile(true)
    setProfileError('')

    fetchRegistrationDetail(currentEmpCode)
      .then((detail) => {
        if (cancelled) return
        if (detail?.registration) {
          const existing = detail.registration
          setRegistrationResult({
            registration_id: existing.id,
            queue_number: detail.queue_number ?? null,
            registration_datetime: existing.registration_datetime,
            registration_timestamp: existing.registration_timestamp,
            sequence_number: existing.sequence_number,
            phone_number: existing.phone_number,
            user_type: existing.user_type,
            user_role: existing.user_role,
            department_name: existing.department_name,
            level_name: existing.level_name,
            level_code: existing.level_code,
            gender: existing.gender,
            emp_code: existing.emp_code ?? currentEmpCode,
          })
        } else {
          setRegistrationResult(null)
        }
      })
      .catch((error) => {
        if (cancelled) return
        setProfileError(error.message || 'ไม่สามารถดึงข้อมูลการลงทะเบียนได้')
      })
      .finally(() => {
        if (cancelled) return
        setIsLoadingProfile(false)
      })

    return () => {
      cancelled = true
    }
  }, [user?.EMP_CODE, registrationResult])

  const formatCountdownText = (count) => {
    if (!count || count.totalMs <= 0) return '0 วินาที'
    const parts = []
    if (count.days) parts.push(`${count.days.toLocaleString('th-TH')} วัน`)
    if (count.hours) parts.push(`${count.hours.toString().padStart(2, '0')} ชม.`)
    if (count.minutes || (!count.days && !count.hours)) {
      parts.push(`${count.minutes.toString().padStart(2, '0')} นาที`)
    }
    parts.push(`${(count.seconds ?? 0).toString().padStart(2, '0')} วินาที`)
    return parts.join(' ')
  }

  return (
    <div className="flex min-h-screen flex-col bg-slate-100 font-sarabun">
      <header className="border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-600 text-lg font-bold text-white shadow-lg">
              PCRU
            </div>
            <div>
              <p className="text-sm font-semibold uppercase tracking-wide text-indigo-600">สำนักส่งเสริมวิชาการและงานทะเบียน</p>
              <h1 className="text-lg font-semibold text-slate-900">ระบบลงทะเบียนกรรมการคุมสอบ</h1>
            </div>
          </div>
          {user ? (
            <div className="flex items-center gap-3">
              <div className="text-right">
                <p className="text-sm font-semibold text-slate-900">{user.FULL_NAME}</p>
                <p className="text-xs text-slate-500">
                  ล็อกอินเมื่อ{' '}
                  {session?.loginAt
                    ? new Intl.DateTimeFormat('th-TH', {
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                      }).format(session.loginAt)
                    : '-'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => handleLogout('success')}
                className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:text-slate-800"
              >
                ออกจากระบบ
              </button>
            </div>
          ) : null}
        </div>
        {isAdmin && user ? (
          <nav className="border-t border-slate-200 bg-white/80">
            <div className="mx-auto flex w-full max-w-5xl flex-col gap-3 px-4 py-3 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between">
              <span>สิทธิ์ผู้ใช้งาน: ผู้ดูแลระบบ · แสดงแดชบอร์ดและข้อมูลการลงทะเบียนของตนเอง</span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setAdminTab('profile')}
                  className={`rounded-lg px-3 py-2 text-xs font-semibold transition sm:text-sm ${
                    adminTab === 'profile'
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'border border-slate-200 text-slate-600 hover:border-indigo-200 hover:text-indigo-600'
                  }`}
                >
                  ข้อมูลของฉัน
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAdminTab('dashboard')
                    loadDashboardSummary(true, user, registrationResult?.user_role || user?.USER_ROLE)
                  }}
                  className={`rounded-lg px-3 py-2 text-xs font-semibold transition sm:text-sm ${
                    adminTab === 'dashboard'
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'border border-slate-200 text-slate-600 hover:border-indigo-200 hover:text-indigo-600'
                  }`}
                >
                  แดชบอร์ดผู้ดูแล
                </button>
              </div>
            </div>
          </nav>
        ) : null}
      </header>

      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-8">
        {toastMessage && view !== 'login' ? (
          <div className="mx-auto w-full max-w-lg rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-center text-sm text-amber-700 shadow-sm">
            {toastMessage}
          </div>
        ) : null}

        {isLoadingWindow ? (
          <div className="mx-auto w-full max-w-2xl rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
            <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-indigo-100 text-indigo-600">
              <Clock className="h-9 w-9 animate-spin" />
            </div>
            <h2 className="text-xl font-semibold text-slate-900">กำลังโหลดข้อมูลช่วงเวลาลงทะเบียน</h2>
            <p className="mt-3 text-sm text-slate-600">กรุณารอสักครู่ ระบบกำลังดึงข้อมูลจากฐานข้อมูลกลาง</p>
          </div>
        ) : showClosedState ? (
          <div className="mx-auto w-full max-w-2xl rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
            <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-indigo-100 text-indigo-600">
              <Clock className="h-9 w-9" />
            </div>
            <h2 className="text-2xl font-semibold text-slate-900">ระบบลงทะเบียนกรรมการคุมสอบ</h2>
            {isBeforeOpen && registrationOpenDate ? (
              <>
                <p className="mt-3 text-sm text-slate-600">
                  ระบบจะเปิดให้ลงทะเบียนในอีก {formatCountdownText(openCountdown)}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  เปิดให้ลงทะเบียนในวันที่ {formatThaiDateTime(registrationOpenDate)}
                </p>
              </>
            ) : null}
            {isAfterClose && registrationCloseDate ? (
              <>
                <p className="mt-3 text-sm text-slate-600">ระบบปิดรับลงทะเบียนแล้ว</p>
                <p className="mt-1 text-xs text-slate-500">
                  ปิดรับลงทะเบียนเมื่อ {formatThaiDateTime(registrationCloseDate)}
                </p>
              </>
            ) : null}
            {windowError ? (
              <p className="mt-4 text-xs text-rose-500">{windowError}</p>
            ) : (
              <p className="mt-4 text-xs text-slate-400">หากมีข้อสงสัย กรุณาติดต่อหน่วยงานทะเบียนและประมวลผล </p>
            )}
          </div>
        ) : (
          <>
            {windowError ? (
              <div className="mx-auto w-full max-w-2xl rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-center text-sm text-amber-700 shadow-sm">
                ไม่สามารถโหลดช่วงเวลาจากฐานข้อมูลได้ ระบบแสดงค่าตั้งต้น ({formatThaiDateTime(registrationOpenDate)} ถึง{' '}
                {formatThaiDateTime(registrationCloseDate)})
              </div>
            ) : null}

            {view === 'login' && publicRegistrationTotal !== null ? (
              <div className="mx-auto w-full max-w-lg rounded-2xl border border-indigo-300 bg-white p-6 text-center shadow-lg">
                <p className="text-xs uppercase tracking-wider text-indigo-500">จำนวนผู้ลงทะเบียนสะสม</p>
                <p className="mt-2 text-5xl font-bold text-indigo-600">{publicRegistrationTotal.toLocaleString('th-TH')}</p>
                {publicRegistrationUpdatedAt ? (
                  <p className="mt-2 text-[11px] text-slate-500">
                    อัปเดตล่าสุด {formatThaiDateTime(publicRegistrationUpdatedAt)}
                  </p>
                ) : null}
              </div>
            ) : null}

            {view === 'login' ? (
              <div className="space-y-4">
                {registrationWindow && !isBeforeOpen && !isAfterClose ? (
                  <div className="mx-auto w-full max-w-lg rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-center text-sm text-indigo-700 shadow-sm">
                    <p className="font-semibold">ระบบจะปิดรับลงทะเบียนในอีก {formatCountdownText(closeCountdown)}</p>
                    {registrationCloseDate ? (
                      <p className="mt-1 text-xs text-indigo-600">
                        ปิดรับลงทะเบียนวันที่ {formatThaiDateTime(registrationCloseDate)}
                      </p>
                    ) : null}
                    <p className="mt-2 text-xs text-indigo-600">
                      หรือมีคนสมัครเต็มแล้ว (300 คน สำรอง 10 คน)
                    </p>
                  </div>
                ) : null}
                <LoginForm onSubmit={handleLogin} loading={isLoggingIn} error={loginError} message={toastMessage} />
              </div>
            ) : null}

            {isAdmin && view === 'admin' ? (
              <div className="space-y-6">
                {adminTab === 'profile' ? (
                  <div className="space-y-6">
                    {isLoadingProfile ? (
                      <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
                        กำลังดึงข้อมูลการลงทะเบียน...
                      </div>
                    ) : null}
                    {profileError ? (
                      <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-center text-sm text-rose-600">
                        {profileError}
                      </div>
                    ) : null}
                    {registrationResult ? (
                      <SuccessPage
                        user={user}
                        result={registrationResult}
                        onLogout={() => handleLogout('success')}
                        showBack={false}
                        showLogout={false}
                      />
                    ) : !isLoadingProfile && !profileError ? (
                      <RegistrationForm
                        user={user}
                        onSubmit={handleRegistrationSubmit}
                        onLogout={() => handleLogout('success')}
                        loading={isSubmitting}
                        error={registrationError}
                      />
                    ) : null}
                  </div>
                ) : null}

                {adminTab === 'dashboard' ? (
                  <AdminDashboard
                    summary={dashboardSummary}
                    registrations={dashboardRegistrations}
                    loading={isLoadingDashboard}
                    error={dashboardError}
                    onRefresh={() => loadDashboardSummary(true, user, registrationResult?.user_role || user?.USER_ROLE)}
                    lastUpdated={dashboardUpdatedAt}
                    registrationWindow={registrationWindow}
                  />
                ) : null}
              </div>
            ) : null}

            {!isAdmin && view === 'register' && user ? (
              <RegistrationForm
                user={user}
                onSubmit={handleRegistrationSubmit}
                onLogout={() => handleLogout('success')}
                loading={isSubmitting}
                error={registrationError}
              />
            ) : null}

            {!isAdmin && view === 'success' && user ? (
              <SuccessPage
                user={user}
                result={registrationResult}
                onLogout={() => handleLogout('success')}
                showBack={false}
              />
            ) : null}
          </>
        )}
      </main>

      <footer className="border-t border-slate-200 bg-white/60">
        <div className="mx-auto flex w-full max-w-5xl flex-col items-center justify-between gap-2 px-4 py-4 text-center text-xs text-slate-400 sm:flex-row">
          <p>© {new Date().getFullYear()} Phetchabun Rajabhat University · งานทะเบียนและประมวลผล (โดย นายขวัญชัย แก่นไทย) ext. 6012</p>
          <p>รองรับการใช้งานบนอุปกรณ์พกพาและเดสก์ท็อป</p>
        </div>
      </footer>
    </div>
  )
}

export default App

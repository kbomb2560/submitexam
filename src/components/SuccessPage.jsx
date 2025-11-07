import { CheckCircle2, LogOut, RotateCcw } from 'lucide-react'
import UserProfile from './UserProfile.jsx'
import { formatQueueNumber, formatThaiDateTime } from '../utils/helpers.js'

export default function SuccessPage({
  user,
  result,
  onLogout,
  onBack,
  showLogout = true,
  showBack = true,
  backLabel = 'กลับหน้าแดชบอร์ด',
}) {
  const queueNumber = formatQueueNumber(result?.queue_number)
  const submittedAt = formatThaiDateTime(result?.registration_datetime)
  const sequenceNumber = result?.sequence_number ?? '-'

  const translateUserType = (value) => {
    if (!value) return 'ไม่ระบุ'
    const normalized = value.toString().toLowerCase()
    if (normalized === 'employee') return 'บุคลากรสายสนับสนุน'
    if (normalized === 'teacher') return 'อาจารย์'
    return value
  }

  const translateUserRole = (value) => {
    if (!value) return 'ผู้ใช้งานทั่วไป'
    const normalized = value.toString().toLowerCase()
    return normalized.includes('admin') ? 'ผู้ดูแลระบบ' : 'ผู้ใช้งานทั่วไป'
  }

  const showBackButton = showBack && typeof onBack === 'function'
  const showLogoutButton = showLogout && typeof onLogout === 'function'

  return (
    <div className="space-y-6 font-sarabun">
      <section className="rounded-2xl border border-emerald-200 bg-gradient-to-tr from-emerald-50 via-white to-slate-50 p-6 text-center shadow-sm">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500 text-white shadow-lg">
          <CheckCircle2 className="h-9 w-9" />
        </div>
        <h2 className="mt-4 text-2xl font-semibold text-slate-900">ลงทะเบียนสำเร็จ</h2>
        <p className="mt-2 text-sm text-slate-600">บันทึกข้อมูลเรียบร้อยแล้ว ขอบคุณสำหรับความร่วมมือของท่าน</p>

        <div className="mt-6 inline-flex flex-col items-center rounded-2xl bg-white px-6 py-4 shadow-inner">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">หมายเลขคิวของท่าน</span>
          <span className="mt-2 text-4xl font-bold text-emerald-600">{queueNumber}</span>
        </div>

        <p className="mt-4 text-xs text-slate-500">บันทึกเมื่อ {submittedAt}</p>

        {showBackButton || showLogoutButton ? (
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            {showBackButton ? (
              <button
                type="button"
                onClick={onBack}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 transition hover:border-slate-300 hover:text-slate-800"
              >
                <RotateCcw className="h-4 w-4" />
                {backLabel}
              </button>
            ) : null}
            {showLogoutButton ? (
              <button
                type="button"
                onClick={onLogout}
                className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-md transition hover:bg-slate-800"
              >
                <LogOut className="h-4 w-4" />
                ออกจากระบบ
              </button>
            ) : null}
          </div>
        ) : null}
      </section>

      <UserProfile user={user} />

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="text-lg font-semibold text-slate-900">ข้อมูลการลงทะเบียน</h3>
        <dl className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-4">
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">หมายเลขคิว</dt>
            <dd className="mt-1 text-sm font-semibold text-slate-900">{queueNumber}</dd>
          </div>
          <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-4">
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">รหัสการลงทะเบียน</dt>
            <dd className="mt-1 text-sm font-semibold text-slate-900">{result?.registration_id ?? '-'}</dd>
          </div>
          <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-4">
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">เลขลำดับ</dt>
            <dd className="mt-1 text-sm font-semibold text-slate-900">{sequenceNumber}</dd>
          </div>
          <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-4">
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">เวลาที่บันทึก (ISO)</dt>
            <dd className="mt-1 break-all text-xs font-semibold text-slate-900">{result?.registration_datetime}</dd>
          </div>
          <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-4">
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">เวลาที่บันทึก (Unix ms)</dt>
            <dd className="mt-1 text-sm font-semibold text-slate-900">{result?.registration_timestamp ?? '-'}</dd>
          </div>
          <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-4">
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">หมายเลขโทรศัพท์</dt>
            <dd className="mt-1 text-sm font-semibold text-slate-900">{result?.phone_number || '-'}</dd>
          </div>
          <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-4">
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">ประเภทบุคลากร (API)</dt>
            <dd className="mt-1 text-sm font-semibold text-slate-900">{translateUserType(result?.user_type)}</dd>
          </div>
          <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-4">
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">บทบาทในระบบ</dt>
            <dd className="mt-1 text-sm font-semibold text-slate-900">{translateUserRole(result?.user_role)}</dd>
          </div>
          <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-4">
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">หน่วยงาน</dt>
            <dd className="mt-1 text-sm font-semibold text-slate-900">{result?.department_name || '-'}</dd>
          </div>
          <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-4">
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">ระดับการศึกษา</dt>
            <dd className="mt-1 text-sm font-semibold text-slate-900">{result?.level_name || '-'}</dd>
          </div>
          <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-4">
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">รหัสระดับการศึกษา</dt>
            <dd className="mt-1 text-sm font-semibold text-slate-900">{result?.level_code || '-'}</dd>
          </div>
          <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-4">
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">เพศ (จากคำนำหน้า)</dt>
            <dd className="mt-1 text-sm font-semibold text-slate-900">{result?.gender || '-'}</dd>
          </div>
        </dl>
      </section>
    </div>
  )
}



import { useEffect, useState } from 'react'
import { ShieldCheck } from 'lucide-react'
import UserProfile from './UserProfile.jsx'

export default function RegistrationForm({ user, onSubmit, onLogout, loading, error }) {
  const [confirmedData, setConfirmedData] = useState(false)
  const [confirmedExam, setConfirmedExam] = useState(false)
  const [phone, setPhone] = useState(user?.PHONE ?? '')
  const [phoneError, setPhoneError] = useState('')

  useEffect(() => {
    setConfirmedData(false)
    setConfirmedExam(false)
    setPhone(user?.PHONE ?? '')
    setPhoneError('')
  }, [user?.EMP_CODE, user?.PHONE])

  const handleSubmit = (event) => {
    event.preventDefault()
    const trimmedPhone = phone.trim()
    if (!confirmedData || !confirmedExam) return

    if (!trimmedPhone) {
      setPhoneError('กรุณากรอกหมายเลขโทรศัพท์ที่สามารถติดต่อได้')
      return
    }

    const phoneDigits = trimmedPhone.replace(/[^0-9]/g, '')
    if (phoneDigits.length < 9) {
      setPhoneError('กรุณากรอกหมายเลขโทรศัพท์ให้ถูกต้อง (อย่างน้อย 9 หลัก)')
      return
    }

    setPhoneError('')
    onSubmit?.({ confirmedData, confirmedExam, phone: trimmedPhone })
  }

  const isDisabled = !confirmedData || !confirmedExam || !phone.trim() || loading

  return (
    <form onSubmit={handleSubmit} className="space-y-6 font-sarabun">
      <div className="flex flex-col gap-3 rounded-2xl border border-indigo-100 bg-gradient-to-tr from-indigo-50 via-slate-50 to-white p-6 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-indigo-600">ลงทะเบียนกรรมการคุมสอบ</p>
          <h2 className="mt-1 text-xl font-semibold text-slate-900">วันที่ 7 ธันวาคม 2568</h2>
          <p className="mt-1 text-sm text-slate-500">กรุณาตรวจสอบและยืนยันข้อมูลของท่านให้ครบถ้วน</p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onLogout}
            className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 transition hover:border-slate-300 hover:text-slate-800"
          >
            ออกจากระบบ
          </button>
        </div>
      </div>

      <UserProfile user={user} />

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="text-lg font-semibold text-slate-900">ข้อมูลการติดต่อเพิ่มเติม</h3>
        <p className="mt-1 text-sm text-slate-500">กรุณาระบุหมายเลขโทรศัพท์ที่สามารถติดต่อได้ในวันสอบ</p>

        <div className="mt-4 space-y-2">
          <label htmlFor="phone" className="block text-sm font-medium text-slate-700">
            หมายเลขโทรศัพท์
          </label>
          <input
            id="phone"
            type="tel"
            inputMode="tel"
            value={phone}
            onChange={(event) => {
              setPhone(event.target.value)
              setPhoneError('')
            }}
            disabled={loading}
            placeholder="กรอกหมายเลขโทรศัพท์ เช่น 08xxxxxxx"
            maxLength={20}
            className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm shadow-sm transition focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200 disabled:cursor-not-allowed disabled:bg-slate-100"
          />
          <p className="text-xs text-slate-400">ข้อมูลนี้จะใช้สำหรับการติดต่อกรณีฉุกเฉินหรือแจ้งเตือนการปฏิบัติหน้าที่</p>
          {phoneError ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-xs text-rose-600">
              {phoneError}
            </div>
          ) : null}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="text-lg font-semibold text-slate-900">การยืนยัน</h3>
        <p className="mt-1 text-sm text-slate-500">ต้องเลือกยืนยันทั้งสองรายการก่อนจึงจะสามารถลงทะเบียนได้</p>

        <div className="mt-4 space-y-3">
          <label className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50/70 p-4 text-sm text-slate-700 transition hover:border-indigo-200">
            <input
              type="checkbox"
              className="mt-1 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
              checked={confirmedData}
              onChange={(event) => setConfirmedData(event.target.checked)}
              disabled={loading}
            />
            <span>ยืนยันว่าข้อมูลของข้าพเจ้าถูกต้องครบถ้วน</span>
          </label>

          <label className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50/70 p-4 text-sm text-slate-700 transition hover:border-indigo-200">
            <input
              type="checkbox"
              className="mt-1 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
              checked={confirmedExam}
              onChange={(event) => setConfirmedExam(event.target.checked)}
              disabled={loading}
            />
            <span>ยินดีปฏิบัติหน้าที่กรรมการคุมสอบในวันที่ 7 ธันวาคม 2568</span>
          </label>
        </div>

        {!confirmedData || !confirmedExam ? (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
            กรุณาเลือกยืนยันข้อมูลทั้ง 2 รายการ
          </div>
        ) : null}

        {error ? (
          <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-600">
            {error}
          </div>
        ) : null}

        <button
          type="submit"
          disabled={isDisabled}
          className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white shadow-md transition hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-200 disabled:cursor-not-allowed disabled:bg-emerald-300"
        >
          <ShieldCheck className="h-4 w-4" />
          {loading ? 'กำลังบันทึกข้อมูล...' : 'ลงทะเบียนกรรมการคุมสอบ'}
        </button>
      </section>
    </form>
  )
}



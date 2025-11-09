import { useEffect, useMemo, useState } from 'react'
import { BarChart3, Clock, FileDown, RefreshCcw, Search, Users } from 'lucide-react'
import { saveAs } from 'file-saver'
import * as XLSX from 'xlsx'
import { calculateCountdown, composeFullName, formatThaiDateTime } from '../utils/helpers.js'

const cardClassName =
  'rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-indigo-200 hover:shadow-md'

function StatList({ title, items }) {
  if (!items?.length) return null

  return (
    <section className="space-y-3">
      <header className="flex items-center gap-2 text-sm font-semibold text-slate-600">
        <BarChart3 className="h-4 w-4 text-indigo-500" />
        {title}
      </header>
      <ul className="space-y-2 text-sm text-slate-600">
        {items.map((item) => (
          <li key={item.label} className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-2">
            <span>{item.label}</span>
            <span className="font-semibold text-slate-900">{item.count.toLocaleString('th-TH')}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}

export default function AdminDashboard({
  summary,
  registrations = [],
  loading,
  error,
  onRefresh,
  lastUpdated,
  registrationWindow,
}) {
  const total = summary?.total ?? 0

  const topDepartment = useMemo(() => summary?.byDepartment?.[0], [summary])
  const topLevel = useMemo(() => summary?.byLevel?.[0], [summary])
  const topGender = useMemo(() => summary?.byGender?.[0], [summary])
  const topRole = useMemo(() => summary?.byUserRole?.[0], [summary])

  const registrationDeadline = registrationWindow?.closesAt ?? null
  const [countdown, setCountdown] = useState(() =>
    registrationDeadline ? calculateCountdown(registrationDeadline) : null
  )
  const countdownLabel = useMemo(() => {
    if (!countdown) {
      return registrationDeadline ? 'หมดเขตรับลงทะเบียนแล้ว' : 'ไม่พบข้อมูลกำหนดปิดรับลงทะเบียน'
    }
    if (countdown.totalMs <= 0) {
      return 'หมดเขตรับลงทะเบียนแล้ว'
    }

    const secondsText = `${(countdown.seconds ?? 0).toString().padStart(2, '0')} วินาที`
    return `${countdown.days.toLocaleString('th-TH')} วัน ${countdown.hours
      .toString()
      .padStart(2, '0')} ชม. ${countdown.minutes.toString().padStart(2, '0')} นาที ${secondsText}`
  }, [countdown, registrationDeadline])

  const [searchTerm, setSearchTerm] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const pageSize = 20

  const enrichedRegistrations = useMemo(() => {
    return (registrations || []).map((item, index) => {
      const fullName = item.full_name
        ? item.full_name
        : composeFullName(item.prefix_name, item.first_name, item.last_name, '')
      return {
        ...item,
        queue_number: item.queue_number ?? index + 1,
        full_name: fullName,
      }
    })
  }, [registrations])

  const filteredRegistrations = useMemo(() => {
    const term = searchTerm.trim().toLowerCase()
    if (!term) return enrichedRegistrations
    return enrichedRegistrations.filter((item) => {
      const values = [
        item.emp_code,
        item.full_name,
        item.level_name,
        item.department_name,
        item.phone_number,
        item.sequence_number,
      ]
      return values.some((value) => {
        if (value === null || value === undefined) return false
        return value.toString().toLowerCase().includes(term)
      })
    })
  }, [enrichedRegistrations, searchTerm])

  useEffect(() => {
    setCurrentPage(1)
  }, [searchTerm, enrichedRegistrations])

  useEffect(() => {
    if (!registrationDeadline) {
      setCountdown(null)
      return undefined
    }
    setCountdown(calculateCountdown(registrationDeadline))
    const timer = setInterval(() => {
      setCountdown(calculateCountdown(registrationDeadline))
    }, 1000)
    return () => clearInterval(timer)
  }, [registrationDeadline])

  const totalPages = Math.max(1, Math.ceil(filteredRegistrations.length / pageSize))
  const startIndex = (currentPage - 1) * pageSize
  const pagedRegistrations = filteredRegistrations.slice(startIndex, startIndex + pageSize)

  const timelineData = useMemo(() => {
    const start = new Date(Date.UTC(2025, 10, 7))
    const end = new Date(Date.UTC(2025, 10, 12))

    const formatter = new Intl.DateTimeFormat('th-TH', {
      day: 'numeric',
      month: 'short',
    })

    const map = new Map()
    enrichedRegistrations.forEach((item) => {
      const source = item.registration_datetime || item.registrationDatetime || item.created_at
      if (!source) return
      const date = new Date(source)
      if (Number.isNaN(date.getTime())) return
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
      map.set(key, (map.get(key) || 0) + 1)
    })

    const data = []
    const cursor = new Date(start)
    while (cursor <= end) {
      const key = `${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, '0')}-${String(cursor.getUTCDate()).padStart(2, '0')}`
      data.push({
        key,
        label: formatter.format(new Date(cursor.getUTCFullYear(), cursor.getUTCMonth(), cursor.getUTCDate())),
        count: map.get(key) || 0,
      })
      cursor.setUTCDate(cursor.getUTCDate() + 1)
    }

    return data
  }, [enrichedRegistrations])

  const timelineMax = useMemo(() => {
    const values = timelineData.map((item) => item.count)
    return Math.max(1, ...(values.length ? values : [0]))
  }, [timelineData])

  const userTypeChart = useMemo(() => {
    const counts = {
      teacher: 0,
      employee: 0,
    }

    enrichedRegistrations.forEach((item) => {
      const type = (item.user_type || '').toString().toLowerCase()
      if (type.includes('teach')) {
        counts.teacher += 1
      } else {
        counts.employee += 1
      }
    })

    const data = [
      { label: 'อาจารย์', value: counts.teacher, color: 'bg-emerald-500' },
      { label: 'บุคลากรสายสนับสนุน', value: counts.employee, color: 'bg-indigo-500' },
    ]
    const totalValue = data.reduce((sum, item) => sum + item.value, 0)

    return { data, total: totalValue }
  }, [enrichedRegistrations])

  const genderChart = useMemo(() => {
    const counts = {
      female: 0,
      male: 0,
    }

    enrichedRegistrations.forEach((item) => {
      const genderValue = (item.gender || '').toString().toLowerCase()
      if (genderValue.includes('หญิง') || genderValue.includes('female')) {
        counts.female += 1
      } else if (genderValue.includes('ชาย') || genderValue.includes('male')) {
        counts.male += 1
      }
    })

    const data = [
      { label: 'หญิง', value: counts.female, color: 'bg-rose-500' },
      { label: 'ชาย', value: counts.male, color: 'bg-sky-500' },
    ]
    const totalValue = data.reduce((sum, item) => sum + item.value, 0)

    return { data, total: totalValue }
  }, [enrichedRegistrations])

  const handleExport = () => {
    if (!filteredRegistrations.length) return

    const exportRows = filteredRegistrations.map((item, index) => ({
      ลำดับ: index + 1,
      รหัสพนักงาน: item.emp_code || '',
      คิว: item.queue_number ?? index + 1,
      ชื่อเต็ม: item.full_name || '',
      ระดับการศึกษา: item.level_name || '',
      สังกัด: item.department_name || '',
      'หมายเลขโทรศัพท์': item.phone_number || '',
    }))

    const worksheet = XLSX.utils.json_to_sheet(exportRows)
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, 'registrations')
    const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' })
    const blob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const timestamp = new Date().toISOString().slice(0, 10)
    saveAs(blob, `exam-proctor-registrations-${timestamp}.xlsx`)
  }
  return (
    <div className="space-y-6 font-sarabun">
      <header className="flex flex-col gap-4 rounded-2xl border border-indigo-100 bg-gradient-to-tr from-indigo-50 via-slate-50 to-white p-6 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-indigo-600">แดชบอร์ดภาพรวม</p>
          <h2 className="text-2xl font-semibold text-slate-900">สถิติจำนวนผู้ลงทะเบียน</h2>
          <p className="mt-1 text-sm text-slate-500">ตรวจสอบสถิติการลงทะเบียนแยกตามประเภทบุคลากร หน่วยงาน ระดับการศึกษา และเพศ</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onRefresh}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 transition hover:border-slate-300 hover:text-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshCcw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> รีเฟรชข้อมูล
          </button>
        </div>
      </header>

      <section className="grid gap-4 sm:grid-cols-3">
        <div className={`${cardClassName} sm:col-span-3 lg:col-span-1`}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500">จำนวนผู้ลงทะเบียนทั้งหมด</p>
              <p className="mt-2 text-3xl font-semibold text-slate-900">{total.toLocaleString('th-TH')}</p>
            </div>
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-500 text-white">
              <Users className="h-6 w-6" />
            </div>
          </div>
          {lastUpdated ? (
            <p className="mt-4 text-xs text-slate-500">อัปเดตล่าสุด {formatThaiDateTime(lastUpdated)}</p>
          ) : null}
          <div className="mt-4 rounded-xl bg-indigo-50/80 px-4 py-3 text-left text-xs text-indigo-700">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-indigo-500" />
              <span>เหลือเวลา {countdownLabel}</span>
            </div>
            <p className="mt-1 text-[11px] text-indigo-600/80">ปิดรับลงทะเบียน: {formatThaiDateTime(registrationDeadline)}</p>
            <p className="mt-1 text-[11px] text-indigo-600/80">หรือมีคนสมัครเต็มแล้ว (300 คน สำรอง 10 คน)</p>
          </div>
        </div>

        <div className={`${cardClassName} sm:col-span-3 lg:col-span-2`}>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
              <p className="text-xs uppercase tracking-wide text-slate-400">หน่วยงานยอดนิยม</p>
              <p className="mt-2 text-base font-semibold text-slate-900">{topDepartment?.label ?? '—'}</p>
              <p className="text-xs text-slate-500">{topDepartment ? `${topDepartment.count.toLocaleString('th-TH')} คน` : 'ยังไม่มีข้อมูล'}</p>
            </div>
            <div className="rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
              <p className="text-xs uppercase tracking-wide text-slate-400">ระดับการศึกษายอดนิยม</p>
              <p className="mt-2 text-base font-semibold text-slate-900">{topLevel?.label ?? '—'}</p>
              <p className="text-xs text-slate-500">{topLevel ? `${topLevel.count.toLocaleString('th-TH')} คน` : 'ยังไม่มีข้อมูล'}</p>
            </div>
            <div className="rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
              <p className="text-xs uppercase tracking-wide text-slate-400">สัดส่วนเพศ</p>
              <p className="mt-2 text-base font-semibold text-slate-900">{topGender?.label ?? '—'}</p>
              <p className="text-xs text-slate-500">{topGender ? `${topGender.count.toLocaleString('th-TH')} คน` : 'ยังไม่มีข้อมูล'}</p>
            </div>
            <div className="rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
              <p className="text-xs uppercase tracking-wide text-slate-400">บทบาทผู้ใช้งาน</p>
              <p className="mt-2 text-base font-semibold text-slate-900">{topRole?.label ?? '—'}</p>
              <p className="text-xs text-slate-500">{topRole ? `${topRole.count.toLocaleString('th-TH')} คน` : 'ยังไม่มีข้อมูล'}</p>
            </div>
          </div>
        </div>
      </section>

      {error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-600">
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
          กำลังโหลดข้อมูลสถิติ...
        </div>
      ) : null}

      {!loading && !error ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-lg font-semibold text-slate-900">รายชื่อผู้ลงทะเบียน</h3>
              <p className="text-sm text-slate-500">เรียงตามเวลาลงทะเบียน • ทั้งหมด {filteredRegistrations.length.toLocaleString('th-TH')} คน</p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="relative w-full sm:w-60">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="ค้นหา: รหัส, ชื่อ, สังกัด, ระดับ"
                  className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-700 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
                />
              </div>
              <button
                type="button"
                onClick={handleExport}
                disabled={!filteredRegistrations.length}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-emerald-300"
              >
                <FileDown className="h-4 w-4" />
                ส่งออก Excel
              </button>
            </div>
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-2 text-left">ลำดับ</th>
                  <th className="px-4 py-2 text-left">รหัสพนักงาน</th>
                  <th className="px-4 py-2 text-left">ลำดับการลงทะเบียน</th>
                  <th className="px-4 py-2 text-left">ชื่อเต็ม</th>
                  <th className="px-4 py-2 text-left">ระดับการศึกษา</th>
                  <th className="px-4 py-2 text-left">สังกัด</th>
                  <th className="px-4 py-2 text-left">หมายเลขโทรศัพท์</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pagedRegistrations.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-sm text-slate-500">
                      ไม่พบข้อมูลผู้ลงทะเบียนในเงื่อนไขที่เลือก
                    </td>
                  </tr>
                ) : (
                  pagedRegistrations.map((item, index) => {
                    const globalIndex = startIndex + index
                    const queueNumber = item.queue_number ?? globalIndex + 1
                    const orderNumber = globalIndex + 1
                    return (
                      <tr key={`${item.emp_code}-${queueNumber}`} className="hover:bg-slate-50/60">
                        <td className="px-4 py-2 font-semibold text-slate-700">{orderNumber.toLocaleString('th-TH')}</td>
                        <td className="px-4 py-2 text-slate-600">{item.emp_code || '-'}</td>
                        <td className="px-4 py-2 text-slate-600">{queueNumber.toLocaleString('th-TH')}</td>
                        <td className="px-4 py-2 text-slate-700">{item.full_name || '-'}</td>
                        <td className="px-4 py-2 text-slate-600">{item.level_name || '-'}</td>
                        <td className="px-4 py-2 text-slate-600">{item.department_name || '-'}</td>
                        <td className="px-4 py-2 text-slate-600">{item.phone_number || '-'}</td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex flex-col items-center justify-between gap-3 text-xs text-slate-500 sm:flex-row sm:text-sm">
            <div>
              แสดง {filteredRegistrations.length ? `${(startIndex + 1).toLocaleString('th-TH')} - ${Math.min(startIndex + pageSize, filteredRegistrations.length).toLocaleString('th-TH')}` : '0'} จาก {filteredRegistrations.length.toLocaleString('th-TH')} รายการ
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                disabled={currentPage === 1}
                className="rounded-lg border border-slate-200 px-3 py-1 font-medium text-slate-600 transition hover:border-indigo-200 hover:text-indigo-600 disabled:cursor-not-allowed disabled:border-slate-100 disabled:text-slate-300"
              >
                ก่อนหน้า
              </button>
              <span className="font-semibold text-slate-700">
                หน้า {currentPage.toLocaleString('th-TH')} / {totalPages.toLocaleString('th-TH')}
              </span>
              <button
                type="button"
                onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
                disabled={currentPage === totalPages}
                className="rounded-lg border border-slate-200 px-3 py-1 font-medium text-slate-600 transition hover:border-indigo-200 hover:text-indigo-600 disabled:cursor-not-allowed disabled:border-slate-100 disabled:text-slate-300"
              >
                ถัดไป
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {!loading && !error ? (
        <div className="grid gap-6 lg:grid-cols-4">
          <div className={cardClassName}>
            <StatList title="ประเภทบุคลากร" items={summary?.byUserType} />
          </div>
          <div className={cardClassName}>
            <StatList title="หน่วยงาน / คณะ" items={summary?.byDepartment} />
          </div>
          <div className={cardClassName}>
            <StatList title="ระดับการศึกษา" items={summary?.byLevel} />
          </div>
          <div className={cardClassName}>
            <StatList title="บทบาทผู้ใช้งาน" items={summary?.byUserRole} />
          </div>
        </div>
      ) : null}

      {!loading && !error ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <div className={cardClassName}>
            <h3 className="text-lg font-semibold text-slate-900">จำนวนผู้ลงทะเบียนรายวัน</h3>
            <p className="mt-1 text-sm text-slate-500">ช่วงวันที่ 7 - 12 พฤศจิกายน 2568</p>
            <div className="mt-4 space-y-3">
              {timelineData.map((item) => (
                <div key={item.key} className="flex items-center gap-3">
                  <div className="w-16 text-xs font-semibold text-slate-600">{item.label}</div>
                  <div className="flex-1 rounded-full bg-slate-100">
                    <div
                      className="h-3 rounded-full bg-indigo-500 transition-all"
                      style={{ width: `${timelineMax ? Math.max(6, (item.count / timelineMax) * 100) : 0}%` }}
                    ></div>
                  </div>
                  <div className="w-10 text-right text-xs font-semibold text-slate-700">{item.count.toLocaleString('th-TH')}</div>
                </div>
              ))}
            </div>
          </div>

          <div className={`${cardClassName} space-y-6`}>
            <div>
              <h3 className="text-lg font-semibold text-slate-900">สัดส่วนประเภทบุคลากร</h3>
              <p className="mt-1 text-sm text-slate-500">จำนวนรวม {userTypeChart.total.toLocaleString('th-TH')} คน</p>
              <div className="mt-3 space-y-3">
                {userTypeChart.data.map((item) => (
                  <div key={item.label}>
                    <div className="flex items-center justify-between text-xs text-slate-600">
                      <span>{item.label}</span>
                      <span className="font-semibold text-slate-700">{item.value.toLocaleString('th-TH')} คน</span>
                    </div>
                    <div className="mt-1 h-2 rounded-full bg-slate-100">
                      <div
                        className={`${item.color} h-2 rounded-full`}
                        style={{ width: `${userTypeChart.total ? (item.value / userTypeChart.total) * 100 : 0}%` }}
                      ></div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <h3 className="text-lg font-semibold text-slate-900">สัดส่วนเพศ</h3>
              <p className="mt-1 text-sm text-slate-500">จำนวนรวม {genderChart.total.toLocaleString('th-TH')} คน</p>
              <div className="mt-3 space-y-3">
                {genderChart.data.map((item) => (
                  <div key={item.label}>
                    <div className="flex items-center justify-between text-xs text-slate-600">
                      <span>{item.label}</span>
                      <span className="font-semibold text-slate-700">{item.value.toLocaleString('th-TH')} คน</span>
                    </div>
                    <div className="mt-1 h-2 rounded-full bg-slate-100">
                      <div
                        className={`${item.color} h-2 rounded-full`}
                        style={{ width: `${genderChart.total ? (item.value / genderChart.total) * 100 : 0}%` }}
                      ></div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : null}

    </div>
  )
}



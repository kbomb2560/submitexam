const fieldMapping = [
  { label: 'รหัสพนักงาน', key: 'EMP_CODE' },
  { label: 'ชื่อ-นามสกุล', key: 'FULL_NAME' },
  { label: 'ชื่อภาษาอังกฤษ', key: 'FULL_NAME_ENG' },
  { label: 'ตำแหน่ง', key: 'POSITION_NAME' },
  { label: 'วุฒิการศึกษา', key: 'LEVEL_NAME' },
  { label: 'รหัสระดับการศึกษา', key: 'LEVEL_CODE' },
  { label: 'หน่วยงาน', key: 'SECTION_NAME' },
  { label: 'สังกัด', key: 'DEPARTMENT_NAME' },
  { label: 'หมายเลขโทรศัพท์', key: 'PHONE' },
  { label: 'ประเภทบุคลากร (API)', key: 'USER_TYPE' },
  { label: 'บทบาทในระบบ', key: 'USER_ROLE' },
  { label: 'เพศ (จากคำนำหน้า)', key: 'GENDER' },
]

export default function UserProfile({ user }) {
  if (!user) return null

  const formatValue = (key, value) => {
    if (!value) return '-'

    if (key === 'USER_TYPE') {
      const normalized = value.toString().toLowerCase()
      if (normalized === 'employee') return 'บุคลากรสายสนับสนุน'
      if (normalized === 'teacher') return 'อาจารย์'
      return value
    }

    if (key === 'USER_ROLE') {
      const normalized = value.toString().toLowerCase()
      return normalized.includes('admin') ? 'ผู้ดูแลระบบ' : 'ผู้ใช้งานทั่วไป'
    }

    return value
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm font-sarabun">
      <header className="mb-4 flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-indigo-500 text-lg font-semibold text-white">
          {String(user?.PREFIX_NAME ?? 'P').slice(0, 1)}
        </span>
        <div>
          <p className="text-sm font-semibold text-indigo-600">ข้อมูลผู้ใช้งาน</p>
          <h2 className="text-xl font-semibold text-slate-900">{user.FULL_NAME}</h2>
          <p className="text-sm text-slate-500">{user.POSITION_NAME}</p>
        </div>
      </header>

      <dl className="grid gap-4 sm:grid-cols-2">
        {fieldMapping.map((field) => (
          <div key={field.key} className="rounded-xl border border-slate-100 bg-slate-50/70 p-4">
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{field.label}</dt>
            <dd className="mt-1 text-sm font-semibold text-slate-900">
              {formatValue(field.key, user?.[field.key])}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  )
}



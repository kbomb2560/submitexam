import { useState } from 'react'
import { LogIn } from 'lucide-react'

export default function LoginForm({ onSubmit, loading, error, message }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [localError, setLocalError] = useState('')

  const handleSubmit = (event) => {
    event.preventDefault()

    if (!username.trim() || !password.trim()) {
      setLocalError('กรุณากรอกข้อมูลให้ครบถ้วน')
      return
    }

    setLocalError('')
    onSubmit?.({ username: username.trim(), password })
  }

  const renderError = localError || error

  return (
    <div className="mx-auto w-full max-w-md font-sarabun">
      <div className="mb-6 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-500 text-2xl font-bold text-white shadow-lg">
          PCRU
        </div>
        <h1 className="mt-4 text-2xl font-semibold text-slate-900">ระบบลงทะเบียนกรรมการคุมสอบ</h1>
        <p className="mt-2 text-sm text-slate-500">กรุณาเข้าสู่ระบบด้วยรหัสพนักงานของท่าน</p>
        {message ? <p className="mt-3 text-sm font-medium text-amber-600">{message}</p> : null}
      </div>

      <form onSubmit={handleSubmit} className="space-y-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-lg">
        <div>
          <label htmlFor="username" className="mb-2 block text-sm font-medium text-slate-700">
            รหัสพนักงาน
          </label>
          <input
            id="username"
            type="text"
            autoComplete="username"
            placeholder="เช่น 653xxx"
            value={username}
            onChange={(event) => {
              setUsername(event.target.value)
              setLocalError('')
            }}
            disabled={loading}
            className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm shadow-sm transition focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200 disabled:cursor-not-allowed disabled:bg-slate-100"
          />
        </div>

        <div>
          <label htmlFor="password" className="mb-2 block text-sm font-medium text-slate-700">
            รหัสผ่าน
          </label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            placeholder="กรอกรหัสผ่านของท่าน"
            value={password}
            onChange={(event) => {
              setPassword(event.target.value)
              setLocalError('')
            }}
            disabled={loading}
            className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm shadow-sm transition focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200 disabled:cursor-not-allowed disabled:bg-slate-100"
          />
        </div>

        {renderError ? (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-600">
            {renderError}
          </div>
        ) : null}

        <button
          type="submit"
          disabled={loading}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white shadow-md transition hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-200 disabled:cursor-not-allowed disabled:bg-indigo-300"
        >
          <LogIn className="h-4 w-4" />
          {loading ? 'กำลังเข้าสู่ระบบ...' : 'เข้าสู่ระบบ'}
        </button>
      </form>
    </div>
  )
}



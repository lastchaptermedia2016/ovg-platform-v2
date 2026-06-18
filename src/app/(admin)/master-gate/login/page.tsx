'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { adminLoginAction } from './actions'

export default function AdminLoginPage() {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(formData: FormData) {
    setError(null)
    startTransition(async () => {
      const result = await adminLoginAction(formData)
      if (result.success) {
        router.push('/master-gate')
      } else {
        setError(result.error ?? 'Login failed')
      }
    })
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-white tracking-tight">Master Gate</h1>
          <p className="mt-2 text-sm text-gray-400">Platform owner authentication required</p>
        </div>

        <form action={handleSubmit} className="bg-gray-900 border border-gray-800 rounded-xl p-6 md:p-8 shadow-2xl">
          <div className="space-y-5">
            <div className="space-y-2">
              <label htmlFor="email" className="block text-sm font-medium text-gray-300">
                Admin Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                className="w-full rounded-md bg-gray-800 border border-gray-700 px-4 py-3 text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                placeholder="owner@ovgplatform.com"
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="password" className="block text-sm font-medium text-gray-300">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                minLength={8}
                className="w-full rounded-md bg-gray-800 border border-gray-700 px-4 py-3 text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                placeholder="••••••••"
              />
            </div>
          </div>

          {error ? (
            <div className="mt-5 rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
              {error}
            </div>
          ) : null}

          <div className="mt-6">
            <button
              type="submit"
              disabled={isPending}
              className="w-full rounded-md bg-blue-600 px-8 py-3 text-sm font-semibold text-white hover:bg-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-gray-900 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isPending ? 'Authenticating...' : 'Enter Master Gate'}
            </button>
          </div>
        </form>

        <p className="mt-6 text-center text-xs text-gray-500">
          Restricted access. Super admin credentials only.
        </p>
      </div>
    </div>
  )
}
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { ShieldCheck, Lock, User, ArrowRight, Loader2, Mail, UserCircle } from 'lucide-react'

export default function AuthPage() {
  const [isLogin, setIsLogin] = useState(true) // Toggle state
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('') // Only for Sign Up
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  const handleAuth = async (e) => {
    e.preventDefault()
    setLoading(true)

    try {
      if (isLogin) {
        // --- LOGIN LOGIC ---
        
        // 1. Sign in with Supabase Auth
        const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
          email,
          password,
        })
        if (authError) throw authError

        // 2. Fetch the user's name from the 'staff' table
        const { data: staffData, error: staffError } = await supabase
          .from('staff')
          .select('*')
          .eq('id', authData.user.id) // Match the Auth ID
          .single()

        if (staffError) {
            // Fallback if staff record is missing
            throw new Error("User profile not found. Please sign up again.")
        }

        // 3. Save to localStorage (so Dashboard knows who you are)
        localStorage.setItem('staff', JSON.stringify(staffData))
        
        // 4. Go to Dashboard
        router.push('/dashboard')

      } else {
        // --- SIGN UP LOGIC ---

        // 1. Create User in Supabase Auth
        const { data: authData, error: authError } = await supabase.auth.signUp({
          email,
          password,
        })
        if (authError) throw authError

        if (authData.user) {
          // 2. Create the Public Profile in 'staff' table
          const newStaff = {
            id: authData.user.id, // Link the ID
            email: email,
            name: fullName
          }

          const { error: dbError } = await supabase
            .from('staff')
            .insert([newStaff])
          
          if (dbError) throw dbError

          // 3. Save to localStorage and Redirect
          localStorage.setItem('staff', JSON.stringify(newStaff))
          router.push('/dashboard')
        }
      }
    } catch (error) {
      console.error('Auth error:', error)
      alert(error.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-white flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl overflow-hidden border border-gray-100">
        
        {/* BRANDING HEADER */}
        <div className="bg-white p-8 pb-0 text-center">
          <div className="flex justify-center mb-4">
            <div className="bg-indigo-50 p-3 rounded-full">
              <ShieldCheck className="w-10 h-10 text-indigo-600" />
            </div>
          </div>
          <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Comply</h1>
          <p className="text-gray-500 mt-2 text-sm">CA Practice Automation Suite</p>
        </div>

        {/* AUTH FORM */}
        <div className="p-8">
          
          {/* Toggle Tabs */}
          <div className="flex bg-gray-100 p-1 rounded-xl mb-6">
            <button
              onClick={() => setIsLogin(true)}
              className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all ${
                isLogin ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Sign In
            </button>
            <button
              onClick={() => setIsLogin(false)}
              className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all ${
                !isLogin ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Create Account
            </button>
          </div>

          <form onSubmit={handleAuth} className="space-y-4">
            
            {/* Name Field (Only for Sign Up) */}
            {!isLogin && (
              <div className="animate-in fade-in slide-in-from-top-2 duration-300">
                <label className="block text-sm font-medium text-gray-700 mb-1.5 ml-1">
                  Full Name
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <UserCircle className="h-5 w-5 text-gray-400" />
                  </div>
                  <input
                    type="text"
                    required={!isLogin}
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="block w-full pl-10 pr-3 py-2.5 border border-gray-300 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                    placeholder="e.g. Chinmay"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5 ml-1">
                Email Address
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Mail className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="block w-full pl-10 pr-3 py-2.5 border border-gray-300 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                  placeholder="admin@ca-office.com"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5 ml-1">
                Password
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Lock className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="block w-full pl-10 pr-3 py-2.5 border border-gray-300 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                  placeholder="••••••••"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl shadow-lg hover:shadow-xl transition-all disabled:opacity-70 disabled:cursor-not-allowed mt-6"
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  {isLogin ? 'Signing in...' : 'Creating Account...'}
                </>
              ) : (
                <>
                  {isLogin ? 'Sign In' : 'Sign Up'}
                  <ArrowRight className="w-5 h-5" />
                </>
              )}
            </button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-xs text-gray-400">
              Secured by Comply Systems • v2.0
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
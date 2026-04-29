'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
// FIXED: Single import line containing ALL icons including ShieldCheck
import { CheckCircle2, Plus, LogOut, AlertTriangle, MessageCircleQuestion, Trash2, RefreshCw, Globe, ShieldCheck } from 'lucide-react'

export default function DashboardPage() {
  const [staff, setStaff] = useState(null)
  const [clients, setClients] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAddForm, setShowAddForm] = useState(false)
  const [newClient, setNewClient] = useState({
    name: '',
    phone: '',
    form_type: '',
    due_date: ''
  })
  const [submitting, setSubmitting] = useState(false)
  const [complianceAlert, setComplianceAlert] = useState('')
  const [marketPulse, setMarketPulse] = useState('')
  const [viewTrash, setViewTrash] = useState(false)
  const router = useRouter()

  useEffect(() => {
    // Check if user is logged in
    const staffData = localStorage.getItem('staff')
    if (!staffData) {
      router.push('/')
      return
    }

    setStaff(JSON.parse(staffData))
    loadClients(JSON.parse(staffData).id)
    loadBannerMessage()
  }, [router])

  useEffect(() => {
    if (staff) {
      loadClients(staff.id)
    }
  }, [viewTrash, staff])

  const loadBannerMessage = async () => {
    try {
      // Fetch RSS feed
      const response = await fetch('https://api.rss2json.com/v1/api.json?rss_url=https://www.taxscan.in/feed/')
      if (response.ok) {
        const data = await response.json()
        if (data.items && data.items.length > 0) {
          // Zone 2: Market Pulse - First item (unfiltered)
          setMarketPulse(data.items[0].title)

          // Zone 1: Compliance Alert - Filter for keywords
          const keywords = ['Extended', 'Deadline', 'Due Date', 'Notification', 'Circular']
          const complianceItem = data.items.find(item => {
            const title = item.title || ''
            return keywords.some(keyword => title.toLowerCase().includes(keyword.toLowerCase()))
          })

          if (complianceItem) {
            setComplianceAlert(complianceItem.title)
          } else {
            // Fallback to Supabase announcements for Compliance Alert
            try {
              const { data: annData, error: annError } = await supabase
                .from('announcements')
                .select('message')
                .order('created_at', { ascending: false })
                .limit(1)
                .single()

              if (!annError && annData && annData.message) {
                setComplianceAlert(annData.message)
              }
            } catch (error) {
              console.error('Error fetching announcement from Supabase:', error)
            }
          }
          return
        }
      }
    } catch (error) {
      console.error('Error fetching RSS feed:', error)
    }

    // If RSS feed fails entirely, try Supabase for Compliance Alert only
    try {
      const { data, error } = await supabase
        .from('announcements')
        .select('message')
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

      if (!error && data && data.message) {
        setComplianceAlert(data.message)
      }
    } catch (error) {
      console.error('Error fetching announcement from Supabase:', error)
    }
  }

  const loadClients = async (staffId) => {
    try {
      setLoading(true)
      
      // FIXED: Removed the .eq('staff_id') filter so you can see ALL clients
      let query = supabase
        .from('clients')
        .select('*')
      
      if (viewTrash) {
        // If viewing trash, only get deleted items
        query = query.eq('is_deleted', true)
      } else {
        // If viewing main, only get non-deleted items (false or null)
        query = query.or('is_deleted.is.null,is_deleted.eq.false')
      }
      
      const { data, error } = await query.order('due_date', { ascending: true })

      if (error) throw error

      setClients(data || [])

      // Set up realtime subscription
      const channel = supabase
        .channel('clients-changes')
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'clients',
            // Removed filter: `staff_id=eq.${staffId}` to allow updates for all clients
          },
          (payload) => {
            // Update the client in the local state
            setClients((prevClients) => {
              const updated = prevClients.map((client) =>
                client.id === payload.new.id ? payload.new : client
              )
              // If status changed to DONE, show alert
              if (payload.old.status !== 'DONE' && payload.new.status === 'DONE') {
                alert(`Client ${payload.new.name} status updated to DONE!`)
              }
              return updated
            })
          }
        )
        .subscribe()

      return () => {
        supabase.removeChannel(channel)
      }
    } catch (error) {
      console.error('Error loading clients:', error)
      alert('Error loading clients: ' + error.message)
    } finally {
      setLoading(false)
    }
  }

  const handleAddClient = async (e) => {
    e.preventDefault()
    setSubmitting(true)

    try {
      const { data, error } = await supabase
        .from('clients')
        .insert([
          {
            staff_id: staff.id,
            name: newClient.name,
            phone: newClient.phone,
            form_type: newClient.form_type,
            due_date: newClient.due_date,
            status: 'PENDING'
          }
        ])
        .select()

      if (error) throw error

      setClients([...clients, data[0]])
      setNewClient({ name: '', phone: '', form_type: '', due_date: '' })
      setShowAddForm(false)
      alert('Client added successfully!')
    } catch (error) {
      console.error('Error adding client:', error)
      alert('Error adding client: ' + error.message)
    } finally {
      setSubmitting(false)
    }
  }

  const handleMarkDone = async (clientId) => {
    try {
      const { error } = await supabase
        .from('clients')
        .update({ status: 'DONE' })
        .eq('id', clientId)

      if (error) throw error

      setClients(clients.map(client =>
        client.id === clientId ? { ...client, status: 'DONE' } : client
      ))
      alert('Client marked as done!')
    } catch (error) {
      console.error('Error updating client:', error)
      alert('Error updating client: ' + error.message)
    }
  }

  const handleDelete = async (clientId) => {
    try {
      const { error } = await supabase
        .from('clients')
        .update({ is_deleted: true })
        .eq('id', clientId)

      if (error) throw error

      // Refresh the list
      if (staff) {
        loadClients(staff.id)
      }
      alert('Client moved to trash!')
    } catch (error) {
      console.error('Error deleting client:', error)
      alert('Error deleting client: ' + error.message)
    }
  }

  const handleRestore = async (clientId) => {
    try {
      const { error } = await supabase
        .from('clients')
        .update({ is_deleted: false })
        .eq('id', clientId)

      if (error) throw error

      // Refresh the list
      if (staff) {
        loadClients(staff.id)
      }
      alert('Client restored!')
    } catch (error) {
      console.error('Error restoring client:', error)
      alert('Error restoring client: ' + error.message)
    }
  }

  const toggleTrashView = () => {
    setViewTrash(!viewTrash)
  }

  const handleLogout = () => {
    localStorage.removeItem('staff')
    router.push('/')
  }

  const getWhatsAppLink = (client) => {
    const message = `Hello ${client.name}, your ${client.form_type} is due on ${new Date(client.due_date).toLocaleDateString()}. Please reply DONE.`
    const phone = client.phone.replace(/[^0-9]/g, '')
    return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`
  }

  const getStatusBadge = (status) => {
    if (status === 'DONE') {
      return (
        <span className="px-3 py-1 bg-green-100 text-green-800 rounded-full text-xs font-medium">
          DONE
        </span>
      )
    }
    return (
      <span className="px-3 py-1 bg-red-100 text-red-800 rounded-full text-xs font-medium">
        PENDING
      </span>
    )
  }

  const getTaxPeriod = (dueDate) => {
    if (!dueDate) return ''
    const date = new Date(dueDate)
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    return `${months[date.getMonth()]} ${date.getFullYear()}`
  }

  const getStaffInitials = (staffName) => {
    if (!staffName) return 'UN'
    const parts = staffName.trim().split(' ')
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    }
    return staffName.substring(0, 2).toUpperCase()
  }

  const getAvatarColor = (name) => {
    const colors = [
      'bg-blue-500', 'bg-purple-500', 'bg-pink-500', 'bg-indigo-500',
      'bg-teal-500', 'bg-orange-500', 'bg-cyan-500', 'bg-rose-500'
    ]
    if (!name) return colors[0]
    let hash = 0
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash)
    }
    return colors[Math.abs(hash) % colors.length]
  }

  const formatDate = (dateString) => {
    if (!dateString) return ''
    const date = new Date(dateString)
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    const day = date.getDate()
    const month = months[date.getMonth()]
    const year = date.getFullYear()
    return `${day} ${month}, ${year}`
  }

  const isDateTodayOrPast = (dateString) => {
    if (!dateString) return false
    const date = new Date(dateString)
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    date.setHours(0, 0, 0, 0)
    return date <= today
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-gray-600">Loading...</div>
      </div>
    )
  }

  if (!staff) {
    return null
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            {/* BRANDING SECTION START */}
            <div>
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-8 h-8 text-indigo-600" />
                <h1 className="text-3xl font-bold tracking-tight text-gray-900">Comply</h1>
              </div>
              <p className="text-sm text-gray-500 mt-1 ml-1">Compliance Automation • Welcome, {staff.name}</p>
            </div>
            {/* BRANDING SECTION END */}

            <button
              onClick={handleLogout}
              className="flex items-center gap-2 px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition"
            >
              <LogOut className="w-4 h-4" />
              Logout
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Dual-Zone Intelligence Bar */}
        <div className="mb-6 grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Zone 1: Compliance Alert */}
          {complianceAlert && (
            <div className="bg-amber-100 border-l-4 border-r-4 border-amber-400 text-amber-900 px-4 py-3 rounded-lg flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 flex-shrink-0 text-amber-700" />
              <span className="flex-1 text-sm">⚠️ OFFICIAL ALERT: {complianceAlert}</span>
            </div>
          )}

          {/* Zone 2: Market Pulse */}
          {marketPulse && (
            <a
              href="https://www.taxscan.in/"
              target="_blank"
              rel="noopener noreferrer"
              title="Click to view full news source"
              className="bg-slate-100 border border-slate-300 text-slate-800 px-4 py-3 rounded-lg flex items-center gap-2 hover:bg-slate-200 transition cursor-pointer"
            >
              <Globe className="w-5 h-5 flex-shrink-0 text-slate-600" />
              <span className="flex-1 text-sm">📰 LATEST NEWS: {marketPulse}</span>
            </a>
          )}
        </div>

        {/* Add Client Button */}
        <div className="mb-6 flex justify-between items-center">
          <h2 className="text-xl font-semibold text-gray-900">{viewTrash ? 'Trash' : 'Clients'}</h2>
          <div className="flex items-center gap-2">
            <button
              onClick={toggleTrashView}
              className="flex items-center gap-2 px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition"
            >
              {viewTrash ? '⬅️ Back to Dashboard' : '🗑️ View Trash'}
            </button>
            {!viewTrash && (
              <button
                onClick={() => setShowAddForm(!showAddForm)}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition"
              >
                <Plus className="w-4 h-4" />
                Add Client
              </button>
            )}
          </div>
        </div>

        {/* Add Client Form */}
        {showAddForm && (
          <div className="mb-6 bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Add New Client</h3>
            <form onSubmit={handleAddClient} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Name
                  </label>
                  <input
                    type="text"
                    value={newClient.name}
                    onChange={(e) => setNewClient({ ...newClient, name: e.target.value })}
                    required
                    className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 placeholder:text-gray-500 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Phone
                  </label>
                  <input
                    type="tel"
                    value={newClient.phone}
                    onChange={(e) => setNewClient({ ...newClient, phone: e.target.value })}
                    required
                    className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 placeholder:text-gray-500 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Form Type
                  </label>
                  <input
                    type="text"
                    value={newClient.form_type}
                    onChange={(e) => setNewClient({ ...newClient, form_type: e.target.value })}
                    required
                    className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 placeholder:text-gray-500 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
                    placeholder="e.g., ITR, GST, TDS"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Due Date
                  </label>
                  <input
                    type="date"
                    value={newClient.due_date}
                    onChange={(e) => setNewClient({ ...newClient, due_date: e.target.value })}
                    required
                    className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 placeholder:text-gray-500 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition"
                >
                  {submitting ? 'Adding...' : 'Add Client'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowAddForm(false)}
                  className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Clients Table */}
        {clients.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-12 text-center">
            <p className="text-gray-600">No clients found. Add your first client above.</p>
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Client</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Assigned</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Due Date</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {clients.map((client) => (
                    <tr key={client.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div>
                          <div className="text-sm font-medium text-gray-900">{client.name}</div>
                          <div className="text-sm text-gray-500">Tax Period: {getTaxPeriod(client.due_date)}</div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <div className={`w-10 h-10 rounded-full ${getAvatarColor(staff?.name || '')} flex items-center justify-center text-white font-medium text-sm`}>
                            {getStaffInitials(staff?.name || '')}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {getStatusBadge(client.status)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`text-sm text-gray-900 ${isDateTodayOrPast(client.due_date) ? 'font-bold' : ''}`}>
                          {formatDate(client.due_date)}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <div className="flex items-center gap-2">
                          <a
                            href={getWhatsAppLink(client)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 px-3 py-1.5 bg-green-500 text-white rounded-lg hover:bg-green-600 transition"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16" className="text-white">
                              <path d="M13.601 2.326A7.854 7.854 0 0 0 7.994 0C3.627 0 .068 3.558.064 7.926c0 1.399.366 2.76 1.057 3.965L0 16l4.204-1.102a7.933 7.933 0 0 0 3.79.965h.004c4.368 0 7.926-3.558 7.93-7.93A7.898 7.898 0 0 0 13.6 2.326zM7.994 14.521a6.573 6.573 0 0 1-3.356-.92l-.24-.144-2.494.654.666-2.433-.156-.251a6.56 6.56 0 0 1-1.007-3.505c0-3.626 2.957-6.584 6.591-6.584a6.56 6.56 0 0 1 4.66 1.931 6.557 6.557 0 0 1 1.928 4.66c-.004 3.639-2.961 6.592-6.592 6.592zm3.615-4.934c-.197-.099-1.17-.578-1.353-.646-.182-.065-.315-.099-.445.099-.133.197-.513.646-.627.775-.114.133-.232.148-.43.05-.197-.1-.836-.308-1.592-.985-.59-.525-.985-1.175-1.103-1.372-.114-.198-.011-.304.088-.403.087-.088.197-.232.296-.346.1-.114.133-.198.198-.33.065-.134.034-.248-.015-.347-.05-.099-.445-1.076-.612-1.47-.16-.389-.323-.335-.445-.34-.114-.007-.247-.007-.38-.007a.729.729 0 0 0-.529.247c-.182.198-.691.677-.691 1.654 0 .977.71 1.916.81 2.049.098.133 1.394 2.132 3.383 2.992.47.205.84.326 1.129.418.475.152.904.129 1.246.08.38-.058 1.171-.48 1.338-.943.164-.464.164-.86.114-.943-.049-.084-.182-.133-.38-.232z"/>
                            </svg>
                            WhatsApp
                          </a>
                          {!viewTrash && client.status !== 'DONE' && (
                            <button
                              onClick={() => handleMarkDone(client.id)}
                              className="inline-flex items-center gap-1 px-3 py-1.5 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition"
                              title="Mark Done"
                            >
                              <CheckCircle2 className="w-4 h-4" />
                              Done
                            </button>
                          )}
                          {viewTrash ? (
                            <button
                              onClick={() => handleRestore(client.id)}
                              className="inline-flex items-center gap-1 px-3 py-1.5 bg-green-500 text-white rounded-lg hover:bg-green-600 transition"
                              title="Restore"
                            >
                              <RefreshCw className="w-4 h-4" />
                              Restore
                            </button>
                          ) : (
                            <button
                              onClick={() => handleDelete(client.id)}
                              className="inline-flex items-center gap-1 px-3 py-1.5 bg-red-500 text-white rounded-lg hover:bg-red-600 transition"
                              title="Move to Trash"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>

      {/* Support FAB */}
      <a
        href="https://wa.me/918971772472?text=Hi%2C%20I%20need%20help%20with%20the%20Dashboard."
        target="_blank"
        rel="noopener noreferrer"
        className="fixed bottom-6 right-6 z-50 flex items-center gap-2 bg-blue-600 text-white px-4 py-3 rounded-full shadow-lg hover:bg-blue-700 transition hover:shadow-xl"
      >
        <MessageCircleQuestion className="w-5 h-5" />
        <span className="font-medium">Help & Support</span>
      </a>
    </div>
  )
}
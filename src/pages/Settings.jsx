import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabaseClient'

export default function Settings() {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState({ type: '', text: '' })
  
  const [profile, setProfile] = useState({
    display_name: '',
    email: '',
    notification_email: true,
    notification_upload: true,
    notification_api: false,
    default_chart_type: 'line',
    rows_per_page: 25,
    date_format: 'YYYY-MM-DD',
    timezone: 'UTC'
  })

  const [apiSettings, setApiSettings] = useState({
    rate_limit: 1000,
    api_key: '',
    webhook_url: ''
  })

  const [dataRetention, setDataRetention] = useState({
    auto_delete: false,
    retention_days: 90,
    archive_old_data: true
  })

  useEffect(() => {
    fetchUserAndSettings()
  }, [])

  async function fetchUserAndSettings() {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      setUser(user)

      if (user) {
        const { data: settings } = await supabase
          .from('user_settings')
          .select('*')
          .eq('user_id', user.id)
          .single()

        if (settings) {
          setProfile(prev => ({
            ...prev,
            display_name: settings.display_name || '',
            email: user.email || '',
            notification_email: settings.notification_email ?? true,
            notification_upload: settings.notification_upload ?? true,
            notification_api: settings.notification_api ?? false,
            default_chart_type: settings.default_chart_type || 'line',
            rows_per_page: settings.rows_per_page || 25,
            date_format: settings.date_format || 'YYYY-MM-DD',
            timezone: settings.timezone || 'UTC'
          }))

          setApiSettings({
            rate_limit: settings.rate_limit || 1000,
            api_key: settings.api_key || generateApiKey(),
            webhook_url: settings.webhook_url || ''
          })

          setDataRetention({
            auto_delete: settings.auto_delete ?? false,
            retention_days: settings.retention_days || 90,
            archive_old_data: settings.archive_old_data ?? true
          })
        } else {
          setProfile(prev => ({ ...prev, email: user.email || '' }))
          setApiSettings(prev => ({ ...prev, api_key: generateApiKey() }))
        }
      }
    } catch (error) {
      console.error('Error fetching settings:', error)
    } finally {
      setLoading(false)
    }
  }

  function generateApiKey() {
    return 'dv_' + Array.from(crypto.getRandomValues(new Uint8Array(24)))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')
  }

  async function saveSettings() {
    if (!user) return
    
    setSaving(true)
    setMessage({ type: '', text: '' })

    try {
      const settingsData = {
        user_id: user.id,
        display_name: profile.display_name,
        notification_email: profile.notification_email,
        notification_upload: profile.notification_upload,
        notification_api: profile.notification_api,
        default_chart_type: profile.default_chart_type,
        rows_per_page: profile.rows_per_page,
        date_format: profile.date_format,
        timezone: profile.timezone,
        rate_limit: apiSettings.rate_limit,
        api_key: apiSettings.api_key,
        webhook_url: apiSettings.webhook_url,
        auto_delete: dataRetention.auto_delete,
        retention_days: dataRetention.retention_days,
        archive_old_data: dataRetention.archive_old_data,
        updated_at: new Date().toISOString()
      }

      const { error } = await supabase
        .from('user_settings')
        .upsert(settingsData, { onConflict: 'user_id' })

      if (error) throw error

      setMessage({ type: 'success', text: 'Settings saved successfully!' })
    } catch (error) {
      console.error('Error saving settings:', error)
      setMessage({ type: 'error', text: 'Failed to save settings. Please try again.' })
    } finally {
      setSaving(false)
    }
  }

  function regenerateApiKey() {
    const newKey = generateApiKey()
    setApiSettings(prev => ({ ...prev, api_key: newKey }))
  }

  async function copyApiKey() {
    try {
      await navigator.clipboard.writeText(apiSettings.api_key)
      setMessage({ type: 'success', text: 'API key copied to clipboard!' })
      setTimeout(() => setMessage({ type: '', text: '' }), 3000)
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to copy API key' })
    }
  }

  async function exportAllData() {
    if (!user) return
    
    try {
      const { data: datasets } = await supabase
        .from('datasets')
        .select('*')
        .eq('user_id', user.id)

      const exportData = {
        exportDate: new Date().toISOString(),
        user: { id: user.id, email: user.email },
        settings: { profile, apiSettings, dataRetention },
        datasets: datasets || []
      }

      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `datavault-export-${new Date().toISOString().split('T')[0]}.json`
      a.click()
      URL.revokeObjectURL(url)

      setMessage({ type: 'success', text: 'Data exported successfully!' })
    } catch (error) {
      console.error('Export error:', error)
      setMessage({ type: 'error', text: 'Failed to export data' })
    }
  }

  async function deleteAllData() {
    if (!user) return
    
    const confirmed = window.confirm(
      'Are you sure you want to delete ALL your data? This action cannot be undone.'
    )
    
    if (!confirmed) return

    const doubleConfirm = window.prompt(
      'Type "DELETE ALL" to confirm permanent deletion of all your data:'
    )

    if (doubleConfirm !== 'DELETE ALL') {
      setMessage({ type: 'error', text: 'Deletion cancelled - confirmation text did not match' })
      return
    }

    try {
      await supabase.from('data_rows').delete().eq('user_id', user.id)
      await supabase.from('datasets').delete().eq('user_id', user.id)
      
      setMessage({ type: 'success', text: 'All data has been permanently deleted' })
    } catch (error) {
      console.error('Delete error:', error)
      setMessage({ type: 'error', text: 'Failed to delete data' })
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-[#3b82f6]"></div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-900 text-white">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Settings</h1>
          <p className="text-slate-400">Manage your DataVault preferences and configuration</p>
        </div>

        {message.text && (
          <div className={`mb-6 p-4 rounded-lg ${
            message.type === 'success' 
              ? 'bg-green-900/50 border border-green-500 text-green-300' 
              : 'bg-red-900/50 border border-red-500 text-red-300'
          }`}>
            {message.text}
          </div>
        )}

        <div className="space-y-6">
          {/* Profile Settings */}
          <section className="bg-slate-800 rounded-xl p-6 border border-slate-700">
            <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
              <svg className="w-5 h-5 text-[#3b82f6]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              Profile Settings
            </h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Display Name</label>
                <input
                  type="text"
                  value={profile.display_name}
                  onChange={(e) => setProfile(prev => ({ ...prev, display_name: e.target.value }))}
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-[#3b82f6] focus:border-transparent"
                  placeholder="Your name"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Email</label>
                <input
                  type="email"
                  value={profile.email}
                  disabled
                  className="w-full bg-slate-700/50 border border-slate-600 rounded-lg px-4 py-2 text-slate-400 cursor-not-allowed"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Timezone</label>
                <select
                  value={profile.timezone}
                  onChange={(e) => setProfile(prev => ({ ...prev, timezone: e.target.value }))}
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-[#3b82f6]"
                >
                  <option value="UTC">UTC</option>
                  <option value="America/New_York">Eastern Time</option>
                  <option value="America/Chicago">Central Time</option>
                  <option value="America/Denver">Mountain Time</option>
                  <option value="America/Los_Angeles">Pacific Time</option>
                  <option value="Europe/London">London</option>
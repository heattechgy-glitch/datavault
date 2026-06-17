import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabaseClient'

export default function Dashboard() {
  const [datasets, setDatasets] = useState([])
  const [selectedDataset, setSelectedDataset] = useState(null)
  const [dataPreview, setDataPreview] = useState([])
  const [stats, setStats] = useState({
    totalDatasets: 0,
    totalRows: 0,
    recentUploads: 0,
    storageUsed: '0 MB'
  })
  const [loading, setLoading] = useState(true)
  const [chartData, setChartData] = useState([])
  const [timeRange, setTimeRange] = useState('7d')
  const [sortConfig, setSortConfig] = useState({ key: 'created_at', direction: 'desc' })
  const [filterText, setFilterText] = useState('')

  useEffect(() => {
    fetchDashboardData()
  }, [timeRange])

  useEffect(() => {
    if (selectedDataset) {
      fetchDataPreview(selectedDataset.id)
    }
  }, [selectedDataset])

  async function fetchDashboardData() {
    setLoading(true)
    try {
      const { data: datasetsData, error: datasetsError } = await supabase
        .from('datasets')
        .select('*')
        .order('created_at', { ascending: false })

      if (datasetsError) throw datasetsError

      const totalRows = datasetsData?.reduce((sum, d) => sum + (d.row_count || 0), 0) || 0
      const totalSize = datasetsData?.reduce((sum, d) => sum + (d.file_size || 0), 0) || 0

      const now = new Date()
      const daysAgo = timeRange === '7d' ? 7 : timeRange === '30d' ? 30 : 90
      const cutoffDate = new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000)
      const recentUploads = datasetsData?.filter(d => new Date(d.created_at) > cutoffDate).length || 0

      setDatasets(datasetsData || [])
      setStats({
        totalDatasets: datasetsData?.length || 0,
        totalRows,
        recentUploads,
        storageUsed: formatBytes(totalSize)
      })

      generateChartData(datasetsData || [], daysAgo)

      if (datasetsData && datasetsData.length > 0 && !selectedDataset) {
        setSelectedDataset(datasetsData[0])
      }
    } catch (error) {
      console.error('Error fetching dashboard data:', error)
    } finally {
      setLoading(false)
    }
  }

  async function fetchDataPreview(datasetId) {
    try {
      const { data, error } = await supabase
        .from('data_records')
        .select('*')
        .eq('dataset_id', datasetId)
        .limit(10)

      if (error) throw error
      setDataPreview(data || [])
    } catch (error) {
      console.error('Error fetching data preview:', error)
      setDataPreview([])
    }
  }

  function generateChartData(data, days) {
    const chartPoints = []
    const now = new Date()

    for (let i = days - 1; i >= 0; i--) {
      const date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000)
      const dateStr = date.toISOString().split('T')[0]
      const count = data.filter(d => d.created_at?.startsWith(dateStr)).length
      const rows = data
        .filter(d => d.created_at?.startsWith(dateStr))
        .reduce((sum, d) => sum + (d.row_count || 0), 0)

      chartPoints.push({
        date: dateStr,
        label: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        uploads: count,
        rows
      })
    }

    setChartData(chartPoints)
  }

  function formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  function handleSort(key) {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
    }))
  }

  const filteredDatasets = datasets
    .filter(d => d.name?.toLowerCase().includes(filterText.toLowerCase()))
    .sort((a, b) => {
      const aVal = a[sortConfig.key]
      const bVal = b[sortConfig.key]
      if (sortConfig.direction === 'asc') {
        return aVal > bVal ? 1 : -1
      }
      return aVal < bVal ? 1 : -1
    })

  const maxUploads = Math.max(...chartData.map(d => d.uploads), 1)

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-[#3b82f6] border-t-transparent rounded-full animate-spin"></div>
          <p className="text-white text-lg">Loading dashboard...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-900 text-white">
      <header className="bg-slate-800 border-b border-slate-700 px-4 py-4 md:px-6">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-white flex items-center gap-3">
              <svg className="w-8 h-8 text-[#3b82f6]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
              </svg>
              DataVault
            </h1>
            <p className="text-slate-400 mt-1">Your data management dashboard</p>
          </div>
          <div className="flex items-center gap-3">
            <select
              value={timeRange}
              onChange={(e) => setTimeRange(e.target.value)}
              className="bg-slate-700 text-white px-4 py-2 rounded-lg border border-slate-600 focus:outline-none focus:ring-2 focus:ring-[#3b82f6]"
            >
              <option value="7d">Last 7 days</option>
              <option value="30d">Last 30 days</option>
              <option value="90d">Last 90 days</option>
            </select>
            <a
              href="/upload"
              className="bg-[#3b82f6] hover:bg-blue-600 text-white px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              <span className="hidden sm:inline">Upload CSV</span>
            </a>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6 md:px-6 md:py-8">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-slate-800 rounded-xl p-4 md:p-6 border border-slate-700">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-[#3b82f6]/20 rounded-lg">
                <svg className="w-5 h-5 text-[#3b82f6]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                </svg>
              </div>
              <span className="text-slate-400 text-sm">Total Datasets</span>
            </div>
            <p className="text-2xl md:text-3xl font-bold">{stats.totalDatasets}</p>
          </div>

          <div className="bg-slate-800 rounded-xl p-4 md:p-6 border border-slate-700">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-green-500/20 rounded-lg">
                <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </div>
              <span className="text-slate-400 text-sm">Total Rows</span>
            </div>
            <p className="text-2xl md:text-3xl font-bold">{stats.totalRows.toLocaleString()}</p>
          </div>

          <div className="bg-slate-800 rounded-xl p-4 md:p-6
import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabaseClient'

export default function Upload() {
  const [file, setFile] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [uploadHistory, setUploadHistory] = useState([])
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)
  const [dragActive, setDragActive] = useState(false)
  const [previewData, setPreviewData] = useState(null)
  const [tableName, setTableName] = useState('')

  useEffect(() => {
    fetchUploadHistory()
  }, [])

  const fetchUploadHistory = async () => {
    try {
      const { data, error } = await supabase
        .from('uploads')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(10)

      if (error) throw error
      setUploadHistory(data || [])
    } catch (err) {
      console.error('Error fetching upload history:', err)
    }
  }

  const parseCSV = (text) => {
    const lines = text.trim().split('\n')
    const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''))
    const rows = []

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map(v => v.trim().replace(/"/g, ''))
      if (values.length === headers.length) {
        const row = {}
        headers.forEach((header, index) => {
          row[header] = values[index]
        })
        rows.push(row)
      }
    }

    return { headers, rows }
  }

  const handleFileSelect = async (selectedFile) => {
    if (!selectedFile) return

    if (!selectedFile.name.endsWith('.csv')) {
      setError('Please select a CSV file')
      return
    }

    setFile(selectedFile)
    setError(null)
    setSuccess(null)

    const suggestedName = selectedFile.name
      .replace('.csv', '')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '_')
    setTableName(suggestedName)

    try {
      const text = await selectedFile.text()
      const parsed = parseCSV(text)
      setPreviewData({
        headers: parsed.headers,
        rows: parsed.rows.slice(0, 5),
        totalRows: parsed.rows.length
      })
    } catch (err) {
      setError('Error reading file: ' + err.message)
    }
  }

  const handleDrag = (e) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true)
    } else if (e.type === 'dragleave') {
      setDragActive(false)
    }
  }

  const handleDrop = (e) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelect(e.dataTransfer.files[0])
    }
  }

  const handleUpload = async () => {
    if (!file || !tableName) {
      setError('Please select a file and provide a table name')
      return
    }

    setUploading(true)
    setUploadProgress(0)
    setError(null)
    setSuccess(null)

    try {
      const text = await file.text()
      const { headers, rows } = parseCSV(text)

      setUploadProgress(20)

      const { error: storageError } = await supabase.storage
        .from('csv-uploads')
        .upload(`${Date.now()}_${file.name}`, file, {
          cacheControl: '3600',
          upsert: false
        })

      if (storageError && storageError.message !== 'The resource already exists') {
        console.warn('Storage upload warning:', storageError)
      }

      setUploadProgress(40)

      const columnDefs = headers.map(h => `"${h}" TEXT`).join(', ')
      
      const { error: createError } = await supabase.rpc('execute_sql', {
        sql_query: `CREATE TABLE IF NOT EXISTS "${tableName}" (
          id SERIAL PRIMARY KEY,
          ${columnDefs},
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )`
      })

      if (createError) {
        console.warn('Table creation via RPC failed, attempting direct insert')
      }

      setUploadProgress(60)

      const batchSize = 100
      for (let i = 0; i < rows.length; i += batchSize) {
        const batch = rows.slice(i, i + batchSize)
        
        const { error: insertError } = await supabase
          .from(tableName)
          .insert(batch)

        if (insertError) {
          throw new Error(`Error inserting data: ${insertError.message}`)
        }

        setUploadProgress(60 + Math.floor((i / rows.length) * 30))
      }

      setUploadProgress(90)

      const { error: uploadRecordError } = await supabase
        .from('uploads')
        .insert({
          file_name: file.name,
          table_name: tableName,
          row_count: rows.length,
          column_count: headers.length,
          columns: headers,
          file_size: file.size,
          status: 'completed'
        })

      if (uploadRecordError) {
        console.warn('Could not record upload:', uploadRecordError)
      }

      setUploadProgress(100)
      setSuccess(`Successfully uploaded ${rows.length} rows to table "${tableName}"`)
      
      setFile(null)
      setPreviewData(null)
      setTableName('')
      fetchUploadHistory()

    } catch (err) {
      setError(err.message)
    } finally {
      setUploading(false)
    }
  }

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleString()
  }

  return (
    <div className="min-h-screen bg-slate-900 text-white">
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl md:text-4xl font-bold mb-2">Upload Data</h1>
          <p className="text-slate-400">
            Upload CSV files to store in your PostgreSQL database
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <div
              className={`border-2 border-dashed rounded-xl p-8 md:p-12 text-center transition-all duration-200 ${
                dragActive
                  ? 'border-[#3b82f6] bg-[#3b82f6]/10'
                  : 'border-slate-700 hover:border-slate-600 bg-slate-800/50'
              }`}
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
            >
              <div className="flex flex-col items-center">
                <svg
                  className={`w-16 h-16 mb-4 ${dragActive ? 'text-[#3b82f6]' : 'text-slate-500'}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                  />
                </svg>
                <p className="text-lg mb-2">
                  {dragActive ? 'Drop your file here' : 'Drag and drop your CSV file here'}
                </p>
                <p className="text-slate-500 mb-4">or</p>
                <label className="cursor-pointer">
                  <span className="px-6 py-3 bg-[#3b82f6] hover:bg-[#3b82f6]/90 rounded-lg font-medium transition-colors">
                    Browse Files
                  </span>
                  <input
                    type="file"
                    accept=".csv"
                    className="hidden"
                    onChange={(e) => handleFileSelect(e.target.files[0])}
                  />
                </label>
                <p className="text-slate-500 text-sm mt-4">
                  Supported format: CSV (max 50MB)
                </p>
              </div>
            </div>

            {file && (
              <div className="bg-slate-800 rounded-xl p-6">
                <h3 className="text-lg font-semibold mb-4">Selected File</h3>
                <div className="flex items-center justify-between p-4 bg-slate-700/50 rounded-lg">
                  <div className="flex items-center space-x-4">
                    <div className="p-3 bg-[#3b82f6]/20 rounded-lg">
                      <svg className="w-6 h-6 text-[#3b82f6]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                    </div>
                    <div>
                      <p className="font-medium">{file.name}</p>
                      <p className="text-slate-400 text-sm">{formatFileSize(file.size)}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      setFile(null)
                      setPreviewData(null)
                      setTableName('')
                    }}
                    className="p-2 hover:bg-slate-600 rounded-lg transition-colors"
                  >
                    <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor
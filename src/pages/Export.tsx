import { useMemo, useState } from 'react'
import { useSelectedEngineerStore } from '@/stores/selectedEngineerStore'
import { useMembersStore } from '@/stores/membersStore'
import { useTimeEntriesStore } from '@/stores/timeEntriesStore'
import { useTicketsStore } from '@/stores/ticketsStore'
import { api } from '@/lib/api'
import { format, subDays, subMonths } from 'date-fns'

type ExportFormat = 'csv' | 'pdf' | 'ai-summary'
type DateRange = '7d' | '30d' | '90d' | '6m' | '1y' | 'custom'

export default function Export() {
  const { selectedEngineerId } = useSelectedEngineerStore()
  const { members } = useMembersStore()
  const { entries } = useTimeEntriesStore()
  const { tickets } = useTicketsStore()
  
  const [selectedFormat, setSelectedFormat] = useState<ExportFormat>('csv')
  const [dateRangePreset, setDateRangePreset] = useState<DateRange>('30d')
  const [customStartDate, setCustomStartDate] = useState('')
  const [customEndDate, setCustomEndDate] = useState('')
  const [isExporting, setIsExporting] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)
  const [aiSummary, setAiSummary] = useState<string | null>(null)
  const [includeNotes, setIncludeNotes] = useState(true)
  const [includeTickets, setIncludeTickets] = useState(true)

  const selectedEngineer = selectedEngineerId 
    ? members.find(m => m.id === selectedEngineerId)
    : null

  // Calculate date range
  const dateRange = useMemo(() => {
    const end = new Date()
    let start: Date

    if (dateRangePreset === 'custom') {
      start = customStartDate ? new Date(customStartDate) : subDays(end, 30)
      return { 
        start, 
        end: customEndDate ? new Date(customEndDate) : end 
      }
    }

    switch (dateRangePreset) {
      case '7d': start = subDays(end, 7); break
      case '30d': start = subDays(end, 30); break
      case '90d': start = subDays(end, 90); break
      case '6m': start = subMonths(end, 6); break
      case '1y': start = subMonths(end, 12); break
      default: start = subDays(end, 30)
    }

    return { start, end }
  }, [dateRangePreset, customStartDate, customEndDate])

  // Filter entries
  const filteredEntries = useMemo(() => {
    let result = entries.filter(e => {
      const entryDate = new Date(e.dateStart)
      return entryDate >= dateRange.start && entryDate <= dateRange.end
    })

    if (selectedEngineerId !== null) {
      result = result.filter(e => e.memberId === selectedEngineerId)
    }

    return result
  }, [entries, selectedEngineerId, dateRange])

  // Get relevant tickets
  const relevantTickets = useMemo(() => {
    const ticketIds = new Set(filteredEntries.filter(e => e.ticketId).map(e => e.ticketId))
    return tickets.filter(t => ticketIds.has(t.id))
  }, [filteredEntries, tickets])

  // Calculate summary stats
  const stats = useMemo(() => {
    const totalHours = filteredEntries.reduce((sum, e) => sum + e.hours, 0)
    const billableHours = filteredEntries
      .filter(e => e.billableOption === 'Billable')
      .reduce((sum, e) => sum + e.hours, 0)
    const withNotes = filteredEntries.filter(e => e.notes && e.notes.trim().length > 0).length

    return {
      totalHours,
      billableHours,
      billablePercent: totalHours > 0 ? (billableHours / totalHours) * 100 : 0,
      entryCount: filteredEntries.length,
      notesPercent: filteredEntries.length > 0 ? (withNotes / filteredEntries.length) * 100 : 0,
      ticketCount: relevantTickets.length,
      closedTickets: relevantTickets.filter(t => t.closedFlag).length,
    }
  }, [filteredEntries, relevantTickets])

  // Export as CSV
  const exportCSV = () => {
    const headers = ['Date', 'Hours', 'Billable', 'Ticket ID']
    if (selectedEngineerId === null) headers.splice(1, 0, 'Engineer')
    if (includeNotes) headers.push('Notes')

    const rows = filteredEntries.map(e => {
      const member = members.find(m => m.id === e.memberId)
      const row = [
        format(new Date(e.dateStart), 'yyyy-MM-dd'),
        e.hours.toString(),
        e.billableOption || 'N/A',
        e.ticketId?.toString() || '',
      ]
      if (selectedEngineerId === null) {
        row.splice(1, 0, member ? `${member.firstName} ${member.lastName}` : `Member ${e.memberId}`)
      }
      if (includeNotes) {
        // Escape quotes and wrap in quotes for CSV
        const notes = (e.notes || '').replace(/"/g, '""')
        row.push(`"${notes}"`)
      }
      return row.join(',')
    })

    const csv = [headers.join(','), ...rows].join('\n')
    downloadFile(csv, `time-entries-${format(new Date(), 'yyyy-MM-dd')}.csv`, 'text/csv')
  }

  // Export as PDF (using print dialog)
  const exportPDF = () => {
    const member = selectedEngineer 
      ? `${selectedEngineer.firstName} ${selectedEngineer.lastName}`
      : 'All Engineers'

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Time Tracking Report</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 40px; color: #333; }
          h1 { color: #1e3a8a; border-bottom: 2px solid #1e3a8a; padding-bottom: 10px; }
          h2 { color: #374151; margin-top: 30px; }
          .summary { display: flex; gap: 20px; margin: 20px 0; }
          .stat { background: #f3f4f6; padding: 20px; border-radius: 8px; flex: 1; text-align: center; }
          .stat-value { font-size: 32px; font-weight: bold; color: #1e3a8a; }
          .stat-label { color: #6b7280; font-size: 14px; }
          table { width: 100%; border-collapse: collapse; margin-top: 20px; }
          th, td { border: 1px solid #e5e7eb; padding: 12px; text-align: left; }
          th { background: #f9fafb; font-weight: 600; }
          tr:nth-child(even) { background: #f9fafb; }
          .footer { margin-top: 40px; text-align: center; color: #9ca3af; font-size: 12px; }
          @media print { body { padding: 20px; } }
        </style>
      </head>
      <body>
        <h1>📊 Time Tracking Report</h1>
        <p><strong>Engineer:</strong> ${member}</p>
        <p><strong>Period:</strong> ${format(dateRange.start, 'MMM d, yyyy')} - ${format(dateRange.end, 'MMM d, yyyy')}</p>
        
        <h2>Summary</h2>
        <div class="summary">
          <div class="stat">
            <div class="stat-value">${stats.totalHours.toFixed(1)}</div>
            <div class="stat-label">Total Hours</div>
          </div>
          <div class="stat">
            <div class="stat-value">${stats.billableHours.toFixed(1)}</div>
            <div class="stat-label">Billable Hours</div>
          </div>
          <div class="stat">
            <div class="stat-value">${stats.billablePercent.toFixed(0)}%</div>
            <div class="stat-label">Billable %</div>
          </div>
          <div class="stat">
            <div class="stat-value">${stats.entryCount}</div>
            <div class="stat-label">Entries</div>
          </div>
        </div>
        
        <h2>Time Entries</h2>
        <table>
          <thead>
            <tr>
              <th>Date</th>
              ${selectedEngineerId === null ? '<th>Engineer</th>' : ''}
              <th>Hours</th>
              <th>Billable</th>
              <th>Ticket</th>
              ${includeNotes ? '<th>Notes</th>' : ''}
            </tr>
          </thead>
          <tbody>
            ${filteredEntries.slice(0, 100).map(e => {
              const member = members.find(m => m.id === e.memberId)
              return `
                <tr>
                  <td>${format(new Date(e.dateStart), 'MMM d, yyyy')}</td>
                  ${selectedEngineerId === null ? `<td>${member ? `${member.firstName} ${member.lastName}` : ''}</td>` : ''}
                  <td>${e.hours}</td>
                  <td>${e.billableOption || 'N/A'}</td>
                  <td>${e.ticketId || ''}</td>
                  ${includeNotes ? `<td>${(e.notes || '').substring(0, 100)}${(e.notes?.length || 0) > 100 ? '...' : ''}</td>` : ''}
                </tr>
              `
            }).join('')}
          </tbody>
        </table>
        ${filteredEntries.length > 100 ? `<p><em>Showing first 100 of ${filteredEntries.length} entries</em></p>` : ''}
        
        ${includeTickets && relevantTickets.length > 0 ? `
          <h2>Related Tickets</h2>
          <table>
            <thead>
              <tr>
                <th>Ticket #</th>
                <th>Summary</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              ${relevantTickets.slice(0, 50).map(t => `
                <tr>
                  <td>#${t.id}</td>
                  <td>${t.summary || 'No summary'}</td>
                  <td>${t.closedFlag ? '✓ Closed' : 'Open'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        ` : ''}
        
        <div class="footer">
          Generated on ${format(new Date(), 'MMMM d, yyyy h:mm a')} | CW Reviewer
        </div>
      </body>
      </html>
    `

    const printWindow = window.open('', '_blank')
    if (printWindow) {
      printWindow.document.write(html)
      printWindow.document.close()
      printWindow.onload = () => {
        printWindow.print()
      }
    }
  }

  // Generate AI Summary
  const generateAISummary = async () => {
    setIsExporting(true)
    setExportError(null)
    
    try {
      const member = selectedEngineer || { firstName: 'Team', lastName: '' }
      
      const response = await api.generateAnalysis('quarterlySummary', {
        member,
        entries: filteredEntries.slice(0, 50),
        tickets: relevantTickets.slice(0, 20),
        period: {
          start: dateRange.start,
          end: dateRange.end,
        },
      })
      
      setAiSummary(response.analysis)
    } catch (error: any) {
      console.error('Error generating AI summary:', error)
      setExportError(error.message || 'Failed to generate summary')
    } finally {
      setIsExporting(false)
    }
  }

  // Download helper
  const downloadFile = (content: string, filename: string, mimeType: string) => {
    const blob = new Blob([content], { type: mimeType })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  // Handle export
  const handleExport = async () => {
    setIsExporting(true)
    setExportError(null)

    try {
      switch (selectedFormat) {
        case 'csv':
          exportCSV()
          break
        case 'pdf':
          exportPDF()
          break
        case 'ai-summary':
          await generateAISummary()
          break
      }
    } catch (error: any) {
      setExportError(error.message || 'Export failed')
    } finally {
      setIsExporting(false)
    }
  }

  // Copy AI summary to clipboard
  const copyToClipboard = async () => {
    if (aiSummary) {
      await navigator.clipboard.writeText(aiSummary)
      alert('Copied to clipboard!')
    }
  }

  return (
    <div className="px-4 py-6 sm:px-0">
      <div className="mb-6">
        <h2 className="text-3xl font-bold text-white mb-2">Export Data</h2>
        <p className="text-gray-400">
          {selectedEngineer 
            ? `Export data for ${selectedEngineer.firstName} ${selectedEngineer.lastName}`
            : 'Export data for all engineers'}
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Export Options */}
        <div className="lg:col-span-2 space-y-6">
          {/* Date Range */}
          <div className="bg-gray-800 rounded-lg p-6">
            <h3 className="text-lg font-semibold text-white mb-4">Date Range</h3>
            <div className="flex flex-wrap gap-2 mb-4">
              {(['7d', '30d', '90d', '6m', '1y', 'custom'] as DateRange[]).map(range => (
                <button
                  key={range}
                  onClick={() => setDateRangePreset(range)}
                  className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                    dateRangePreset === range
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  }`}
                >
                  {range === '7d' ? '7 Days' :
                   range === '30d' ? '30 Days' :
                   range === '90d' ? '90 Days' :
                   range === '6m' ? '6 Months' :
                   range === '1y' ? '1 Year' :
                   'Custom'}
                </button>
              ))}
            </div>
            
            {dateRangePreset === 'custom' && (
              <div className="flex gap-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Start Date</label>
                  <input
                    type="date"
                    value={customStartDate}
                    onChange={(e) => setCustomStartDate(e.target.value)}
                    className="bg-gray-700 text-white rounded px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">End Date</label>
                  <input
                    type="date"
                    value={customEndDate}
                    onChange={(e) => setCustomEndDate(e.target.value)}
                    className="bg-gray-700 text-white rounded px-3 py-2"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Export Format */}
          <div className="bg-gray-800 rounded-lg p-6">
            <h3 className="text-lg font-semibold text-white mb-4">Export Format</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <button
                onClick={() => setSelectedFormat('csv')}
                className={`p-4 rounded-lg border-2 transition-all ${
                  selectedFormat === 'csv'
                    ? 'border-blue-500 bg-blue-600/20'
                    : 'border-gray-600 hover:border-gray-500'
                }`}
              >
                <span className="text-4xl block mb-2">📊</span>
                <p className="font-semibold text-white">CSV</p>
                <p className="text-sm text-gray-400">Spreadsheet format</p>
              </button>
              
              <button
                onClick={() => setSelectedFormat('pdf')}
                className={`p-4 rounded-lg border-2 transition-all ${
                  selectedFormat === 'pdf'
                    ? 'border-blue-500 bg-blue-600/20'
                    : 'border-gray-600 hover:border-gray-500'
                }`}
              >
                <span className="text-4xl block mb-2">📄</span>
                <p className="font-semibold text-white">PDF Report</p>
                <p className="text-sm text-gray-400">Print-ready format</p>
              </button>
              
              <button
                onClick={() => setSelectedFormat('ai-summary')}
                className={`p-4 rounded-lg border-2 transition-all ${
                  selectedFormat === 'ai-summary'
                    ? 'border-blue-500 bg-blue-600/20'
                    : 'border-gray-600 hover:border-gray-500'
                }`}
              >
                <span className="text-4xl block mb-2">🤖</span>
                <p className="font-semibold text-white">AI Summary</p>
                <p className="text-sm text-gray-400">Generated narrative</p>
              </button>
            </div>
          </div>

          {/* Options */}
          <div className="bg-gray-800 rounded-lg p-6">
            <h3 className="text-lg font-semibold text-white mb-4">Options</h3>
            <div className="space-y-3">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeNotes}
                  onChange={(e) => setIncludeNotes(e.target.checked)}
                  className="rounded border-gray-600 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-white">Include notes in export</span>
              </label>
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeTickets}
                  onChange={(e) => setIncludeTickets(e.target.checked)}
                  className="rounded border-gray-600 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-white">Include related tickets</span>
              </label>
            </div>
          </div>

          {/* Export Button */}
          <button
            onClick={handleExport}
            disabled={isExporting || filteredEntries.length === 0}
            className={`w-full py-4 rounded-lg font-semibold text-lg transition-colors ${
              isExporting || filteredEntries.length === 0
                ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
                : 'bg-blue-600 hover:bg-blue-700 text-white'
            }`}
          >
            {isExporting ? (
              <span className="flex items-center justify-center gap-2">
                <span className="animate-spin">⏳</span> 
                {selectedFormat === 'ai-summary' ? 'Generating...' : 'Exporting...'}
              </span>
            ) : filteredEntries.length === 0 ? (
              'No data to export'
            ) : (
              `Export ${selectedFormat.toUpperCase()}`
            )}
          </button>

          {exportError && (
            <div className="bg-red-600/20 border border-red-500 rounded-lg p-4">
              <p className="text-red-400">{exportError}</p>
            </div>
          )}
        </div>

        {/* Preview / Summary */}
        <div className="space-y-6">
          {/* Data Preview */}
          <div className="bg-gray-800 rounded-lg p-6">
            <h3 className="text-lg font-semibold text-white mb-4">Export Preview</h3>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-gray-400">Period</span>
                <span className="text-white">
                  {format(dateRange.start, 'MMM d')} - {format(dateRange.end, 'MMM d, yyyy')}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Time Entries</span>
                <span className="text-white">{stats.entryCount}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Total Hours</span>
                <span className="text-white">{stats.totalHours.toFixed(1)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Billable Hours</span>
                <span className="text-green-400">{stats.billableHours.toFixed(1)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Billable %</span>
                <span className="text-blue-400">{stats.billablePercent.toFixed(0)}%</span>
              </div>
              {includeTickets && (
                <div className="flex justify-between">
                  <span className="text-gray-400">Tickets</span>
                  <span className="text-white">{stats.ticketCount}</span>
                </div>
              )}
            </div>
          </div>

          {/* AI Summary Result */}
          {aiSummary && (
            <div className="bg-gray-800 rounded-lg p-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold text-white">Generated Summary</h3>
                <button
                  onClick={copyToClipboard}
                  className="text-sm text-blue-400 hover:text-blue-300"
                >
                  📋 Copy
                </button>
              </div>
              <div className="bg-gray-700 rounded-lg p-4 max-h-96 overflow-y-auto">
                <div className="whitespace-pre-wrap text-gray-200 text-sm leading-relaxed">
                  {aiSummary}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

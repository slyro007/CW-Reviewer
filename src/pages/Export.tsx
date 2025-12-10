import { useMemo, useState, useEffect } from 'react'
import { useSelectedEngineerStore } from '@/stores/selectedEngineerStore'
import { useMembersStore } from '@/stores/membersStore'
import { useTimeEntriesStore } from '@/stores/timeEntriesStore'
import { useTicketsStore } from '@/stores/ticketsStore'
import { useTimePeriodStore } from '@/stores/timePeriodStore'
import { api } from '@/lib/api'
import { format } from 'date-fns'

type ExportFormat = 'csv' | 'pdf' | 'ai-summary'

export default function Export() {
  const { selectedEngineerId } = useSelectedEngineerStore()
  const { members } = useMembersStore()
  const { entries, fetchTimeEntries } = useTimeEntriesStore()
  const { tickets } = useTicketsStore()
  const { getDateRange, getPeriodLabel } = useTimePeriodStore()
  
  const [selectedFormat, setSelectedFormat] = useState<ExportFormat>('csv')
  const [isExporting, setIsExporting] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)
  const [aiSummary, setAiSummary] = useState<string | null>(null)
  const [includeNotes, setIncludeNotes] = useState(true)
  const [includeTickets, setIncludeTickets] = useState(true)

  const dateRange = getDateRange()
  const periodLabel = getPeriodLabel()

  const selectedEngineer = selectedEngineerId 
    ? members.find(m => m.id === selectedEngineerId)
    : null

  // Fetch time entries based on global date range
  useEffect(() => {
    fetchTimeEntries({
      startDate: format(dateRange.start, 'yyyy-MM-dd'),
      endDate: format(dateRange.end, 'yyyy-MM-dd'),
    })
  }, [dateRange.start.getTime(), dateRange.end.getTime()])

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
  }, [entries, dateRange, selectedEngineerId])

  // Calculate summary stats
  const summaryStats = useMemo(() => {
    const totalHours = filteredEntries.reduce((sum, e) => sum + e.hours, 0)
    const billableHours = filteredEntries.filter(e => e.billableOption === 'Billable')
      .reduce((sum, e) => sum + e.hours, 0)
    const withNotes = filteredEntries.filter(e => e.notes && e.notes.trim().length > 0).length
    const uniqueTickets = new Set(filteredEntries.filter(e => e.ticketId).map(e => e.ticketId)).size

    return {
      totalHours,
      billableHours,
      billablePercent: totalHours > 0 ? (billableHours / totalHours) * 100 : 0,
      entryCount: filteredEntries.length,
      notesPercent: filteredEntries.length > 0 ? (withNotes / filteredEntries.length) * 100 : 0,
      uniqueTickets,
    }
  }, [filteredEntries])

  // Export to CSV
  const exportCSV = () => {
    const headers = ['Date', 'Engineer', 'Hours', 'Billable', 'Ticket ID']
    if (includeNotes) headers.push('Notes')
    
    const rows = filteredEntries.map(entry => {
      const member = members.find(m => m.id === entry.memberId)
      const row = [
        format(new Date(entry.dateStart), 'yyyy-MM-dd'),
        member ? `${member.firstName} ${member.lastName}` : 'Unknown',
        entry.hours.toString(),
        entry.billableOption || 'N/A',
        entry.ticketId?.toString() || '',
      ]
      if (includeNotes) row.push(entry.notes?.replace(/"/g, '""') || '')
      return row
    })
    
    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n')
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `time-entries-${format(dateRange.start, 'yyyy-MM-dd')}-to-${format(dateRange.end, 'yyyy-MM-dd')}.csv`
    link.click()
  }

  // Export to PDF (using browser print)
  const exportPDF = () => {
    const printContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Time Entry Report</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 20px; }
          h1 { color: #333; }
          .meta { color: #666; margin-bottom: 20px; }
          table { width: 100%; border-collapse: collapse; margin-top: 20px; }
          th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
          th { background-color: #4a5568; color: white; }
          tr:nth-child(even) { background-color: #f9f9f9; }
          .summary { background: #f0f0f0; padding: 15px; margin-bottom: 20px; border-radius: 8px; }
          .summary-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
          .stat { text-align: center; }
          .stat-value { font-size: 24px; font-weight: bold; color: #333; }
          .stat-label { color: #666; font-size: 12px; }
        </style>
      </head>
      <body>
        <h1>Time Entry Report</h1>
        <div class="meta">
          <p><strong>Period:</strong> ${format(dateRange.start, 'MMM d, yyyy')} - ${format(dateRange.end, 'MMM d, yyyy')}</p>
          <p><strong>Engineer:</strong> ${selectedEngineer ? `${selectedEngineer.firstName} ${selectedEngineer.lastName}` : 'All Engineers'}</p>
          <p><strong>Generated:</strong> ${format(new Date(), 'MMM d, yyyy h:mm a')}</p>
        </div>
        
        <div class="summary">
          <h3>Summary</h3>
          <div class="summary-grid">
            <div class="stat">
              <div class="stat-value">${summaryStats.totalHours.toFixed(1)}</div>
              <div class="stat-label">Total Hours</div>
            </div>
            <div class="stat">
              <div class="stat-value">${summaryStats.billablePercent.toFixed(0)}%</div>
              <div class="stat-label">Billable</div>
            </div>
            <div class="stat">
              <div class="stat-value">${summaryStats.entryCount}</div>
              <div class="stat-label">Entries</div>
            </div>
          </div>
        </div>
        
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Engineer</th>
              <th>Hours</th>
              <th>Billable</th>
              ${includeTickets ? '<th>Ticket</th>' : ''}
              ${includeNotes ? '<th>Notes</th>' : ''}
            </tr>
          </thead>
          <tbody>
            ${filteredEntries.slice(0, 100).map(entry => {
              const member = members.find(m => m.id === entry.memberId)
              return `
                <tr>
                  <td>${format(new Date(entry.dateStart), 'yyyy-MM-dd')}</td>
                  <td>${member ? `${member.firstName} ${member.lastName}` : 'Unknown'}</td>
                  <td>${entry.hours}</td>
                  <td>${entry.billableOption || 'N/A'}</td>
                  ${includeTickets ? `<td>${entry.ticketId || '-'}</td>` : ''}
                  ${includeNotes ? `<td>${entry.notes?.substring(0, 100) || '-'}${entry.notes && entry.notes.length > 100 ? '...' : ''}</td>` : ''}
                </tr>
              `
            }).join('')}
          </tbody>
        </table>
        ${filteredEntries.length > 100 ? `<p><em>Showing first 100 of ${filteredEntries.length} entries</em></p>` : ''}
      </body>
      </html>
    `
    
    const printWindow = window.open('', '_blank')
    if (printWindow) {
      printWindow.document.write(printContent)
      printWindow.document.close()
      printWindow.print()
    }
  }

  // Generate AI Summary
  const generateAISummary = async () => {
    setIsExporting(true)
    setExportError(null)
    
    try {
      const response = await api.generateAnalysis('quarterlySummary', {
        member: selectedEngineer || { firstName: 'Team', lastName: '' },
        entries: filteredEntries.slice(0, 100),
        tickets: includeTickets ? tickets.filter(t => 
          filteredEntries.some(e => e.ticketId === t.id)
        ).slice(0, 50) : [],
        period: { start: dateRange.start, end: dateRange.end },
      })
      
      setAiSummary(response.analysis)
    } catch (error: any) {
      console.error('Error generating summary:', error)
      setExportError(error.message || 'Failed to generate summary')
    } finally {
      setIsExporting(false)
    }
  }

  // Handle export
  const handleExport = async () => {
    setExportError(null)
    
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
  }

  return (
    <div className="px-4 py-6 sm:px-0">
      <div className="mb-6">
        <h2 className="text-3xl font-bold text-white mb-2">Export Data</h2>
        <p className="text-gray-400">
          {selectedEngineer 
            ? `Export data for ${selectedEngineer.firstName} ${selectedEngineer.lastName}`
            : 'Export data for all engineers'}
          {' • '}<span className="text-blue-400">{periodLabel}</span>
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Export Options */}
        <div className="bg-gray-800 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-white mb-4">Export Options</h3>
          
          {/* Format Selection */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-300 mb-2">Export Format</label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { value: 'csv', label: 'CSV' },
                { value: 'pdf', label: 'PDF' },
                { value: 'ai-summary', label: 'AI Summary' },
              ].map(format => (
                <button
                  key={format.value}
                  onClick={() => setSelectedFormat(format.value as ExportFormat)}
                  className={`p-3 rounded-lg text-center transition-colors ${
                    selectedFormat === format.value
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  }`}
                >
                  <span className="text-sm font-medium">{format.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Include Options */}
          <div className="mb-6 space-y-3">
            <label className="flex items-center space-x-2 cursor-pointer">
              <input
                type="checkbox"
                checked={includeNotes}
                onChange={(e) => setIncludeNotes(e.target.checked)}
                className="rounded border-gray-600 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-gray-300">Include notes</span>
            </label>
            <label className="flex items-center space-x-2 cursor-pointer">
              <input
                type="checkbox"
                checked={includeTickets}
                onChange={(e) => setIncludeTickets(e.target.checked)}
                className="rounded border-gray-600 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-gray-300">Include ticket information</span>
            </label>
          </div>

          {/* Export Button */}
          <button
            onClick={handleExport}
            disabled={isExporting || filteredEntries.length === 0}
            className={`w-full py-3 rounded-lg font-medium transition-colors ${
              isExporting || filteredEntries.length === 0
                ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
                : 'bg-blue-600 hover:bg-blue-700 text-white'
            }`}
          >
            {isExporting ? (
              <span className="flex items-center justify-center gap-2">
                <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></span>
                Generating...
              </span>
            ) : filteredEntries.length === 0 ? (
              'No data to export'
            ) : (
              `Export ${selectedFormat.toUpperCase()}`
            )}
          </button>

          {exportError && (
            <div className="mt-4 bg-red-600/20 border border-red-500 rounded-lg p-3">
              <p className="text-red-400 text-sm">{exportError}</p>
            </div>
          )}
        </div>

        {/* Preview / Summary */}
        <div className="bg-gray-800 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-white mb-4">Export Preview</h3>
          
          {/* Stats */}
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div className="bg-gray-700 rounded-lg p-4">
              <p className="text-sm text-gray-400">Total Entries</p>
              <p className="text-2xl font-bold text-white">{filteredEntries.length}</p>
            </div>
            <div className="bg-gray-700 rounded-lg p-4">
              <p className="text-sm text-gray-400">Total Hours</p>
              <p className="text-2xl font-bold text-white">{summaryStats.totalHours.toFixed(1)}</p>
            </div>
            <div className="bg-gray-700 rounded-lg p-4">
              <p className="text-sm text-gray-400">Billable %</p>
              <p className="text-2xl font-bold text-green-400">{summaryStats.billablePercent.toFixed(0)}%</p>
            </div>
            <div className="bg-gray-700 rounded-lg p-4">
              <p className="text-sm text-gray-400">Unique Tickets</p>
              <p className="text-2xl font-bold text-blue-400">{summaryStats.uniqueTickets}</p>
            </div>
          </div>

          {/* Sample Data */}
          <div className="border-t border-gray-700 pt-4">
            <h4 className="text-sm font-medium text-gray-300 mb-2">Sample Data (first 5 entries)</h4>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-700">
                    <th className="text-left py-2 text-gray-400">Date</th>
                    <th className="text-left py-2 text-gray-400">Hours</th>
                    <th className="text-left py-2 text-gray-400">Billable</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredEntries.slice(0, 5).map((entry) => (
                    <tr key={entry.id} className="border-b border-gray-700">
                      <td className="py-2 text-gray-300">
                        {format(new Date(entry.dateStart), 'MMM d, yyyy')}
                      </td>
                      <td className="py-2 text-gray-300">{entry.hours}</td>
                      <td className="py-2">
                        <span className={`px-1.5 py-0.5 rounded text-xs ${
                          entry.billableOption === 'Billable'
                            ? 'bg-green-600/20 text-green-400'
                            : 'bg-gray-600 text-gray-400'
                        }`}>
                          {entry.billableOption || 'N/A'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {/* AI Summary Result */}
      {aiSummary && (
        <div className="mt-6 bg-gray-800 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-white mb-4">AI-Generated Summary</h3>
          <div className="bg-gray-700 rounded-lg p-6">
            <div className="whitespace-pre-wrap text-gray-200 leading-relaxed">
              {aiSummary}
            </div>
          </div>
          <button
            onClick={() => {
              const blob = new Blob([aiSummary], { type: 'text/plain' })
              const link = document.createElement('a')
              link.href = URL.createObjectURL(blob)
              link.download = `ai-summary-${format(new Date(), 'yyyy-MM-dd')}.txt`
              link.click()
            }}
            className="mt-4 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
          >
            Download Summary
          </button>
        </div>
      )}
    </div>
  )
}

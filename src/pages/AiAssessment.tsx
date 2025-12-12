import { useState } from 'react'
import { useSelectedEngineerStore } from '../stores/selectedEngineerStore'
import { useMembersStore } from '../stores/membersStore'
import ReactMarkdown from 'react-markdown'
import { Brain, FileText, CheckCircle, AlertTriangle, Activity } from 'lucide-react'

export default function AiAssessment() {
    const { selectedEngineerId } = useSelectedEngineerStore()
    const { allMembers } = useMembersStore()
    const selectedEngineer = allMembers.find(m => m.id === selectedEngineerId)
    const [loading, setLoading] = useState(false)
    const [analysis, setAnalysis] = useState<any>(null)
    const [error, setError] = useState<string | null>(null)

    const handleAnalyze = async (forceRefresh = false) => {
        if (!selectedEngineer) return
        setLoading(true)
        setError(null)
        if (forceRefresh) setAnalysis(null) // Only clear if forcing
        try {
            const res = await fetch('/api/analyze-engineer', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    memberIdentifier: selectedEngineer.identifier,
                    forceRefresh
                })
            })
            if (!res.ok) {
                const text = await res.text()
                try {
                    // Try to parse json error
                    const jsonErr = JSON.parse(text)
                    throw new Error(jsonErr.error || 'Analysis failed')
                } catch {
                    throw new Error(text || 'Analysis failed')
                }
            }
            const data = await res.json()
            setAnalysis(data)
        } catch (err: any) {
            setError(err.message)
        } finally {
            setLoading(false)
        }
    }

    if (!selectedEngineer) {
        return (
            <div className="flex flex-col items-center justify-center h-[calc(100vh-100px)] text-gray-400">
                <div className="bg-gray-800 p-8 rounded-2xl border border-gray-700 text-center max-w-md">
                    <Brain className="w-16 h-16 mx-auto mb-4 text-purple-500" />
                    <h2 className="text-2xl font-bold mb-2 text-white">AI Engineer Assessment</h2>
                    <p>Please select a specific engineer from the sidebar to begin the deep dive analysis.</p>
                </div>
            </div>
        )
    }

    return (
        <div className="p-6 max-w-7xl mx-auto space-y-8 min-h-screen">
            {/* Header */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-gray-900/50 p-6 rounded-2xl border border-gray-800">
                <div>
                    <h1 className="text-3xl font-bold text-white flex items-center gap-3">
                        <Brain className="text-purple-500" />
                        AI Assessment
                    </h1>
                    <p className="text-gray-400 mt-1">
                        Contextual analysis for <span className="text-blue-400 font-semibold">{selectedEngineer.firstName} {selectedEngineer.lastName}</span>
                    </p>
                </div>
                <div className="flex gap-2">
                    {analysis && (
                        <button
                            onClick={() => handleAnalyze(true)}
                            disabled={loading}
                            className="bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-white px-4 py-4 rounded-xl font-bold transition-all flex items-center gap-2"
                        >
                            <Activity className="w-4 h-4" /> Regenerate
                        </button>
                    )}
                    <button
                        onClick={() => handleAnalyze(false)}
                        disabled={loading}
                        className="bg-purple-600 hover:bg-purple-700 disabled:bg-purple-900/50 disabled:cursor-not-allowed text-white px-8 py-4 rounded-xl font-bold transition-all shadow-lg hover:shadow-purple-500/20 flex items-center gap-2"
                    >
                        {loading ? (
                            <><Activity className="animate-spin" /> Analyzing...</>
                        ) : (
                            <><FileText /> {analysis ? 'Refresh View' : 'Run Deep Analysis'}</>
                        )}
                    </button>
                </div>
            </div>

            {error && (
                <div className="bg-red-900/20 text-red-200 p-6 rounded-xl border border-red-700/50 flex items-start gap-4">
                    <AlertTriangle className="w-6 h-6 shrink-0" />
                    <div>
                        <h3 className="font-bold">Analysis Failed</h3>
                        <p>{error}</p>
                    </div>
                </div>
            )}

            {/* Loading State */}
            {loading && (
                <div className="flex flex-col items-center justify-center py-24 space-y-6">
                    <div className="relative">
                        <div className="animate-spin rounded-full h-24 w-24 border-t-2 border-b-2 border-purple-500"></div>
                        <div className="absolute inset-0 flex items-center justify-center">
                            <Brain className="w-8 h-8 text-purple-500/50 animate-pulse" />
                        </div>
                    </div>
                    <div className="text-center space-y-2">
                        <p className="text-xl font-semibold text-white">Generating Assessment...</p>
                        <p className="text-gray-400">Reviewing tickets, time entires, and project history.</p>
                        <p className="text-xs text-gray-500 font-mono">This may take up to 30 seconds.</p>
                    </div>
                </div>
            )}

            {/* Results */}
            {analysis && !loading && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 animate-fade-in">
                    {/* Sidebar Stats */}
                    <div className="lg:col-span-1 space-y-6">
                        <div className="bg-gray-800 p-6 rounded-xl border border-gray-700 shadow-xl">
                            <h3 className="text-lg font-semibold mb-6 text-gray-200 border-b border-gray-700 pb-2">Analysis Scope</h3>
                            <div className="space-y-4">
                                <div className="flex justify-between items-center">
                                    <span className="text-gray-400">Total Entries</span>
                                    <span className="font-mono text-white bg-gray-700 px-2 py-1 rounded">{analysis.stats.totalEntries}</span>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className="text-gray-400">Total Hours</span>
                                    <span className="font-mono text-white bg-gray-700 px-2 py-1 rounded">{Math.round(analysis.stats.totalHours)}h</span>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className="text-gray-400">Context Sample</span>
                                    <span className="font-mono text-white bg-gray-700 px-2 py-1 rounded">{analysis.stats.recentEntriesCount} recent items</span>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className="text-gray-400">Projects Reviewed</span>
                                    <span className="font-mono text-white bg-gray-700 px-2 py-1 rounded">{analysis.stats.projectsCount}</span>
                                </div>
                            </div>

                            <div className="mt-8 pt-6 border-t border-gray-700">
                                <p className="text-xs text-gray-500">
                                    Last Updated: {new Date(analysis.stats.analyzedAt || analysis.stats.lastUpdated).toLocaleString()}
                                </p>
                                {analysis.stats.cached && (
                                    <span className="inline-block mt-2 text-xs bg-gray-700 text-gray-300 px-2 py-1 rounded">Cached Report</span>
                                )}
                            </div>
                        </div>

                        {/* Status Card */}
                        <div className="bg-gradient-to-br from-green-900/30 to-gray-800 p-6 rounded-xl border border-green-800/30">
                            <div className="flex items-center gap-3 mb-2">
                                <CheckCircle className="text-green-500" />
                                <h3 className="font-bold text-white">Assessment Complete</h3>
                            </div>
                            <p className="text-sm text-gray-400">
                                The AI has processed the available engineering data and generated the report.
                            </p>
                        </div>
                    </div>

                    {/* Markdown Content */}
                    <div className="lg:col-span-2">
                        <div className="bg-gray-800 p-8 rounded-xl border border-gray-700 shadow-xl prose prose-invert max-w-none prose-headings:text-purple-300 prose-a:text-blue-400 prose-strong:text-white">
                            <ReactMarkdown>
                                {analysis.analysis}
                            </ReactMarkdown>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

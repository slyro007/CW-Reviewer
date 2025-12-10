import { useState } from 'react'

export type DataSource = 'serviceDesk' | 'projects'

interface DataSourceFilterProps {
  selected: DataSource[]
  onChange: (sources: DataSource[]) => void
  className?: string
}

export default function DataSourceFilter({ selected, onChange, className = '' }: DataSourceFilterProps) {
  const toggle = (source: DataSource) => {
    if (selected.includes(source)) {
      // Don't allow deselecting if it's the last one
      if (selected.length === 1) return
      onChange(selected.filter(s => s !== source))
    } else {
      onChange([...selected, source])
    }
  }

  return (
    <div className={`flex flex-wrap gap-2 ${className}`}>
      <span className="text-sm text-gray-400 self-center mr-2">Show:</span>
      <button
        onClick={() => toggle('serviceDesk')}
        className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all flex items-center gap-1.5 ${
          selected.includes('serviceDesk')
            ? 'bg-cyan-600 text-white'
            : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
        }`}
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 5.636l-3.536 3.536m0 5.656l3.536 3.536M9.172 9.172L5.636 5.636m3.536 9.192l-3.536 3.536M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-5 0a4 4 0 11-8 0 4 4 0 018 0z" />
        </svg>
        Service Desk
      </button>
      <button
        onClick={() => toggle('projects')}
        className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all flex items-center gap-1.5 ${
          selected.includes('projects')
            ? 'bg-purple-600 text-white'
            : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
        }`}
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
        </svg>
        Projects
      </button>
    </div>
  )
}

// Hook for managing data source state
export function useDataSources(initial: DataSource[] = ['serviceDesk', 'projects']) {
  const [dataSources, setDataSources] = useState<DataSource[]>(initial)
  
  return {
    dataSources,
    setDataSources,
    includesServiceDesk: dataSources.includes('serviceDesk'),
    includesProjects: dataSources.includes('projects'),
    label: dataSources.length === 2 
      ? 'Service Desk & Projects' 
      : dataSources.includes('serviceDesk') 
        ? 'Service Desk' 
        : 'Projects',
  }
}


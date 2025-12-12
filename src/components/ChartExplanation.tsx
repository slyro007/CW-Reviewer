import { Info } from 'lucide-react'
import { useState } from 'react'

interface ChartExplanationProps {
    title: string
    description: string
    axisDetails?: { label: string; description: string }[]
}

export default function ChartExplanation({ title, description, axisDetails }: ChartExplanationProps) {
    const [isOpen, setIsOpen] = useState(true)

    if (!isOpen) return (
        <button
            onClick={() => setIsOpen(true)}
            className="text-xs text-gray-500 hover:text-blue-400 flex items-center gap-1 mb-2 transition-colors"
        >
            <Info className="w-3 h-3" /> Show Explanation
        </button>
    )

    return (
        <div className="bg-gray-800/50 border border-gray-700/50 rounded-lg p-3 mb-4 text-sm text-gray-300">
            <div className="flex justify-between items-start mb-1">
                <h4 className="font-semibold text-white text-xs uppercase tracking-wider flex items-center gap-2">
                    <Info className="w-3 h-3 text-blue-400" />
                    {title}
                </h4>
                <button
                    onClick={() => setIsOpen(false)}
                    className="text-gray-500 hover:text-white transition-colors"
                    aria-label="Close explanation"
                >
                    ×
                </button>
            </div>
            <p className="mb-2 text-gray-400 text-xs leading-relaxed">{description}</p>
            {axisDetails && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 mt-2 border-t border-gray-700/50 pt-2">
                    {axisDetails.map((axis, i) => (
                        <div key={i} className="flex items-baseline gap-2 text-xs">
                            <span className="font-medium text-blue-300/80">{axis.label}:</span>
                            <span className="text-gray-500">{axis.description}</span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}

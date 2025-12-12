import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import TeamFilter from './TeamFilter'
import TimePeriodSelector from './TimePeriodSelector'

export default function Sidebar() {
  // Start open on desktop, closed on mobile
  const [isOpen, setIsOpen] = useState(() => {
    if (typeof window !== 'undefined') {
      return window.innerWidth >= 1024 // lg breakpoint
    }
    return true
  })
  const location = useLocation()

  const toggleSidebar = () => setIsOpen(!isOpen)

  const navItems = [
    { path: '/', label: 'Overview' },
    { path: '/time-tracking', label: 'Time Tracking' },
    { path: '/projects', label: 'Projects' },
    { path: '/tickets', label: 'Service Tickets' },
    { path: '/notes', label: 'Notes' },
    { path: '/compare', label: 'Compare' },
    { path: '/trends', label: 'Trends' },
    { path: '/highlights', label: 'Highlights' },
    { path: '/performance-review', label: 'Performance Review' },
    { path: '/wrapped', label: 'CW Wrapped' },
    { path: '/export', label: 'Export' },
  ]

  return (
    <>
      {/* Burger Menu Button - Fixed top-left */}
      <button
        onClick={toggleSidebar}
        className="fixed top-4 left-4 z-50 p-2 bg-gray-900 border border-gray-700 rounded-md text-white hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 lg:hidden"
        aria-label="Toggle sidebar"
      >
        <svg
          className="w-6 h-6"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          {isOpen ? (
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          ) : (
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 6h16M4 12h16M4 18h16"
            />
          )}
        </svg>
      </button>

      {/* Overlay for mobile */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-40 lg:hidden"
          onClick={toggleSidebar}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          fixed top-0 left-0 h-full bg-gray-900 border-r border-gray-700 z-40
          transform transition-transform duration-300 ease-in-out
          ${isOpen ? 'translate-x-0' : '-translate-x-full'}
          lg:translate-x-0
          w-80
        `}
      >
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-gray-700">
            <h1 className="text-xl font-bold text-gray-100">Navigation</h1>
            <button
              onClick={toggleSidebar}
              className="lg:hidden p-1 text-gray-400 hover:text-white focus:outline-none"
              aria-label="Close sidebar"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>

          {/* Team & Engineer Selector */}
          <div className="p-4 border-b border-gray-700">
            <TeamFilter />
          </div>

          {/* Time Period Selector */}
          <div className="p-4 border-b border-gray-700">
            <TimePeriodSelector />
          </div>

          {/* Navigation */}
          <nav className="flex-1 overflow-y-auto p-4">
            <ul className="space-y-2">
              {navItems.map((item) => {
                const isActive = location.pathname === item.path
                return (
                  <li key={item.path}>
                    <Link
                      to={item.path}
                      onClick={() => {
                        // Close sidebar on mobile when navigating
                        if (window.innerWidth < 1024) {
                          setIsOpen(false)
                        }
                      }}
                      className={`
                        flex items-center px-4 py-3 rounded-lg transition-colors
                        ${isActive
                          ? 'bg-blue-600 text-white'
                          : 'text-gray-300 hover:bg-gray-800 hover:text-white'
                        }
                      `}
                    >
                      <span className="font-medium">{item.label}</span>
                    </Link>
                  </li>
                )
              })}
            </ul>
          </nav>
        </div>
      </aside>
    </>
  )
}


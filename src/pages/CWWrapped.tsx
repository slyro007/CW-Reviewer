export default function CWWrapped() {
  return (
    <div className="px-4 py-6 sm:px-0">
      <div className="mb-6">
        <h2 className="text-3xl font-bold text-white mb-2">CW Wrapped</h2>
        <p className="text-gray-400">Your annual ConnectWise summary</p>
      </div>

      <div className="bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900 rounded-lg p-8 mb-6">
        <div className="text-center">
          <h3 className="text-4xl font-bold text-white mb-4">
            Your 2024 CW Wrapped
          </h3>
          <p className="text-xl text-gray-300 mb-8">
            A year in review, powered by AI
          </p>
          <button className="bg-white text-purple-900 px-8 py-3 rounded-full font-semibold hover:bg-gray-100 transition">
            Generate Your Wrapped
          </button>
        </div>
      </div>

      {/* Placeholder sections for wrapped content */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        <div className="bg-gray-800 rounded-lg p-6">
          <h3 className="text-xl font-semibold mb-4">Total Hours</h3>
          <p className="text-4xl font-bold text-blue-400">---</p>
          <p className="text-gray-400 mt-2">Hours logged this year</p>
        </div>
        <div className="bg-gray-800 rounded-lg p-6">
          <h3 className="text-xl font-semibold mb-4">Tickets Resolved</h3>
          <p className="text-4xl font-bold text-green-400">---</p>
          <p className="text-gray-400 mt-2">Tickets you closed</p>
        </div>
        <div className="bg-gray-800 rounded-lg p-6">
          <h3 className="text-xl font-semibold mb-4">Top Project</h3>
          <p className="text-2xl font-bold text-purple-400">---</p>
          <p className="text-gray-400 mt-2">Most time spent on</p>
        </div>
        <div className="bg-gray-800 rounded-lg p-6">
          <h3 className="text-xl font-semibold mb-4">Productivity Score</h3>
          <p className="text-4xl font-bold text-yellow-400">---</p>
          <p className="text-gray-400 mt-2">Your efficiency rating</p>
        </div>
      </div>

      <div className="bg-gray-800 rounded-lg p-6">
        <h3 className="text-xl font-semibold mb-4">Year in Review</h3>
        <p className="text-gray-400">
          Your personalized year-end summary will appear here. Click "Generate Your Wrapped" to create it!
        </p>
      </div>
    </div>
  )
}


import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Dashboard from './pages/Dashboard'
import CWWrapped from './pages/CWWrapped'
import TimeTracking from './pages/TimeTracking'
import Projects from './pages/Projects'
import ServiceTickets from './pages/ServiceTickets'
import Notes from './pages/Notes'
import Compare from './pages/Compare'
import Trends from './pages/Trends'
import Highlights from './pages/Highlights'
import PerformanceReview from './pages/PerformanceReview'
import Export from './pages/Export'
import Layout from './components/Layout'

function App() {
  return (
    <BrowserRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/time-tracking" element={<TimeTracking />} />
          <Route path="/projects" element={<Projects />} />
          <Route path="/tickets" element={<ServiceTickets />} />
          <Route path="/notes" element={<Notes />} />
          <Route path="/compare" element={<Compare />} />
          <Route path="/trends" element={<Trends />} />
          <Route path="/highlights" element={<Highlights />} />
          <Route path="/performance-review" element={<PerformanceReview />} />
          <Route path="/export" element={<Export />} />
          <Route path="/wrapped" element={<CWWrapped />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  )
}

export default App


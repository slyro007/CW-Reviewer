import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Dashboard from './pages/Dashboard'
import CWWrapped from './pages/CWWrapped'
import Layout from './components/Layout'

function App() {
  return (
    <BrowserRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/wrapped" element={<CWWrapped />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  )
}

export default App


import { HashRouter, Navigate, Route, Routes, useParams } from 'react-router-dom'
import { Home } from './pages/Home'
import { StudentJoin } from './pages/StudentJoin'
import { StudentTest } from './pages/StudentTest'
import { DashboardTestsPanel, TeacherDashboard } from './pages/TeacherDashboard'
import { TeacherGate } from './pages/TeacherGate'
import { TeacherSubmissions } from './pages/TeacherSubmissions'
import { TeacherTestEditor } from './pages/TeacherTestEditor'

function EmbeddedEditor() {
  const { testId } = useParams()
  return <TeacherTestEditor embedded key={testId ?? 'new'} />
}

function LegacyTestRedirect() {
  const { testId } = useParams()
  if (!testId || testId === 'new') {
    return <Navigate to="/teacher/dashboard/new" replace />
  }
  return <Navigate to={`/teacher/dashboard/tests/${testId}`} replace />
}

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/teacher" element={<TeacherGate />} />
        <Route path="/teacher/dashboard" element={<TeacherDashboard />}>
          <Route index element={<DashboardTestsPanel />} />
          <Route path="new" element={<TeacherTestEditor embedded key="new" />} />
          <Route path="tests/:testId" element={<EmbeddedEditor />} />
        </Route>
        <Route path="/teacher/tests/:testId" element={<LegacyTestRedirect />} />
        <Route path="/teacher/submissions" element={<TeacherSubmissions />} />
        <Route path="/join" element={<StudentJoin />} />
        <Route path="/join/:code" element={<StudentJoin />} />
        <Route path="/sit/:code" element={<StudentTest />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </HashRouter>
  )
}

import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { Home } from './pages/Home'
import { StudentJoin } from './pages/StudentJoin'
import { StudentTest } from './pages/StudentTest'
import { TeacherDashboard } from './pages/TeacherDashboard'
import { TeacherGate } from './pages/TeacherGate'
import { TeacherSubmissions } from './pages/TeacherSubmissions'
import { TeacherTestEditor } from './pages/TeacherTestEditor'

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/teacher" element={<TeacherGate />} />
        <Route path="/teacher/dashboard" element={<TeacherDashboard />} />
        <Route path="/teacher/tests/:testId" element={<TeacherTestEditor />} />
        <Route path="/teacher/submissions" element={<TeacherSubmissions />} />
        <Route path="/join" element={<StudentJoin />} />
        <Route path="/join/:code" element={<StudentJoin />} />
        <Route path="/sit/:code" element={<StudentTest />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </HashRouter>
  )
}

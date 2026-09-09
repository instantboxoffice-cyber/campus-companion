import { BrowserRouter, Routes, Route } from 'react-router-dom'
import AuthPage from './features/auth/AuthPage'
import ChatListPage from './features/chat/ChatListPage'
import ChatPage from './features/chat/ChatPage'
import RemindersPage from './features/reminders/RemindersPage'
import ProtectedRoute from './routes/ProtectedRoute'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/auth" element={<AuthPage />} />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <ChatListPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/chat"
          element={
            <ProtectedRoute>
              <ChatPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/reminders"
          element={
            <ProtectedRoute>
              <RemindersPage />
            </ProtectedRoute>
          }
        />
      </Routes>
    </BrowserRouter>
  )
}

export default App

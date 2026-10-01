import { BrowserRouter, Routes, Route } from 'react-router-dom'
import AuthPage from './features/auth/AuthPage'
import ChatListPage from './features/chat/ChatListPage'
import ChatPage from './features/chat/ChatPage'
import DirectChatPage from './features/chat/DirectChatPage'
import RemindersPage from './features/reminders/RemindersPage'
import UpdatesPage from './features/updates/UpdatesPage'
import CallsPage from './features/calls/CallsPage'
import FriendsPage from './features/friends/FriendsPage'
import UsernameGate from './features/friends/UsernameGate'
import ProtectedRoute from './routes/ProtectedRoute'
import InstallPrompt from './components/InstallPrompt'
import { sounds } from './lib/sounds'

   sounds.attachGlobalClickSound()

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
        <Route
          path="/updates"
          element={
            <ProtectedRoute>
              <UpdatesPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/calls"
          element={
            <ProtectedRoute>
              <CallsPage />
            </ProtectedRoute>
          }
        />
        <Route path="/friends" element={<ProtectedRoute><FriendsPage /></ProtectedRoute>} />
        <Route
          path="/dm/:friendId"
          element={
            <ProtectedRoute>
              <DirectChatPage />
            </ProtectedRoute>
          }
        />
      </Routes>
      <InstallPrompt />
      <UsernameGate />
    </BrowserRouter>
  )
}

export default App
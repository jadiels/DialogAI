import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import './index.css'
import { loadSettings } from './lib/storage'
import { applyTheme } from './lib/theme'
import App from './App'

// Apply the saved theme before first paint to avoid a flash.
applyTheme(loadSettings().ui.theme ?? 'auto')
import ChatPage from './pages/ChatPage'
import AgentsPage from './pages/AgentsPage'
import ImagesPage from './pages/ImagesPage'
import SettingsPage from './pages/SettingsPage'
import SearchPage from './pages/SearchPage'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route element={<App />}>
          <Route path="/" element={<ChatPage />} />
          <Route path="/chat/:chatId" element={<ChatPage />} />
          <Route path="/agents" element={<AgentsPage />} />
          <Route path="/images" element={<ImagesPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/search" element={<SearchPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </StrictMode>,
)

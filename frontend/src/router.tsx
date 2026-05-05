import { createBrowserRouter, Navigate } from 'react-router-dom'
import { BrowsePage } from './pages/BrowsePage'
import { DetailPage } from './pages/DetailPage'
import { ComparePage } from './pages/ComparePage'
import { RootLayout } from './components/RootLayout'

export const router = createBrowserRouter([
  {
    element: <RootLayout />,
    children: [
      { path: '/', element: <Navigate to="/browse" replace /> },
      { path: '/browse', element: <BrowsePage /> },
      { path: '/detail/:strategyId', element: <DetailPage /> },
      { path: '/compare', element: <ComparePage /> },
    ],
  },
])

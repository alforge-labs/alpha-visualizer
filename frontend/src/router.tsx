import { createBrowserRouter, Navigate } from 'react-router-dom'
import { BrowsePage } from './pages/BrowsePage'
import { DetailPage } from './pages/DetailPage'
import { ComparePage } from './pages/ComparePage'

export const router = createBrowserRouter([
  { path: '/', element: <Navigate to="/browse" replace /> },
  { path: '/browse', element: <BrowsePage /> },
  { path: '/detail/:strategyId', element: <DetailPage /> },
  { path: '/compare', element: <ComparePage /> },
])

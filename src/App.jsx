import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Navigate, Route, Routes } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import ProtectedRoute from '@/components/ProtectedRoute';
import ScrollToTop from './components/ScrollToTop';
// Add page imports here
import Home from './pages/Home';
import Login from './pages/Login';
import Register from './pages/Register';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import AdminInbox from './pages/AdminInbox';
import Agents from './pages/Agents';
import TaskBoard from './pages/TaskBoard';
import AgentCreator from './pages/AgentCreator';
import AgentDetail from './pages/AgentDetail';
import RecruitmentHome from './pages/recruitment/RecruitmentHome';
import RecruitmentNew from './pages/recruitment/RecruitmentNew';
import RecruitmentCampaign from './pages/recruitment/RecruitmentCampaign';
import CandidatePortal from './pages/recruitment/CandidatePortal';
import ApplyPage from './pages/recruitment/ApplyPage';
import SecurityCheck from './pages/SecurityCheck';
import BillingSuccess from './pages/BillingSuccess';
import Privacy from './pages/Privacy';
import AdminUsage from './pages/AdminUsage';
import Terms from './pages/Terms';
import AdminShell from './components/admin/AdminShell';
import AdminHome from './pages/admin/AdminHome';
import AdminAgentsPage from './pages/admin/AdminAgentsPage';
import AdminRunsPage from './pages/admin/AdminRunsPage';
import AdminUsagePage from './pages/admin/AdminUsagePage';
import AdminCustomersPage from './pages/admin/AdminCustomersPage';
import AdminBillingPage from './pages/admin/AdminBillingPage';
import AdminReportsPage from './pages/admin/AdminReportsPage';
import AdminActivityPage from './pages/admin/AdminActivityPage';

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError } = useAuth();

  // Show loading spinner while checking app public settings or auth
  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
      </div>
    );
  }

  // The public site renders for every visitor. Sign-in is enforced per route by
  // ProtectedRoute, so nothing at this level may send a visitor to login. The
  // one exception is an account that is signed in but not registered.
  if (authError?.type === 'user_not_registered') {
    return <UserNotRegisteredError />;
  }

  // Render the main app
  return (
    <Routes>
      {/* Add your page Route elements here */}
      <Route path="/" element={<Home />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/privacy" element={<Privacy />} />
      <Route path="/terms" element={<Terms />} />
      <Route path="/r/:token" element={<CandidatePortal />} />
      <Route path="/apply/:slug" element={<ApplyPage />} />
      <Route
        element={<ProtectedRoute unauthenticatedElement={<Navigate to="/login" replace />} />}
      >
        <Route path="/inbox" element={<AdminInbox />} />
        <Route path="/agents" element={<Agents />} />
        <Route path="/tasks" element={<TaskBoard />} />
        <Route path="/agents/new" element={<AgentCreator />} />
        <Route path="/agents/:id" element={<AgentDetail />} />
        <Route path="/recruitment" element={<RecruitmentHome />} />
        <Route path="/recruitment/new" element={<RecruitmentNew />} />
        <Route path="/recruitment/:id" element={<RecruitmentCampaign />} />
        <Route path="/usage" element={<AdminUsage />} />
        <Route path="/security-check" element={<SecurityCheck />} />
        <Route path="/billing/success" element={<BillingSuccess />} />
        <Route element={<AdminShell />}>
          <Route path="/admin" element={<AdminHome />} />
          <Route path="/admin/agents" element={<AdminAgentsPage />} />
          <Route path="/admin/runs" element={<AdminRunsPage />} />
          <Route path="/admin/usage" element={<AdminUsagePage />} />
          <Route path="/admin/customers" element={<AdminCustomersPage />} />
          <Route path="/admin/billing" element={<AdminBillingPage />} />
          <Route path="/admin/reports" element={<AdminReportsPage />} />
          <Route path="/admin/activity" element={<AdminActivityPage />} />
        </Route>
      </Route>
      <Route path="*" element={<PageNotFound />} />
    </Routes>
  );
};


function App() {

  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <ScrollToTop />
          <AuthenticatedApp />
        </Router>
        <Toaster />
      </QueryClientProvider>
    </AuthProvider>
  )
}

export default App
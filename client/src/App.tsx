import { Switch, Route, useRoute } from "wouter";
import { lazy, Suspense } from "react";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import Layout from "@/components/Layout";
import ErrorBoundary from "@/components/ErrorBoundary";
import StabilityProvider from "@/components/StabilityProvider";
import { useAuth } from "@/hooks/useAuth";
import Landing from "@/pages/landing";
import HomePage from "@/pages/home";
import Dashboard from "@/pages/dashboard";
import Review from "@/pages/review";
import CaseManagement from "@/pages/case-management";
import HyperlinksPage from "@/pages/hyperlinks";
import NotFound from "@/pages/not-found";
import PrivacyPolicy from "@/pages/privacy-policy";
import TermsOfService from "@/pages/terms-of-service";
import Help from "@/pages/help";
import StatusDashboard from "@/components/StatusDashboard";
import AuthCallback from "@/pages/AuthCallback";
import PdfViewer from "@/pages/PdfViewer";

const HyperlinkReview = lazy(() => import("@/pages/cases/[id]/review"));
const ReanalyzePage = lazy(() => import("@/pages/cases/[id]/reanalyze"));
const GPT5TestPage = lazy(() => import("@/pages/cases/[id]/gpt5-test"));
const OCRPage = lazy(() => import("@/pages/cases/[id]/ocr"));
const IndexIdentificationPage = lazy(() => import("@/pages/cases/[id]/index-identification"));
const VisualReviewPage = lazy(() => import("@/pages/cases/[id]/visual-review"));
const InstantProcessor = lazy(() => import("@/pages/instant-processor"));
const CaseWorkspace = lazy(() => import("@/components/CaseWorkspace"));
const IndexViewer = lazy(() => import("@/pages/IndexViewer"));
const DocumentProcessing = lazy(() => import("@/pages/document-processing"));
const RedirectToLatestCaseOCR = lazy(() => import("@/components/RedirectToLatestCaseOCR").then(m => ({ default: m.RedirectToLatestCaseOCR })));

function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
    </div>
  );
}

// Component wrapper that conditionally applies Layout
function LayoutWrapper({ children, shouldUseLayout }: { children: React.ReactNode; shouldUseLayout: boolean }) {
  if (shouldUseLayout) {
    return <Layout>{children}</Layout>;
  }
  return <>{children}</>;
}

function Router() {
  const { isAuthenticated, isLoading } = useAuth();
  
  // DUAL DEPLOYMENT: Check domain type with robust detection
  const getDomainType = () => {
    const hostname = window.location.hostname;
    
    // Marketing domain: hyperlinklaw.com (including www and subdomains like www.hyperlinklaw.com)
    if (hostname === 'hyperlinklaw.com' || hostname === 'www.hyperlinklaw.com' || 
        (hostname.endsWith('.hyperlinklaw.com') && !hostname.startsWith('app.'))) {
      return 'marketing';
    }
    
    // App domain: app.hyperlinklaw.com or app subdomains (app.hyperlinklaw.com, app.localhost, etc.)
    if (hostname === 'app.hyperlinklaw.com' || hostname.startsWith('app.') || 
        hostname === 'localhost' || hostname.startsWith('localhost:')) {
      return 'app';
    }
    
    // Development or other domains (Replit URLs, etc.)
    return 'development';
  };
  
  const domainType = getDomainType();
  
  // If on marketing domain (hyperlinklaw.com), only show marketing content
  if (domainType === 'marketing') {
    return (
      <Suspense fallback={<LoadingSpinner />}>
        <Switch>
          <Route path="/" component={Landing} />
          <Route path="/privacy-policy" component={PrivacyPolicy} />
          <Route path="/terms-of-service" component={TermsOfService} />
          <Route component={() => {
            // Redirect any unknown routes to app subdomain, preserving query/hash
            const currentPath = window.location.pathname + window.location.search + window.location.hash;
            window.location.href = `https://app.hyperlinklaw.com${currentPath}`;
            return <LoadingSpinner />;
          }} />
        </Switch>
      </Suspense>
    );
  }

  // Determine if we should use Layout (authenticated users on app/development domains)
  const shouldUseLayout = isAuthenticated && (domainType === 'app' || domainType === 'development');
  
  // For app subdomain (app.hyperlinklaw.com) or development, show the full application
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <LayoutWrapper shouldUseLayout={shouldUseLayout}>
        <Switch>
          {/* Authentication callback route */}
          <Route path="/auth/callback" component={AuthCallback} />
          
          {/* Root route logic */}
          <Route path="/" component={() => {
            // Show Landing for unauthenticated or loading users (all domains)
            if (isLoading || !isAuthenticated) {
              return <Landing />;
            }
            // Temporary simple test for authenticated users
            return (
              <div className="min-h-screen p-8 bg-background text-foreground">
                <h1 className="text-3xl font-bold mb-4">🎉 Authentication Working!</h1>
                <p className="text-lg mb-4">You are successfully authenticated and on the root route.</p>
                <button 
                  onClick={() => window.location.href = '/case-management'}
                  className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                >
                  Go to Case Management
                </button>
              </div>
            );
          }} />
          
          {/* Protected app routes - available when authenticated */}
          {isAuthenticated && (
            <>
              <Route path="/instant" component={InstantProcessor} />
              <Route path="/cases/:caseId/workspace" component={() => {
                const [match] = useRoute('/cases/:caseId/workspace');
                const caseId = match ? (match as any).params?.caseId : '';
                return <CaseWorkspace caseId={caseId} />;
              }} />
              <Route path="/cases/:caseId" component={Dashboard} />
              <Route path="/ocr" component={RedirectToLatestCaseOCR} />
              <Route path="/cases/:caseId/ocr" component={OCRPage} />
              <Route path="/cases/:caseId/index-identification" component={IndexIdentificationPage} />
              <Route path="/cases/:caseId/documents/:documentId/visual-review" component={VisualReviewPage} />
              <Route path="/documents/:documentId/processing" component={DocumentProcessing} />
              <Route path="/pdf-viewer/:caseId/:documentId" component={PdfViewer} />
              <Route path="/cases/:caseId/ai-hyperlinking" component={HyperlinksPage} />
              <Route path="/cases/:caseId/review" component={HyperlinkReview} />
              <Route path="/cases/:caseId/reanalyze" component={ReanalyzePage} />
              <Route path="/cases/:caseId/gpt5-test" component={GPT5TestPage} />
              <Route path="/cases/:caseId/review/:docId" component={Review} />
              <Route path="/case-management" component={CaseManagement} />
              <Route path="/links" component={HyperlinksPage} />
              <Route path="/hyperlinks" component={HyperlinksPage} />
              <Route path="/review" component={Review} />
              <Route path="/court-ready" component={Dashboard} />
              <Route path="/index-viewer/:filename" component={IndexViewer} />
              <Route path="/status" component={StatusDashboard} />
              <Route path="/help" component={Help} />
            </>
          )}
          
          {/* Public routes accessible without authentication */}
          <Route path="/privacy-policy" component={PrivacyPolicy} />
          <Route path="/terms-of-service" component={TermsOfService} />
          
          {/* Fallback - Landing for unauthenticated, Case Management for authenticated */}
          <Route component={() => !isAuthenticated ? <Landing /> : <CaseManagement />} />
        </Switch>
      </LayoutWrapper>
    </Suspense>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <StabilityProvider>
        <QueryClientProvider client={queryClient}>
          <div className="dark">
            <Toaster />
            <Router />
          </div>
        </QueryClientProvider>
      </StabilityProvider>
    </ErrorBoundary>
  );
}

export default App;

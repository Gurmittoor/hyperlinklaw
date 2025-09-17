import { useState, useEffect } from "react";
import { useRoute, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import type { Case } from "@shared/schema";

interface WorkflowStep {
  id: number;
  title: string;
  icon: string;
  status: "done" | "in_progress" | "blocked" | "error";
  description?: string;
  progress?: number;
}

interface WorkflowStepSidebarProps {
  currentStep: number;
  onStepChange: (step: number) => void;
  progress: any;
  caseData?: Case;
}

function WorkflowStepSidebar({ 
  currentStep, 
  onStepChange, 
  progress, 
  caseData 
}: WorkflowStepSidebarProps) {
  const [autoAdvance, setAutoAdvance] = useState(caseData?.autoAdvance ?? true);
  const [location, setLocation] = useLocation();
  const [match] = useRoute('/cases/:caseId/*');
  
  // Extract caseId from URL more reliably - handles nested paths like /cases/ID/ocr
  const getCaseIdFromLocation = () => {
    const caseMatch = location.match(/\/cases\/([a-f0-9-]+)/);
    return caseMatch ? caseMatch[1] : null;
  };
  
  // Get cases to determine fallback case ID
  const { data: cases = [] } = useQuery({
    queryKey: ['/api/cases'],
    retry: false,
  });

  // Try multiple methods to get the case ID
  const urlCaseId = (match ? (match as any).params?.caseId : null) || getCaseIdFromLocation();
  const fallbackCaseId = Array.isArray(cases) && cases.length > 0 ? cases[0]?.id : null;
  const caseId = urlCaseId || fallbackCaseId;

  // Fetch documents for the current case to determine workflow progress
  const { data: documents = [] } = useQuery({
    queryKey: [`/api/cases/${caseId}/documents`],
    enabled: !!caseId,
    retry: false,
  });

  // Detect current step from URL and workflow progress
  const getCurrentStepFromUrl = () => {
    if (!caseId) {
      // If no case ID, check for case management page
      if (location.includes('/case-management')) return 1;
      return 1;
    }
    
    // Map URLs to workflow steps - ORDER MATTERS (most specific first)
    if (location.includes('/case-management')) return 1; // Create Case
    if (location.includes('/instant')) return 3; // Court Submit
    if (location.includes('/court-ready')) return 3; // Court Submit
    if (location.includes('/index-identification')) return 4; // Index Identification
    if (location.includes('/ai-hyperlinking')) return 5; // AI Hyperlinking 
    if (location.includes('/hyperlinks')) return 5; // AI Hyperlinking (legacy)
    if (location.includes('/review')) return 6; // Lawyer Review
    if (location === `/cases/${caseId}`) return 2; // Upload & OCR
    
    // Check document status to infer current step when URL doesn't specify
    if (Array.isArray(documents) && documents.length > 0) {
      // *** CRITICAL: Check for batch1Ready to enable Index Identification immediately ***
      const hasBatch1Ready = documents.some((doc: any) => doc.batch1Ready === true);
      const hasCompletedOCR = documents.some((doc: any) => 
        doc.ocrStatus === 'completed' || doc.status === 'completed'
      );
      
      if (hasBatch1Ready || hasCompletedOCR) {
        return 3; // Go to Step 3: Index Identification after Batch 1 or full OCR completion
      } else {
        return 2; // Step 2: Documents uploaded but OCR not complete
      }
    } else {
      return 2; // Step 2: Upload Documents (no documents yet)
    }
    
    return 1;
  };

  // Update currentStep when URL changes or documents change
  const detectedStep = getCurrentStepFromUrl();

  // Notify parent about step changes
  useEffect(() => {
    if (detectedStep !== currentStep && autoAdvance) {
      onStepChange(detectedStep);
    }
  }, [detectedStep, currentStep, onStepChange, autoAdvance, documents]);

  // Remember the last opened case
  useEffect(() => {
    if (caseId) {
      localStorage.setItem("lastOpenedCaseId", caseId);
    }
  }, [caseId]);

  // Generate correct routes for each workflow step
  const getStepRoute = (stepId: number) => {
    // Get current case ID or stored case ID for case-specific routes
    const currentCaseId = caseId || localStorage.getItem("lastOpenedCaseId");
    
    switch (stepId) {
      case 1: return "/case-management"; // Step 1: Create Case
      case 2: return currentCaseId ? `/cases/${currentCaseId}` : "/case-management"; // Step 2: Upload & OCR
      case 3: return "/instant"; // Step 3: Court Submit (Instant Processor)
      case 4: return currentCaseId ? `/cases/${currentCaseId}/index-identification` : "/index-identification"; // Step 4: Index Identification
      case 5: return currentCaseId ? `/cases/${currentCaseId}/ai-hyperlinking` : "/hyperlinks"; // Step 5: AI Hyperlinking
      case 6: return currentCaseId ? `/cases/${currentCaseId}/review` : "/review"; // Step 6: Lawyer Review
      default: return "/case-management";
    }
  };

  const getStepStatus = (stepId: number): WorkflowStep["status"] => {
    // Use document-based status logic when auto-advance is enabled
    if (autoAdvance && caseId) {
      const hasDocuments = Array.isArray(documents) && documents.length > 0;
      const hasBatch1Ready = hasDocuments && documents.some((doc: any) => doc.batch1Ready === true);
      const hasCompletedOCR = hasDocuments && documents.some((doc: any) => 
        doc.ocrStatus === 'completed' || doc.status === 'completed'
      );
      
      switch (stepId) {
        case 1: return "done"; // Case created
        case 2: return hasDocuments ? (hasBatch1Ready || hasCompletedOCR ? "done" : "in_progress") : (stepId === detectedStep ? "in_progress" : "blocked");
        case 3: return stepId === detectedStep ? "in_progress" : "blocked"; // Court Submit
        case 4: return (hasBatch1Ready || hasCompletedOCR) ? (stepId === detectedStep ? "in_progress" : "done") : "blocked"; // Index Identification
        case 5: return stepId === detectedStep ? "in_progress" : "blocked"; // AI Hyperlinking
        case 6: return stepId === detectedStep ? "in_progress" : "blocked"; // Lawyer Review
        default: return "blocked";
      }
    }
    
    // Fallback to progress-based status
    if (!progress?.steps) {
      return stepId === detectedStep ? "in_progress" : "blocked";
    }
    
    const step = progress.steps.find((s: any) => s.id === stepId);
    return step?.status || "blocked";
  };

  const getStepProgress = (stepId: number): number => {
    if (!progress?.steps) return 0;
    
    const step = progress.steps.find((s: any) => s.id === stepId);
    if (step?.total && step?.done !== undefined) {
      return Math.round((step.done / step.total) * 100);
    }
    return 0;
  };

  const getStepDescription = (stepId: number): string => {
    if (!progress?.steps) return "";
    
    const step = progress.steps.find((s: any) => s.id === stepId);
    if (stepId === 3 && step?.status === "in_progress") {
      const progressPercent = getStepProgress(stepId);
      const total = step?.total || 0;
      const done = step?.done || 0;
      return `Processing page ${done} of ${total} (${progressPercent}%)`;
    }
    
    if (step?.status === "done" && step?.completedAt) {
      return `Completed ${new Date(step.completedAt).toLocaleTimeString()}`;
    }
    
    return "";
  };

  const steps: Omit<WorkflowStep, "status" | "progress" | "description">[] = [
    { id: 1, title: "Create Case", icon: "fas fa-briefcase" },
    { id: 2, title: "Document Processing Hub", icon: "fas fa-cogs" },
    { id: 3, title: "Court Submit", icon: "fas fa-download" },
  ];

  const getStepIcon = (step: WorkflowStep, isActive: boolean) => {
    switch (step.status) {
      case "done":
        return "fas fa-check-circle text-green-500";
      case "in_progress":
        return isActive ? "fas fa-spinner fa-spin text-white" : "fas fa-spinner fa-spin text-blue-500";
      case "error":
        return "fas fa-exclamation-circle text-red-500";
      case "blocked":
      default:
        return "fas fa-clock text-gray-400";
    }
  };

  const getStepStyles = (step: WorkflowStep, isActive: boolean) => {
    const baseStyles = "flex items-center gap-3 px-4 py-3 rounded-lg transition-all cursor-pointer border-2";
    
    if (step.status === "blocked") {
      return `${baseStyles} text-gray-400 cursor-not-allowed opacity-60 border-transparent`;
    }
    
    if (isActive) {
      return `${baseStyles} bg-primary text-primary-foreground shadow-lg border-primary ring-2 ring-primary/20 font-semibold`;
    }
    
    if (step.status === "done") {
      return `${baseStyles} text-green-600 hover:bg-green-50 dark:hover:bg-green-950 border-green-200 dark:border-green-800 bg-green-50/50 dark:bg-green-950/50`;
    }
    
    if (step.status === "in_progress") {
      return `${baseStyles} text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950 border-blue-200 dark:border-blue-800`;
    }
    
    if (step.status === "error") {
      return `${baseStyles} text-red-600 hover:bg-red-50 dark:hover:bg-red-950 border-red-200 dark:border-red-800`;
    }
    
    return `${baseStyles} text-muted-foreground hover:bg-secondary border-transparent`;
  };

  const handleStepClick = (stepId: number, status: WorkflowStep["status"]) => {
    // Allow navigation to any step - users should be able to navigate freely through workflow
    // Get the most reliable case ID for navigation
    const currentCaseId = caseId || getCaseIdFromLocation();
    console.log(`Navigation: Step ${stepId}, Case ID: ${currentCaseId}, Current Path: ${location}`);
    
    // Map each tab to its correct route based on existing App.tsx routes
    switch (stepId) {
      case 1:
        // Create Case - go to case management to create new or manage existing
        console.log(`Navigating to Case Management`);
        setLocation('/case-management');
        break;
      
      case 2:
        // Upload Documents - go to main case page (Dashboard shows documents)
        console.log(`Navigating to Upload Documents for case: ${currentCaseId}`);
        if (currentCaseId) {
          setLocation(`/cases/${currentCaseId}`);
        } else {
          setLocation('/case-management');
        }
        break;
      
      case 3:
        // Court Submit - use the instant processor for final PDF generation
        console.log(`Navigating to Court Submit (Instant Processor)`);
        setLocation('/instant');
        break;
      
      case 4:
        // Index Identification
        console.log(`Navigating to Index Identification for case: ${currentCaseId}`);
        setLocation(currentCaseId ? `/cases/${currentCaseId}/index-identification` : '/index-identification');
        break;
      
      case 5:
        // AI Hyperlinking - case-specific AI hyperlinking page
        console.log(`Navigating to AI Hyperlinking for case: ${currentCaseId}`);
        if (currentCaseId) {
          setLocation(`/cases/${currentCaseId}/ai-hyperlinking`);
        } else {
          setLocation('/hyperlinks');
        }
        break;
      
      case 6:
        // Lawyer Review - case-specific review page
        console.log(`Navigating to Lawyer Review for case: ${currentCaseId}`);
        if (currentCaseId) {
          setLocation(`/cases/${currentCaseId}/review`);
        } else {
          setLocation('/review');
        }
        break;
      
      default:
        console.error(`Unknown step: ${stepId}`);
        if (caseId) {
          setLocation(`/cases/${caseId}`);
        } else {
          setLocation('/case-management');
        }
        break;
    }
    
    onStepChange(stepId);
  };

  return (
    <div className="w-80 bg-card border-r border-border flex flex-col" data-testid="workflow-sidebar">
      {/* Header */}
      <div className="p-6 border-b border-border">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-primary rounded-lg flex items-center justify-center">
            <i className="fas fa-gavel text-primary-foreground text-lg"></i>
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">Legal Workflow</h1>
            <p className="text-sm text-white">3-Step Process</p>
          </div>
        </div>
        
        {caseData && (
          <div className="text-sm">
            <div className="font-medium text-white">{caseData.caseNumber}</div>
            <div className="text-white">{caseData.title}</div>
          </div>
        )}
      </div>

      {/* Auto-Advance Toggle */}
      <div className="px-6 py-4 border-b border-border">
        <label className="flex items-center gap-3 cursor-pointer" data-testid="toggle-auto-advance">
          <input
            type="checkbox"
            checked={autoAdvance}
            onChange={(e) => setAutoAdvance(e.target.checked)}
            className="w-4 h-4 text-primary bg-background border-border rounded focus:ring-primary"
          />
          <span className="text-sm font-medium text-white">Auto-advance steps</span>
        </label>
        <p className="text-xs text-white mt-1">
          Automatically move to next step when current step completes
        </p>
      </div>

      {/* Workflow Steps */}
      <div className="flex-1 p-4 space-y-2" data-testid="workflow-steps">
        {steps.map((stepConfig) => {
          const step: WorkflowStep = {
            ...stepConfig,
            status: getStepStatus(stepConfig.id),
            progress: getStepProgress(stepConfig.id),
            description: getStepDescription(stepConfig.id),
          };
          
          const isActive = detectedStep === step.id;
          
          return (
            <div key={step.id} className="space-y-1">
              <div
                className={getStepStyles(step, isActive)}
                onClick={() => handleStepClick(step.id, step.status)}
                data-testid={`workflow-step-${step.id}`}
              >
                <div className="flex items-center gap-3 flex-1">
                  <div className={`w-8 h-8 flex items-center justify-center rounded-full transition-all ${
                    step.status === "done" ? "bg-green-100 dark:bg-green-900" : 
                    isActive ? "bg-white/20" : "bg-background/50"
                  }`}>
                    <i className={getStepIcon(step, isActive)}></i>
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className={`font-medium text-sm ${isActive ? "font-bold" : ""}`}>{step.id}.</span>
                      <span className={`font-medium text-sm ${isActive ? "font-bold" : ""}`}>
                        {step.title}
                      </span>
                      {step.status === "done" && (
                        <div className="flex items-center">
                          <i className="fas fa-check text-green-500 ml-2 text-xs"></i>
                        </div>
                      )}
                    </div>
                    {step.description && (
                      <div className="text-xs opacity-75 mt-1">
                        {step.description}
                      </div>
                    )}
                  </div>
                </div>
                
                {/* Progress indicator for in-progress steps */}
                {step.status === "in_progress" && step.progress && step.progress > 0 && (
                  <div className="text-xs font-medium">
                    {step.progress}%
                  </div>
                )}
              </div>
              
              {/* Progress bar for OCR processing */}
              {step.id === 3 && step.status === "in_progress" && step.progress && step.progress > 0 && (
                <div className="mx-4 mb-2">
                  <div className="w-full bg-background/30 rounded-full h-2">
                    <div
                      className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${step.progress}%` }}
                    ></div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div className="p-4 border-t border-border text-xs text-white">
        <div>Created: {caseData?.createdAt ? new Date(caseData.createdAt).toLocaleDateString() : new Date().toLocaleDateString()}</div>
        <div>Status: {caseData?.status === 'active' ? 'Active' : 'Inactive'}</div>
      </div>
    </div>
  );
}

export default WorkflowStepSidebar;
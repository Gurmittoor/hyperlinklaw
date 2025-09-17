import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Case, Document } from "@shared/schema";
import WorkflowStepSidebar from "./WorkflowStepSidebar";
import { OCRProcessingStep } from "./workflow/OCRProcessingStep";

interface LegalCaseWorkflowProps {
  caseId?: string;
}

export function LegalCaseWorkflow({ caseId }: LegalCaseWorkflowProps) {
  const [currentStep, setCurrentStep] = useState(1);
  const [location, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Fetch case data with workflow progress
  const { data: caseData, isLoading } = useQuery<Case>({
    queryKey: ["/api/cases", caseId],
    enabled: !!caseId,
  });

  // Fetch case documents
  const { data: documents = [] } = useQuery<Document[]>({
    queryKey: ["/api/documents", caseId],
    enabled: !!caseId,
  });

  // Calculate overall progress based on case and document states
  const { data: workflowProgress } = useQuery({
    queryKey: ["/api/cases", caseId, "progress"],
    enabled: !!caseId,
    refetchInterval: 10000, // Poll every 10 seconds to reduce server load
  });

  // Auto-advance mutation
  const advanceStepMutation = useMutation({
    mutationFn: async (step: number) => {
      return await apiRequest(`/api/cases/${caseId}/advance-step`, {
        method: "POST",
        body: JSON.stringify({ step }),
        headers: { 'Content-Type': 'application/json' }
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cases", caseId] });
      queryClient.invalidateQueries({ queryKey: ["/api/cases", caseId, "progress"] });
    },
    onError: (error) => {
      toast({
        title: "Workflow Error", 
        description: `Failed to advance workflow step: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  // Set current step from case data
  useEffect(() => {
    if (caseData?.currentStep) {
      setCurrentStep(caseData.currentStep);
    }
  }, [caseData?.currentStep]);

  // Sync currentStep with URL location to prevent navigation issues
  useEffect(() => {
    if (!caseId) return;
    
    // Detect current step from URL
    let urlBasedStep = 1;
    if (location.includes('/case-management')) urlBasedStep = 1;
    else if (location === `/cases/${caseId}`) urlBasedStep = 2; // Documents page
    else if (location.includes('/ocr')) urlBasedStep = 3;
    else if (location.includes('/links')) urlBasedStep = 4;
    else if (location.includes('/review')) urlBasedStep = 5;
    else if (location.includes('/court-ready')) urlBasedStep = 6;
    
    // Update currentStep if URL indicates a different step
    if (urlBasedStep !== currentStep) {
      setCurrentStep(urlBasedStep);
    }
  }, [location, caseId, currentStep]);

  // Auto-advance logic
  useEffect(() => {
    if (!caseData?.autoAdvance || !workflowProgress) return;

    const steps = workflowProgress?.steps || [];
    const currentStepData = steps.find((s: any) => s.id === currentStep);
    
    if (currentStepData?.status === "done" && currentStep < 6) {
      const nextStep = currentStep + 1;
      const nextStepData = steps.find((s: any) => s.id === nextStep);
      
      if (nextStepData?.status === "blocked") {
        // Auto-advance to next step
        advanceStepMutation.mutate(nextStep);
        setCurrentStep(nextStep);
        
        toast({
          title: "Step Complete!",
          description: `Automatically advancing to Step ${nextStep}`,
        });
      }
    }
  }, [workflowProgress, currentStep, caseData?.autoAdvance, advanceStepMutation, toast]);

  const handleStepChange = (step: number) => {
    // Extract case ID from current URL as fallback
    const currentPath = location;
    const caseMatch = currentPath.match(/\/cases\/([^\/]+)/);
    const currentCaseId = caseId || (caseMatch ? caseMatch[1] : null);

    // Get current step from URL to prevent navigation issues
    const getCurrentStepFromUrl = () => {
      if (currentPath.includes('/case-management')) return 1;
      if (currentPath.includes('/documents') || currentPath === `/cases/${currentCaseId}`) return 2;
      if (currentPath.includes('/ocr')) return 3;
      if (currentPath.includes('/links') || currentPath.includes('/hyperlinks')) return 4;
      if (currentPath.includes('/review')) return 5;
      if (currentPath.includes('/court-ready') || currentPath.includes('/submit')) return 6;
      return 1;
    };

    const urlCurrentStep = getCurrentStepFromUrl();

    // If clicking the current step, DO NOTHING (stay on page)
    if (step === urlCurrentStep) {
      console.log(`Already on step ${step}, staying on current page`);
      return; // DON'T NAVIGATE
    }

    // CRITICAL: Always require case context for navigation
    if (!currentCaseId) {
      console.error("Cannot navigate: case context is missing");
      toast({
        title: "Navigation Error",
        description: "Case context is missing. Please select a case first.",
        variant: "destructive",
      });
      return;
    }

    // Check if step is allowed before navigation
    if (!workflowProgress) return;
    const stepData = workflowProgress?.steps?.find((s: any) => s.id === step);
    if (stepData && stepData.status === "blocked") {
      console.log(`Step ${step} is blocked`);
      return;
    }

    // Update currentStep state
    setCurrentStep(step);
    
    // Navigate to case-specific routes ONLY - never to dashboard
    switch (step) {
      case 1:
        setLocation(`/cases/${currentCaseId}/details`);
        break;
      case 2:
        setLocation(`/cases/${currentCaseId}`); // Stay in case documents context
        break;
      case 3:
        setLocation(`/cases/${currentCaseId}/ocr`);
        break;
      case 4:
        setLocation(`/cases/${currentCaseId}/links`);
        break;
      case 5:
        setLocation(`/cases/${currentCaseId}/review`);
        break;
      case 6:
        setLocation(`/cases/${currentCaseId}/court-ready`);
        break;
      default:
        console.log('Unknown step, staying on current page');
        break;
    }
  };

  const handleCreateCase = (newCase: Case) => {
    queryClient.invalidateQueries({ queryKey: ["/api/cases"] });
    if (caseData?.autoAdvance && caseId) {
      setCurrentStep(2);
      setLocation(`/cases/${caseId}`);
    }
  };

  const handleDocumentsUploaded = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/documents", caseId] });
    if (caseData?.autoAdvance && caseId) {
      setCurrentStep(3);
      setLocation(`/cases/${caseId}/ocr`);
    }
  };

  const handleOCRComplete = () => {
    if (caseData?.autoAdvance && caseId) {
      setCurrentStep(4);
      setLocation(`/cases/${caseId}/links`);
    }
  };

  const handleHyperlinksGenerated = () => {
    if (caseData?.autoAdvance && caseId) {
      setCurrentStep(5);
      setLocation(`/cases/${caseId}/review`);
    }
  };

  const handleReviewComplete = () => {
    if (caseData?.autoAdvance && caseId) {
      setCurrentStep(6);
      setLocation(`/cases/${caseId}/court-ready`);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex items-center gap-3">
          <i className="fas fa-spinner fa-spin text-primary text-xl"></i>
          <span className="text-lg">Loading case workflow...</span>
        </div>
      </div>
    );
  }

  if (!caseId || !caseData) {
    return (
      <div className="flex h-full">
        <WorkflowStepSidebar 
          currentStep={1}
          onStepChange={handleStepChange}
          progress={null}
        />
        <div className="flex-1">
          <div className="p-8"><h2 className="text-2xl font-bold">Step 1: Case Management</h2><p>Case creation and setup.</p></div>
        </div>
      </div>
    );
  }

  const renderCurrentStep = () => {
    switch (currentStep) {
      case 1:
        return <div className="p-8"><h2 className="text-2xl font-bold">Step 1: Case Management</h2><p>Case creation and setup complete.</p></div>;
      case 2:
        return <div className="p-8"><h2 className="text-2xl font-bold">Step 2: Document Upload</h2><p>Upload your legal documents here.</p></div>;
      case 3:
        return <OCRProcessingStep 
          caseId={caseId}
          documents={documents}
          onOCRComplete={handleOCRComplete}
        />;
      case 4:
        return <div className="p-8"><h2 className="text-2xl font-bold">Step 4: AI Hyperlinking</h2><p>AI processing to create hyperlinks.</p></div>;
      case 5:
        return <div className="p-8"><h2 className="text-2xl font-bold">Step 5: Lawyer Review</h2><p>Review and validate the generated hyperlinks.</p></div>;
      case 6:
        return <div className="p-8"><h2 className="text-2xl font-bold">Step 6: Court Submission</h2><p>Prepare court-ready documents.</p></div>;
      default:
        return <div>Invalid step</div>;
    }
  };

  return (
    <div className="flex h-full">
      <WorkflowStepSidebar 
        currentStep={currentStep}
        onStepChange={handleStepChange}
        progress={workflowProgress}
        caseData={caseData}
      />
      <div className="flex-1 overflow-auto">
        {renderCurrentStep()}
      </div>
    </div>
  );
}
import React, { useState } from 'react';
import { useLocation } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import Sidebar from './Sidebar';
import GlobalHeader from './GlobalHeader';
import WorkflowStepSidebar from './WorkflowStepSidebar';

interface LayoutProps {
  children: React.ReactNode;
  showSidebar?: boolean;
}

export default function Layout({ children, showSidebar = true }: LayoutProps) {
  const [location] = useLocation();
  const [currentStep, setCurrentStep] = useState(1);
  
  // Get cases to determine if we have any for smart routing
  const { data: cases = [] } = useQuery({
    queryKey: ['/api/cases'],
    retry: false,
  });

  // Extract case ID from URL if present
  const caseIdMatch = location.match(/\/cases\/([^\/]+)/);
  const casesArray = Array.isArray(cases) ? cases : [];
  const currentCaseId = caseIdMatch ? caseIdMatch[1] : (casesArray.length > 0 ? casesArray[0]?.id : undefined);
  
  // Don't show sidebar on home page only
  const shouldShowSidebar = showSidebar && location !== '/';

  if (!shouldShowSidebar) {
    return (
      <div className="min-h-screen">
        <GlobalHeader />
        {children}
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Fixed Workflow Navigation Sidebar */}
      <div className="w-80 flex-shrink-0">
        <div className="fixed h-full w-80 overflow-y-auto bg-slate-900 border-r border-slate-700">
          <WorkflowStepSidebar 
            currentStep={currentStep}
            onStepChange={setCurrentStep}
            progress={null}
            caseData={casesArray.length > 0 ? casesArray[0] : undefined}
          />
        </div>
      </div>
      
      {/* Scrollable Main Content */}
      <div className="flex-1 overflow-y-auto">
        <GlobalHeader />
        <div className="min-h-full">
          {children}
        </div>
      </div>
    </div>
  );
}
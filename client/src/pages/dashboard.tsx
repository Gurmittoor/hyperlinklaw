import { useState, useEffect } from "react";
import { useParams } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Header from "@/components/Header";
import DocumentUploader from "@/components/DocumentUploader";
import DocumentTable from "@/components/DocumentTable";
import CaseWorkflow from "@/components/CaseWorkflow";
import OverallProgressHeader from "@/components/OverallProgressHeader";
import DocumentProgressCard from "@/components/DocumentProgressCard";
import { Chat } from "@/components/Chat";
import { api } from "@/lib/api";

export default function Dashboard() {
  const params = useParams<{ caseId?: string }>();
  const [showUploader, setShowUploader] = useState(false);
  const [selectedCount, setSelectedCount] = useState(0);
  const [currentCaseId, setCurrentCaseId] = useState<string | null>(null);
  const queryClient = useQueryClient();

  // Create default case if no caseId in URL
  useEffect(() => {
    if (!params.caseId) {
      // Try to get existing cases first
      api.cases.getAll().then(cases => {
        if (cases.length > 0) {
          setCurrentCaseId(cases[0].id);
        } else {
          // Redirect to home page to create a proper case
          window.location.href = '/';
        }
      }).catch(console.error);
    } else {
      setCurrentCaseId(params.caseId);
    }
  }, [params.caseId]);

  const { data: caseData } = useQuery({
    queryKey: ['/api/cases', currentCaseId],
    queryFn: () => api.cases.getById(currentCaseId!),
    enabled: !!currentCaseId,
  });

  const { data: documents = [] } = useQuery({
    queryKey: ['/api/cases', currentCaseId, 'documents'],
    queryFn: () => api.documents.getByCaseId(currentCaseId!),
    enabled: !!currentCaseId,
  });

  const handleProcessSelected = () => {
    // This will be handled by DocumentTable component
    console.log('Process selected documents');
  };

  const handleUploadDocuments = () => {
    setShowUploader(!showUploader);
  };

  const handleUploadComplete = () => {
    setShowUploader(false);
    // Invalidate documents cache to refresh the document list
    if (currentCaseId) {
      queryClient.invalidateQueries({ 
        queryKey: ['/api/cases', currentCaseId, 'documents'] 
      });
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground" data-testid="dashboard">
      <main className="flex-1 flex flex-col">
        <Header 
          caseData={caseData && currentCaseId ? { 
            id: currentCaseId, 
            caseNumber: caseData.caseNumber, 
            title: caseData.title 
          } : undefined}
          selectedCount={selectedCount}
          onProcessSelected={handleProcessSelected}
          onUploadDocuments={handleUploadDocuments}
        />
        
        {showUploader && currentCaseId && (
          <DocumentUploader 
            caseId={currentCaseId}
            onUploadComplete={handleUploadComplete}
            onClose={() => setShowUploader(false)}
          />
        )}
        
        {currentCaseId && (
          <>
            <DocumentTable 
              caseId={currentCaseId}
              onSelectionChange={setSelectedCount}
            />
            
          </>
        )}
        
        {/* Chat Assistant */}
        <Chat caseId={currentCaseId || undefined} />
      </main>
    </div>
  );
}

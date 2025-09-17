import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { CheckCircle, Clock, FileText, Scale, User, Users, Send, Network } from 'lucide-react';
import { api } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import type { Document } from '@shared/schema';

interface CaseWorkflowProps {
  caseId: string;
  documents: Document[];
}

export default function CaseWorkflow({ caseId, documents }: CaseWorkflowProps) {
  const [selectedDocs, setSelectedDocs] = useState<Set<string>>(new Set());
  const [lawyerName, setLawyerName] = useState('');
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const startHyperlinkingMutation = useMutation({
    mutationFn: async (documentIds: string[]) => {
      const response = await fetch('/api/documents/start-hyperlinking', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentIds })
      });
      if (!response.ok) throw new Error('Failed to start hyperlinking');
      return response.json();
    },
    onSuccess: (data) => {
      const { totalLinks, successCount, failedCount, results } = data;
      
      if (failedCount > 0) {
        toast({
          title: `⚠️ Processing Completed with Issues`,
          description: `Found ${totalLinks} hyperlinks in ${successCount} documents. ${failedCount} failed to process.`,
          variant: "destructive",
        });
      } else {
        toast({
          title: "🎉 Hyperlinks Detected!",
          description: `Found ${totalLinks} hyperlinks across ${successCount} documents. Ready for review!`,
        });
      }
      
      queryClient.invalidateQueries({ queryKey: ['/api/cases', caseId, 'documents'] });
      setSelectedDocs(new Set());
    },
    onError: () => {
      toast({
        title: "Failed to Start Hyperlinking",
        description: "Please try again.",
        variant: "destructive",
      });
    },
  });

  const reviewDocumentMutation = useMutation({
    mutationFn: async ({ docId, approved }: { docId: string; approved: boolean }) => {
      const response = await fetch(`/api/documents/${docId}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approved, reviewerName: lawyerName })
      });
      if (!response.ok) throw new Error('Failed to review document');
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Document Reviewed",
        description: "Review status updated successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/cases', caseId, 'documents'] });
    },
  });

  const submitToCourtMutation = useMutation({
    mutationFn: async (documentIds: string[]) => {
      const response = await fetch('/api/documents/submit-to-court', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentIds, courtInfo: {} })
      });
      if (!response.ok) throw new Error('Failed to submit to court');
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Submitted to Court!",
        description: "Documents are now court-ready and have been submitted.",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/cases', caseId, 'documents'] });
    },
  });

  const handleSelectDoc = (docId: string) => {
    const newSelected = new Set(selectedDocs);
    if (newSelected.has(docId)) {
      newSelected.delete(docId);
    } else {
      newSelected.add(docId);
    }
    setSelectedDocs(newSelected);
  };

  const handleStartHyperlinking = () => {
    if (selectedDocs.size === 0) {
      toast({
        title: "No Documents Selected",
        description: "Please select at least one document to process.",
        variant: "destructive",
      });
      return;
    }
    startHyperlinkingMutation.mutate(Array.from(selectedDocs));
  };

  const getWorkflowStep = (doc: Document): number => {
    if (doc.courtSubmitted) return 5;
    if (doc.lawyerReviewed && doc.reviewStatus === 'approved') return 4;
    if (doc.aiProcessingStatus === 'completed') return 3;
    if (doc.aiProcessingStatus === 'processing' || doc.aiProcessingStatus === 'queued') return 3;
    if (doc.selectedForHyperlinking) return 2;
    return 1;
  };

  const getStatusColor = (doc: Document): string => {
    const step = getWorkflowStep(doc);
    if (step === 5) return 'text-green-400';
    if (step === 4) return 'text-blue-400';
    if (step === 3) return 'text-yellow-400';
    if (step === 2) return 'text-orange-400';
    return 'text-gray-400';
  };

  const getStatusText = (doc: Document): string => {
    if (doc.courtSubmitted) return 'Court Submitted';
    if (doc.lawyerReviewed && doc.reviewStatus === 'approved') return 'Lawyer Approved';
    if (doc.aiProcessingStatus === 'completed') return '✨ AI Complete - Review Hyperlinks';
    if (doc.aiProcessingStatus === 'processing') return '🧠 AI Analyzing Document...';
    if (doc.aiProcessingStatus === 'queued') return '⏳ Queued for AI Analysis';
    if (doc.selectedForHyperlinking) return 'Selected for AI';
    return 'Uploaded';
  };

  const canSelectForHyperlinking = (doc: Document): boolean => {
    return !doc.selectedForHyperlinking && doc.aiProcessingStatus === 'none';
  };

  const canReview = (doc: Document): boolean => {
    return doc.aiProcessingStatus === 'completed' && !doc.lawyerReviewed;
  };

  const canSubmitToCourt = (doc: Document): boolean => {
    return doc.lawyerReviewed && doc.reviewStatus === 'approved' && !doc.courtSubmitted;
  };

  const pendingReviewDocs = Array.isArray(documents) ? documents.filter(canReview) : [];
  const approvedDocs = Array.isArray(documents) ? documents.filter(canSubmitToCourt) : [];

  return (
    <div className="space-y-6" data-testid="case-workflow">

      {/* Step 3: AI Hyperlinking */}
      {Array.isArray(documents) && documents.some(canSelectForHyperlinking) && (
        <div className="bg-card rounded-lg p-6 border">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <FileText className="w-5 h-5 text-yellow-400" />
            Step 4: Select Documents for AI Hyperlinking
          </h3>
          
          <div className="space-y-3 mb-4">
            {(Array.isArray(documents) ? documents.filter(canSelectForHyperlinking) : []).map((doc) => (
              <div key={doc.id} className="flex items-center gap-3 p-3 bg-muted rounded">
                <input
                  type="checkbox"
                  checked={selectedDocs.has(doc.id)}
                  onChange={() => handleSelectDoc(doc.id)}
                  className="w-4 h-4"
                  data-testid={`checkbox-select-doc-${doc.id}`}
                />
                <FileText className="w-4 h-4" />
                <span className="flex-1">{doc.title}</span>
                <span className="text-sm text-muted-foreground">{(doc.fileSize / 1024 / 1024).toFixed(1)} MB</span>
              </div>
            ))}
          </div>
          
          <button
            onClick={handleStartHyperlinking}
            disabled={selectedDocs.size === 0 || startHyperlinkingMutation.isPending}
            className="px-6 py-2 bg-yellow-600 hover:bg-yellow-700 disabled:opacity-50 text-white rounded-lg transition"
            data-testid="button-start-hyperlinking"
          >
            {startHyperlinkingMutation.isPending ? 'Starting...' : `Start AI Hyperlinking (${selectedDocs.size} selected)`}
          </button>
        </div>
      )}


      {/* Step 5: Court Submission */}
      {approvedDocs.length > 0 && (
        <div className="bg-card rounded-lg p-6 border">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Send className="w-5 h-5 text-purple-400" />
            Step 5: Submit to Court
          </h3>
          
          <div className="space-y-3 mb-4">
            {approvedDocs.map((doc) => (
              <div key={doc.id} className="flex items-center justify-between p-3 bg-muted rounded">
                <div className="flex items-center gap-3">
                  <FileText className="w-4 h-4" />
                  <span>{doc.title}</span>
                  <span className="text-sm text-green-600 font-medium">Lawyer Approved</span>
                  <span className="text-xs text-muted-foreground">by {doc.reviewedBy}</span>
                </div>
              </div>
            ))}
          </div>
          
          <button
            onClick={() => submitToCourtMutation.mutate(approvedDocs.map(d => d.id))}
            disabled={submitToCourtMutation.isPending}
            className="px-6 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white rounded-lg transition"
            data-testid="button-submit-to-court"
          >
            {submitToCourtMutation.isPending ? 'Submitting...' : `Submit ${approvedDocs.length} Documents to Court`}
          </button>
        </div>
      )}

    </div>
  );
}
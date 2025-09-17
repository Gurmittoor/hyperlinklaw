import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import type { Case, Document } from "@shared/schema";

interface CourtSubmitStepProps {
  caseId: string;
  caseData: Case;
  documents: Document[];
}

export function CourtSubmitStep({ caseId, caseData, documents }: CourtSubmitStepProps) {
  const [selectedDocuments, setSelectedDocuments] = useState<string[]>([]);
  const [bundleGenerated, setBundleGenerated] = useState(false);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Fetch court bundle status
  const { data: bundleStatus } = useQuery({
    queryKey: ["/api/cases", caseId, "bundle-status"],
  });

  const generateBundleMutation = useMutation({
    mutationFn: async () => {
      return apiRequest(`/api/cases/${caseId}/generate-court-bundle`, {
        method: "POST",
        body: { documentIds: selectedDocuments },
      });
    },
    onSuccess: (result) => {
      setBundleGenerated(true);
      queryClient.invalidateQueries({ queryKey: ["/api/cases", caseId, "bundle-status"] });
      toast({
        title: "Court Bundle Generated",
        description: "Your court-ready document bundle has been created successfully.",
      });
    },
    onError: (error) => {
      toast({
        title: "Bundle Generation Failed",
        description: `Failed to generate court bundle: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  const submitToCourtMutation = useMutation({
    mutationFn: async () => {
      return apiRequest(`/api/cases/${caseId}/submit-to-court`, {
        method: "POST",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cases", caseId] });
      toast({
        title: "Case Submitted",
        description: "Your case has been marked as submitted to court.",
      });
    },
    onError: (error) => {
      toast({
        title: "Submission Failed",
        description: `Failed to submit case: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  const handleDocumentToggle = (documentId: string, checked: boolean) => {
    if (checked) {
      setSelectedDocuments(prev => [...prev, documentId]);
    } else {
      setSelectedDocuments(prev => prev.filter(id => id !== documentId));
    }
  };

  const handleSelectAll = () => {
    const approvedDocs = documents.filter(doc => doc.lawyerReviewed);
    setSelectedDocuments(approvedDocs.map(doc => doc.id));
  };

  const handleSelectNone = () => {
    setSelectedDocuments([]);
  };

  const approvedDocuments = documents.filter(doc => doc.lawyerReviewed);
  const isSubmitted = caseData.status === "submitted" || bundleStatus?.submitted;

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-4">
          <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
            isSubmitted ? "bg-green-100 dark:bg-green-900" : 
            bundleGenerated ? "bg-blue-100 dark:bg-blue-900" : "bg-primary"
          }`}>
            <i className={`text-xl ${
              isSubmitted ? "fas fa-check text-green-600" :
              bundleGenerated ? "fas fa-file-archive text-blue-600" : "fas fa-download text-primary-foreground"
            }`}></i>
          </div>
          <div>
            <h1 className="text-3xl font-bold text-foreground">
              Step 6: Court Submit {isSubmitted ? "✅" : ""}
            </h1>
            <p className="text-lg text-muted-foreground">
              {isSubmitted 
                ? "Case successfully submitted to court"
                : bundleGenerated
                ? "Court bundle ready for download and submission"
                : "Generate final court-ready document bundle"
              }
            </p>
          </div>
        </div>
      </div>

      {/* Case Summary */}
      <div className="bg-card border border-border rounded-lg p-6 mb-6">
        <h3 className="text-lg font-semibold mb-4">Case Summary</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <div className="text-sm font-medium text-muted-foreground">Case Number</div>
            <div className="text-lg font-semibold">{caseData.caseNumber}</div>
          </div>
          <div>
            <div className="text-sm font-medium text-muted-foreground">Filing Date</div>
            <div className="text-lg">{new Date(caseData.filingDate).toLocaleDateString()}</div>
          </div>
          <div className="md:col-span-2">
            <div className="text-sm font-medium text-muted-foreground">Case Title</div>
            <div className="text-lg font-semibold">{caseData.title}</div>
          </div>
          <div>
            <div className="text-sm font-medium text-muted-foreground">Court</div>
            <div className="text-lg">{caseData.courtName || "Not specified"}</div>
          </div>
          <div>
            <div className="text-sm font-medium text-muted-foreground">Judge</div>
            <div className="text-lg">{caseData.judgeName || "Not assigned"}</div>
          </div>
        </div>
      </div>

      {/* Document Selection for Bundle */}
      {!bundleGenerated && !isSubmitted && (
        <div className="bg-card border border-border rounded-lg p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold">Select Documents for Court Bundle</h3>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={handleSelectAll}>
                Select All Approved
              </Button>
              <Button size="sm" variant="outline" onClick={handleSelectNone}>
                Select None
              </Button>
            </div>
          </div>

          <div className="space-y-3">
            {approvedDocuments.map((doc) => (
              <div key={doc.id} className="flex items-center gap-3 p-3 border border-border rounded">
                <Checkbox
                  checked={selectedDocuments.includes(doc.id)}
                  onCheckedChange={(checked) => handleDocumentToggle(doc.id, checked as boolean)}
                  data-testid={`checkbox-bundle-document-${doc.id}`}
                />
                <div className="flex items-center gap-3 flex-1">
                  <i className="fas fa-file-pdf text-red-500"></i>
                  <div>
                    <div className="font-medium">{doc.title}</div>
                    <div className="text-sm text-muted-foreground">
                      Reviewed by: {doc.reviewedBy || "System"} • 
                      {doc.reviewedAt && ` on ${new Date(doc.reviewedAt).toLocaleDateString()}`}
                    </div>
                  </div>
                </div>
                <span className="px-2 py-1 bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 rounded text-xs font-medium">
                  ✓ Approved
                </span>
              </div>
            ))}
          </div>

          {selectedDocuments.length > 0 && (
            <div className="mt-6 pt-4 border-t border-border">
              <Button
                onClick={() => generateBundleMutation.mutate()}
                disabled={generateBundleMutation.isPending}
                className="bg-primary hover:bg-primary/90"
                data-testid="button-generate-court-bundle"
              >
                {generateBundleMutation.isPending ? (
                  <>
                    <i className="fas fa-spinner fa-spin mr-2"></i>
                    Generating Court Bundle...
                  </>
                ) : (
                  <>
                    <i className="fas fa-file-archive mr-2"></i>
                    Generate Court Bundle ({selectedDocuments.length} documents)
                  </>
                )}
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Bundle Generated - Download Options */}
      {bundleGenerated && !isSubmitted && (
        <div className="bg-card border border-border rounded-lg p-6 mb-6">
          <h3 className="text-lg font-semibold mb-4">Court Bundle Ready</h3>
          <div className="flex items-center gap-6 mb-6">
            <div className="flex items-center gap-3">
              <i className="fas fa-file-archive text-blue-500 text-2xl"></i>
              <div>
                <div className="font-medium">Court Bundle PDF</div>
                <div className="text-sm text-muted-foreground">
                  {selectedDocuments.length} documents with hyperlinks
                </div>
              </div>
            </div>
            <div className="flex gap-3">
              <Button variant="outline" data-testid="button-download-bundle">
                <i className="fas fa-download mr-2"></i>
                Download Bundle
              </Button>
              <Button variant="outline" data-testid="button-print-bundle">
                <i className="fas fa-print mr-2"></i>
                Print Bundle
              </Button>
            </div>
          </div>

          <div className="pt-4 border-t border-border">
            <Button
              onClick={() => submitToCourtMutation.mutate()}
              disabled={submitToCourtMutation.isPending}
              className="bg-green-600 hover:bg-green-700"
              data-testid="button-submit-to-court"
            >
              {submitToCourtMutation.isPending ? (
                <>
                  <i className="fas fa-spinner fa-spin mr-2"></i>
                  Submitting to Court...
                </>
              ) : (
                <>
                  <i className="fas fa-gavel mr-2"></i>
                  Mark as Submitted to Court
                </>
              )}
            </Button>
          </div>
        </div>
      )}

      {/* Submission Completed */}
      {isSubmitted && (
        <div className="bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-lg p-6 mb-6">
          <div className="flex items-center gap-3 mb-4">
            <i className="fas fa-check-circle text-green-600 text-2xl"></i>
            <div>
              <h3 className="text-lg font-semibold text-green-900 dark:text-green-100">
                Case Successfully Submitted
              </h3>
              <p className="text-green-700 dark:text-green-200">
                Your case has been completed and submitted to court with all hyperlinked documents.
              </p>
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-center">
            <div>
              <div className="text-2xl font-bold text-green-600">{documents.length}</div>
              <div className="text-sm text-green-700 dark:text-green-200">Total Documents</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-green-600">{approvedDocuments.length}</div>
              <div className="text-sm text-green-700 dark:text-green-200">Approved Documents</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-green-600">100%</div>
              <div className="text-sm text-green-700 dark:text-green-200">Workflow Complete</div>
            </div>
          </div>
        </div>
      )}

      {/* Court Submission Guidelines */}
      <div className="mt-8 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <i className="fas fa-gavel text-blue-500 mt-1"></i>
          <div>
            <h4 className="font-medium text-blue-900 dark:text-blue-100">Court Submission Guidelines</h4>
            <div className="text-sm text-blue-700 dark:text-blue-200 mt-2 space-y-1">
              <p>• <strong>Hyperlinked documents:</strong> All cross-references are automatically linked for easy navigation</p>
              <p>• <strong>Professional formatting:</strong> Documents maintain court-approved formatting standards</p>
              <p>• <strong>Complete bundle:</strong> Includes manifest, table of contents, and all supporting documents</p>
              <p>• <strong>Digital ready:</strong> Optimized for electronic court filing systems</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
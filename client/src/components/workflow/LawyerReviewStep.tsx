import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { EnhancedReviewInterface } from "@/components/EnhancedReviewInterface";
import type { Document } from "@shared/schema";

interface LawyerReviewStepProps {
  caseId: string;
  documents: Document[];
  onReviewComplete: () => void;
}

export function LawyerReviewStep({ caseId, documents, onReviewComplete }: LawyerReviewStepProps) {
  const [selectedDocument, setSelectedDocument] = useState<Document | null>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Fetch hyperlinks for review
  const { data: hyperlinks = [] } = useQuery({
    queryKey: ["/api/links", caseId],
    refetchInterval: 5000, // Poll for updates
  });

  const approveAllMutation = useMutation({
    mutationFn: async () => {
      return apiRequest(`/api/cases/${caseId}/approve-all-documents`, {
        method: "POST",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/documents", caseId] });
      onReviewComplete();
      toast({
        title: "Review Complete",
        description: "All documents have been approved and are ready for court submission.",
      });
    },
    onError: (error) => {
      toast({
        title: "Approval Failed",
        description: `Failed to approve documents: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  const documentsWithHyperlinks = documents.filter(doc => 
    doc.aiProcessingStatus === "completed" && doc.selectedForHyperlinking
  );
  const allDocumentsReviewed = documentsWithHyperlinks.every(doc => doc.lawyerReviewed);
  const approvedHyperlinks = hyperlinks.filter((link: any) => link.status === "approved").length;
  const totalHyperlinks = hyperlinks.length;

  const getDocumentReviewStatus = (doc: Document) => {
    if (doc.lawyerReviewed) return "approved";
    if (doc.reviewStatus === "in_review") return "in_review";
    return "pending";
  };

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-4">
          <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
            allDocumentsReviewed ? "bg-green-100 dark:bg-green-900" : "bg-primary"
          }`}>
            <i className={`text-xl ${
              allDocumentsReviewed ? "fas fa-check text-green-600" : "fas fa-check-circle text-primary-foreground"
            }`}></i>
          </div>
          <div>
            <h1 className="text-3xl font-bold text-foreground">
              Step 5: Lawyer Review {allDocumentsReviewed ? "✅" : ""}
            </h1>
            <p className="text-lg text-muted-foreground">
              {allDocumentsReviewed 
                ? "All documents reviewed and approved for court submission"
                : "Review and approve AI-generated hyperlinks before court submission"
              }
            </p>
          </div>
        </div>
      </div>

      {/* Review Progress Summary */}
      <div className="bg-card border border-border rounded-lg p-6 mb-6">
        <h3 className="text-lg font-semibold mb-4">Review Progress</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="text-center">
            <div className="text-3xl font-bold text-primary mb-2">{documentsWithHyperlinks.length}</div>
            <div className="text-sm text-muted-foreground">Documents with Hyperlinks</div>
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold text-blue-600 mb-2">{approvedHyperlinks}/{totalHyperlinks}</div>
            <div className="text-sm text-muted-foreground">Hyperlinks Approved</div>
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold text-green-600 mb-2">
              {documentsWithHyperlinks.filter(doc => doc.lawyerReviewed).length}/{documentsWithHyperlinks.length}
            </div>
            <div className="text-sm text-muted-foreground">Documents Reviewed</div>
          </div>
        </div>
      </div>

      {/* Document List for Review */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Document Selection */}
        <div className="bg-card border border-border rounded-lg p-6">
          <h3 className="text-lg font-semibold mb-4">Documents to Review</h3>
          <div className="space-y-3">
            {documentsWithHyperlinks.map((doc) => {
              const status = getDocumentReviewStatus(doc);
              const docHyperlinks = hyperlinks.filter((link: any) => link.srcDocId === doc.id);
              
              return (
                <div
                  key={doc.id}
                  className={`p-3 border rounded cursor-pointer transition-colors ${
                    selectedDocument?.id === doc.id
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-primary/50 hover:bg-primary/5"
                  }`}
                  onClick={() => setSelectedDocument(doc)}
                  data-testid={`document-review-${doc.id}`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <i className="fas fa-file-pdf text-red-500"></i>
                      <div>
                        <div className="font-medium">{doc.title}</div>
                        <div className="text-sm text-muted-foreground">
                          {docHyperlinks.length} hyperlinks
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${
                        status === "approved" ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" :
                        status === "in_review" ? "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200" :
                        "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200"
                      }`}>
                        {status === "approved" ? "✓ Reviewed" : 
                         status === "in_review" ? "In Review" : "Pending"}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Review Instructions */}
        <div className="bg-card border border-border rounded-lg p-6">
          <h3 className="text-lg font-semibold mb-4">Review Instructions</h3>
          <div className="space-y-4 text-sm text-muted-foreground">
            <div className="flex items-start gap-3">
              <i className="fas fa-search text-primary mt-1"></i>
              <div>
                <div className="font-medium text-foreground">Examine Hyperlinks</div>
                <div>Review each AI-generated hyperlink for accuracy and relevance</div>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <i className="fas fa-edit text-primary mt-1"></i>
              <div>
                <div className="font-medium text-foreground">Edit if Needed</div>
                <div>Modify hyperlink text, target pages, or remove inappropriate links</div>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <i className="fas fa-check-circle text-primary mt-1"></i>
              <div>
                <div className="font-medium text-foreground">Approve Documents</div>
                <div>Mark documents as approved when review is complete</div>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <i className="fas fa-gavel text-primary mt-1"></i>
              <div>
                <div className="font-medium text-foreground">Court Ready</div>
                <div>Generate final court bundle when all documents are approved</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Enhanced Review Interface */}
      {selectedDocument && (
        <div className="bg-card border border-border rounded-lg p-6 mb-6">
          <h3 className="text-lg font-semibold mb-4">
            Reviewing: {selectedDocument.title}
          </h3>
          <EnhancedReviewInterface
            caseId={caseId}
            documentId={selectedDocument.id}
          />
        </div>
      )}

      {/* Continue Button */}
      {allDocumentsReviewed && (
        <div className="flex gap-4">
          <Button
            onClick={() => approveAllMutation.mutate()}
            disabled={approveAllMutation.isPending}
            className="bg-green-600 hover:bg-green-700"
            data-testid="button-continue-to-court-submit"
          >
            {approveAllMutation.isPending ? (
              <>
                <i className="fas fa-spinner fa-spin mr-2"></i>
                Finalizing Review...
              </>
            ) : (
              <>
                Continue to Step 6: Court Submit
                <i className="fas fa-arrow-right ml-2"></i>
              </>
            )}
          </Button>
        </div>
      )}

      {/* Review Guidelines */}
      <div className="mt-8 bg-emerald-50 dark:bg-emerald-950 border border-emerald-200 dark:border-emerald-800 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <i className="fas fa-balance-scale text-emerald-500 mt-1"></i>
          <div>
            <h4 className="font-medium text-emerald-900 dark:text-emerald-100">Professional Review Standards</h4>
            <div className="text-sm text-emerald-700 dark:text-emerald-200 mt-2 space-y-1">
              <p>• <strong>Accuracy verification:</strong> Ensure all hyperlinks point to correct document sections</p>
              <p>• <strong>Legal relevance:</strong> Confirm links support the legal arguments being made</p>
              <p>• <strong>Court compliance:</strong> Verify hyperlinks meet court formatting requirements</p>
              <p>• <strong>Professional standards:</strong> Review maintains legal document integrity</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
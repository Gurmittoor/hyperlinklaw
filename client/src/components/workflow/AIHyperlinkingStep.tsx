import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import type { Document } from "@shared/schema";

interface AIHyperlinkingStepProps {
  caseId: string;
  documents: Document[];
  onHyperlinksGenerated: () => void;
}

export function AIHyperlinkingStep({ caseId, documents, onHyperlinksGenerated }: AIHyperlinkingStepProps) {
  const [selectedDocuments, setSelectedDocuments] = useState<string[]>([]);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Fetch detected index items
  const { data: indexData } = useQuery({
    queryKey: ["/api/documents/index-items", caseId],
    enabled: documents.some(doc => doc.ocrStatus === "completed"),
  });

  // Fetch hyperlink generation progress
  const { data: hyperlinkProgress } = useQuery({
    queryKey: ["/api/hyperlinks/progress", caseId],
    refetchInterval: 2000,
  });

  const generateHyperlinksMutation = useMutation({
    mutationFn: async () => {
      return apiRequest(`/api/hyperlinks/generate/${caseId}`, {
        method: "POST",
        body: { documentIds: selectedDocuments },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/hyperlinks/progress", caseId] });
      onHyperlinksGenerated();
      toast({
        title: "Hyperlinks Generated",
        description: "AI hyperlink detection completed successfully.",
      });
    },
    onError: (error) => {
      toast({
        title: "Generation Failed",
        description: `Failed to generate hyperlinks: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  const approveIndexMutation = useMutation({
    mutationFn: async (documentId: string) => {
      return apiRequest(`/api/documents/${documentId}/approve-index`, {
        method: "POST",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/documents/index-items", caseId] });
      toast({
        title: "Index Approved",
        description: "Document index has been approved for hyperlink generation.",
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
    const eligibleDocs = documents.filter(doc => doc.ocrStatus === "completed");
    setSelectedDocuments(eligibleDocs.map(doc => doc.id));
  };

  const handleSelectNone = () => {
    setSelectedDocuments([]);
  };

  const eligibleDocuments = documents.filter(doc => doc.ocrStatus === "completed");
  const documentsWithIndex = eligibleDocuments.filter(doc => doc.indexItems && doc.indexCount > 0);
  const allIndexesApproved = documentsWithIndex.every(doc => doc.indexStatus === "ok");
  const hyperlinksGenerated = hyperlinkProgress?.completed || false;

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-4">
          <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
            hyperlinksGenerated ? "bg-green-100 dark:bg-green-900" : 
            generateHyperlinksMutation.isPending ? "bg-blue-100 dark:bg-blue-900" : "bg-primary"
          }`}>
            <i className={`text-xl ${
              hyperlinksGenerated ? "fas fa-check text-green-600" :
              generateHyperlinksMutation.isPending ? "fas fa-spinner fa-spin text-blue-600" : "fas fa-link text-primary-foreground"
            }`}></i>
          </div>
          <div>
            <h1 className="text-3xl font-bold text-foreground">
              Step 4: AI Hyperlinking {hyperlinksGenerated ? "✅" : ""}
            </h1>
            <p className="text-lg text-muted-foreground">
              {hyperlinksGenerated 
                ? "Hyperlinks generated successfully - ready for review"
                : "Detect index items and generate hyperlinks between documents"
              }
            </p>
          </div>
        </div>
      </div>

      {/* Index Detection Results */}
      {documentsWithIndex.length > 0 && (
        <div className="bg-card border border-border rounded-lg p-6 mb-6">
          <h3 className="text-lg font-semibold mb-4">Detected Index Items</h3>
          <div className="space-y-4">
            {documentsWithIndex.map((doc) => (
              <div key={doc.id} className="border border-border rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <i className="fas fa-file-pdf text-red-500 text-lg"></i>
                    <div>
                      <div className="font-medium">{doc.title}</div>
                      <div className="text-sm text-muted-foreground">
                        {doc.indexCount} index items detected
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {doc.indexStatus === "ok" ? (
                      <span className="px-3 py-1 bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 rounded-full text-sm font-medium">
                        ✓ Approved
                      </span>
                    ) : (
                      <Button
                        size="sm"
                        onClick={() => approveIndexMutation.mutate(doc.id)}
                        disabled={approveIndexMutation.isPending}
                        data-testid={`button-approve-index-${doc.id}`}
                      >
                        {approveIndexMutation.isPending ? (
                          <i className="fas fa-spinner fa-spin mr-1"></i>
                        ) : (
                          <i className="fas fa-check mr-1"></i>
                        )}
                        Approve Index
                      </Button>
                    )}
                  </div>
                </div>

                {/* Index Items Preview */}
                {doc.indexItems && Array.isArray(doc.indexItems) && (
                  <div className="mt-3">
                    <div className="text-sm font-medium mb-2">Index Items:</div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                      {(doc.indexItems as any[]).slice(0, 6).map((item, index) => (
                        <div key={index} className="flex items-center gap-2 text-muted-foreground">
                          <i className="fas fa-chevron-right text-xs"></i>
                          <span>{item.text || item}</span>
                          {item.page && <span className="text-xs">(p. {item.page})</span>}
                        </div>
                      ))}
                      {(doc.indexItems as any[]).length > 6 && (
                        <div className="text-xs text-muted-foreground italic">
                          +{(doc.indexItems as any[]).length - 6} more items...
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Document Selection for Hyperlink Generation */}
      {allIndexesApproved && !hyperlinksGenerated && (
        <div className="bg-card border border-border rounded-lg p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold">Select Documents for Hyperlink Generation</h3>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={handleSelectAll}>
                Select All
              </Button>
              <Button size="sm" variant="outline" onClick={handleSelectNone}>
                Select None
              </Button>
            </div>
          </div>

          <div className="space-y-3">
            {eligibleDocuments.map((doc) => (
              <div key={doc.id} className="flex items-center gap-3 p-3 border border-border rounded">
                <Checkbox
                  checked={selectedDocuments.includes(doc.id)}
                  onCheckedChange={(checked) => handleDocumentToggle(doc.id, checked as boolean)}
                  data-testid={`checkbox-document-${doc.id}`}
                />
                <div className="flex items-center gap-3 flex-1">
                  <i className="fas fa-file-pdf text-red-500"></i>
                  <div>
                    <div className="font-medium">{doc.title}</div>
                    <div className="text-sm text-muted-foreground">
                      {doc.indexCount} index items • {doc.pageCount} pages
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {selectedDocuments.length > 0 && (
            <div className="mt-4 pt-4 border-t border-border">
              <Button
                onClick={() => generateHyperlinksMutation.mutate()}
                disabled={generateHyperlinksMutation.isPending}
                className="bg-primary hover:bg-primary/90"
                data-testid="button-generate-hyperlinks"
              >
                {generateHyperlinksMutation.isPending ? (
                  <>
                    <i className="fas fa-spinner fa-spin mr-2"></i>
                    Generating Hyperlinks...
                  </>
                ) : (
                  <>
                    <i className="fas fa-magic mr-2"></i>
                    Generate Hyperlinks ({selectedDocuments.length} documents)
                  </>
                )}
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Continue Button */}
      {hyperlinksGenerated && (
        <div className="flex gap-4">
          <Button
            className="bg-green-600 hover:bg-green-700"
            onClick={onHyperlinksGenerated}
            data-testid="button-continue-to-review"
          >
            Continue to Step 5: Lawyer Review
            <i className="fas fa-arrow-right ml-2"></i>
          </Button>
        </div>
      )}

      {/* AI Information */}
      <div className="mt-8 bg-purple-50 dark:bg-purple-950 border border-purple-200 dark:border-purple-800 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <i className="fas fa-robot text-purple-500 mt-1"></i>
          <div>
            <h4 className="font-medium text-purple-900 dark:text-purple-100">AI Hyperlink Detection</h4>
            <div className="text-sm text-purple-700 dark:text-purple-200 mt-2 space-y-1">
              <p>• <strong>Index-deterministic:</strong> Creates exactly as many hyperlinks as index items detected</p>
              <p>• <strong>Context-aware:</strong> Understands legal document structure and relationships</p>
              <p>• <strong>High precision:</strong> AI analyzes document content to create accurate cross-references</p>
              <p>• <strong>Lawyer approval:</strong> Index items require professional review before hyperlink generation</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
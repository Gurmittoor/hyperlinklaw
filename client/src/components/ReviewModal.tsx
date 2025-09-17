import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import type { Document, Link } from "@shared/schema";

interface ReviewModalProps {
  documentId: string;
  caseId: string;
  onClose: () => void;
}

export default function ReviewModal({ documentId, caseId, onClose }: ReviewModalProps) {
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedLinkId, setSelectedLinkId] = useState<string | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: document } = useQuery({
    queryKey: ['/api/documents', documentId],
    queryFn: () => api.documents.getById(documentId),
  });

  const { data: links = [] } = useQuery({
    queryKey: ['/api/documents', documentId, 'links'],
    queryFn: () => api.links.getByDocumentId(documentId),
  });

  const updateLinkMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Link> }) => 
      api.links.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/documents', documentId, 'links'] });
    },
  });

  const updateDocumentMutation = useMutation({
    mutationFn: (data: Partial<Document>) => 
      api.documents.update(documentId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/documents', documentId] });
      queryClient.invalidateQueries({ queryKey: ['/api/cases', caseId, 'documents'] });
    },
  });

  const regeneratePDFMutation = useMutation({
    mutationFn: () => api.documents.processHyperlinks([documentId]),
    onSuccess: () => {
      toast({
        title: "PDF Regeneration Started",
        description: "The document is being reprocessed with updated links",
      });
    },
  });

  const confirmLink = (linkId: string) => {
    updateLinkMutation.mutate({
      id: linkId,
      data: { status: 'confirmed' }
    });
  };

  const removeLink = (linkId: string) => {
    updateLinkMutation.mutate({
      id: linkId,
      data: { status: 'removed' }
    });
  };

  const markAsApproved = () => {
    updateDocumentMutation.mutate({ reviewStatus: 'approved' });
    toast({
      title: "Document Approved",
      description: "Document has been marked as court-ready",
    });
    onClose();
  };

  const regeneratePDF = () => {
    regeneratePDFMutation.mutate();
  };

  const nextPage = () => {
    if (document && currentPage < (document.pageCount || 1)) {
      setCurrentPage(currentPage + 1);
    }
  };

  const previousPage = () => {
    if (currentPage > 1) {
      setCurrentPage(currentPage - 1);
    }
  };

  const highlightLink = (linkId: string) => {
    setSelectedLinkId(linkId);
  };

  const confirmedLinks = links.filter(link => link.status === 'confirmed');
  const pendingLinks = links.filter(link => link.status === 'auto');

  if (!document) {
    return (
      <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center">
        <div className="text-center">
          <i className="fas fa-spinner fa-spin text-2xl text-muted-foreground mb-4"></i>
          <p className="text-muted-foreground">Loading document...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50" data-testid="review-modal">
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="bg-card border border-border rounded-lg w-full max-w-7xl h-[90vh] flex flex-col">
          {/* Modal Header */}
          <div className="flex items-center justify-between p-6 border-b border-border">
            <div>
              <h3 className="text-xl font-semibold text-foreground">Link Review - {document.originalName}</h3>
              <p className="text-sm text-muted-foreground mt-1">Review and edit hyperlinks before court submission</p>
            </div>
            <div className="flex items-center gap-3">
              <button 
                className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors flex items-center gap-2"
                onClick={regeneratePDF}
                disabled={regeneratePDFMutation.isPending}
                data-testid="button-regenerate-pdf"
              >
                <i className={`fas ${regeneratePDFMutation.isPending ? 'fa-spinner fa-spin' : 'fa-sync-alt'} mr-2`}></i>
                Regenerate PDF
              </button>
              <button 
                className="px-4 py-2 bg-secondary text-secondary-foreground rounded-md hover:bg-secondary/80 transition-colors flex items-center gap-2"
                onClick={markAsApproved}
                disabled={updateDocumentMutation.isPending}
                data-testid="button-mark-approved"
              >
                <i className="fas fa-check mr-2"></i>
                Mark as Approved
              </button>
              <button 
                className="p-2 hover:bg-secondary rounded text-muted-foreground hover:text-foreground transition-colors"
                onClick={onClose}
                data-testid="button-close-modal"
              >
                <i className="fas fa-times"></i>
              </button>
            </div>
          </div>

          {/* Split Screen Content */}
          <div className="flex-1 flex overflow-hidden">
            {/* PDF Viewer */}
            <div className="flex-1 bg-muted/30 p-4 overflow-auto" data-testid="pdf-viewer">
              <div className="bg-white rounded shadow-lg mx-auto" style={{ width: '600px', height: '800px', position: 'relative' }}>
                {/* PDF content placeholder */}
                <div className="w-full h-full flex items-center justify-center text-gray-400">
                  <div className="text-center">
                    <i className="fas fa-file-pdf text-6xl mb-4"></i>
                    <p className="text-lg font-medium">PDF Viewer</p>
                    <p className="text-sm">{document.originalName}</p>
                    <p className="text-xs mt-2">Page {currentPage} of {document.pageCount}</p>
                  </div>
                </div>
                
                {/* Link annotations overlay */}
                {links
                  .filter(link => link.srcPage === currentPage && link.bbox && link.status !== 'removed')
                  .map((link, index) => (
                    <div
                      key={link.id}
                      className={`link-annotation absolute rounded cursor-pointer ${
                        selectedLinkId === link.id ? 'bg-primary/30 border-primary' : ''
                      }`}
                      style={{
                        top: `${120 + index * 80}px`,
                        left: `${50 + index * 20}px`,
                        width: '180px',
                        height: '20px'
                      }}
                      title={`Link to page ${link.targetPage}`}
                      onClick={() => highlightLink(link.id)}
                      data-testid={`link-annotation-${link.id}`}
                    />
                  ))}
              </div>
              
              {/* PDF Navigation */}
              <div className="flex items-center justify-center gap-4 mt-4">
                <button 
                  className="p-2 bg-card border border-border rounded hover:bg-secondary transition-colors disabled:opacity-50"
                  onClick={previousPage}
                  disabled={currentPage === 1}
                  data-testid="button-previous-page"
                >
                  <i className="fas fa-chevron-left"></i>
                </button>
                <span className="text-sm text-muted-foreground" data-testid="page-info">
                  Page {currentPage} of {document.pageCount || 1}
                </span>
                <button 
                  className="p-2 bg-card border border-border rounded hover:bg-secondary transition-colors disabled:opacity-50"
                  onClick={nextPage}
                  disabled={currentPage === (document.pageCount || 1)}
                  data-testid="button-next-page"
                >
                  <i className="fas fa-chevron-right"></i>
                </button>
              </div>
            </div>

            {/* Links Panel */}
            <div className="w-96 border-l border-border bg-card/50 flex flex-col" data-testid="links-panel">
              <div className="p-4 border-b border-border">
                <h4 className="font-semibold text-foreground">Detected Links</h4>
                <p className="text-sm text-muted-foreground mt-1">{links.length} links found</p>
              </div>
              
              <div className="flex-1 overflow-auto p-4 space-y-3">
                {links.filter(link => link.status !== 'removed').map((link) => (
                  <div 
                    key={link.id} 
                    className={`bg-card border border-border rounded-lg p-4 hover:bg-secondary/50 transition-colors ${
                      selectedLinkId === link.id ? 'border-primary' : ''
                    }`}
                    data-testid={`link-item-${link.id}`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-xs px-2 py-1 bg-primary/20 text-primary rounded">
                            Page {link.srcPage}
                          </span>
                          <i className="fas fa-arrow-right text-muted-foreground text-xs"></i>
                          <span className="text-xs px-2 py-1 bg-accent/20 text-accent-foreground rounded">
                            Page {link.targetPage}
                          </span>
                        </div>
                        <p className="text-sm text-foreground font-medium">
                          Link reference detected
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {link.why || 'Reference found in document'}
                        </p>
                        <div className="flex items-center gap-2 mt-2">
                          <div className="flex items-center gap-1">
                            <i className="fas fa-brain text-primary text-xs"></i>
                            <span className="text-xs text-muted-foreground">
                              AI Confidence: {Math.round(parseFloat(link.confidence || "0") * 100)}%
                            </span>
                          </div>
                          {link.status === 'confirmed' && (
                            <span className="text-xs px-2 py-1 bg-green-500/20 text-green-400 rounded">
                              Confirmed
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-1 ml-2">
                        <button 
                          className={`p-1 hover:bg-secondary rounded text-green-400 hover:text-green-300 transition-colors ${
                            link.status === 'confirmed' ? 'opacity-50' : ''
                          }`}
                          title="Confirm Link"
                          onClick={() => confirmLink(link.id)}
                          disabled={link.status === 'confirmed'}
                          data-testid={`button-confirm-${link.id}`}
                        >
                          <i className="fas fa-check text-xs"></i>
                        </button>
                        <button 
                          className="p-1 hover:bg-secondary rounded text-red-400 hover:text-red-300 transition-colors"
                          title="Remove Link"
                          onClick={() => removeLink(link.id)}
                          data-testid={`button-remove-${link.id}`}
                        >
                          <i className="fas fa-times text-xs"></i>
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
                
                {links.filter(link => link.status !== 'removed').length === 0 && (
                  <div className="text-center p-8 text-muted-foreground">
                    <i className="fas fa-link text-2xl mb-4"></i>
                    <p>No links detected</p>
                  </div>
                )}
              </div>

              {/* Panel Footer */}
              <div className="p-4 border-t border-border">
                <div className="grid grid-cols-3 gap-2 text-center text-xs">
                  <div className="p-2 bg-muted/50 rounded">
                    <div className="font-medium text-foreground" data-testid="stat-total-links">
                      {links.filter(link => link.status !== 'removed').length}
                    </div>
                    <div className="text-muted-foreground">Total</div>
                  </div>
                  <div className="p-2 bg-green-500/20 rounded">
                    <div className="font-medium text-green-400" data-testid="stat-confirmed-links">
                      {confirmedLinks.length}
                    </div>
                    <div className="text-muted-foreground">Confirmed</div>
                  </div>
                  <div className="p-2 bg-primary/20 rounded">
                    <div className="font-medium text-primary" data-testid="stat-pending-links">
                      {pendingLinks.length}
                    </div>
                    <div className="text-muted-foreground">Pending</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

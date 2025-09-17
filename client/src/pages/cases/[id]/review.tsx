import { useState, useEffect } from 'react';
import { useRoute, useLocation } from 'wouter';
import { CheckCircle, AlertCircle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import OverallProgressHeader from '@/components/OverallProgressHeader';
import DocumentProgressCard from '@/components/DocumentProgressCard';
import { Chat } from '@/components/Chat';
import { useQuery } from '@tanstack/react-query';

interface Hyperlink {
  id: string;
  srcText: string;
  srcPage: number;
  targetPage: number;
  status?: 'pending' | 'approved' | 'rejected';
  sourceDocTitle?: string;
  targetDocTitle?: string;
  source_doc?: { title: string };
  target_doc?: { title: string };
  source_page?: number;
  target_page?: number;
}

export default function Review() {
  const [match] = useRoute('/cases/:caseId/review/:docId?');
  const [, setLocation] = useLocation();
  const caseId = match?.caseId;
  const docId = match?.docId;
  
  const [allHyperlinks, setAllHyperlinks] = useState<Hyperlink[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchHyperlinks = async () => {
      if (!caseId) return;
      
      try {
        let url = `/api/cases/${caseId}/links`;
        if (docId) {
          url = `/api/documents/${docId}/links`;
        }
        
        const response = await fetch(url);
        if (response.ok) {
          const links = await response.json();
          setAllHyperlinks(links || []);
        }
      } catch (error) {
        console.error('Error fetching hyperlinks:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchHyperlinks();
  }, [caseId, docId]);

  const handleLinkAction = async (linkId: string, action: 'approve' | 'reject') => {
    try {
      const response = await fetch(`/api/links/${linkId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: action === 'approve' ? 'approved' : 'rejected' })
      });
      
      if (response.ok) {
        setAllHyperlinks(prev => prev.map(link =>
          link.id === linkId 
            ? { ...link, status: action === 'approve' ? 'approved' : 'rejected' }
            : link
        ));
      }
    } catch (error) {
      console.error('Error updating link:', error);
    }
  };

  // Calculate statistics
  const stats = {
    total: allHyperlinks.length,
    pending: allHyperlinks.filter(l => !l.status || l.status === 'pending').length,
    approved: allHyperlinks.filter(l => l.status === 'approved').length,
    rejected: allHyperlinks.filter(l => l.status === 'rejected').length
  };

  // Loading state
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading hyperlinks...</p>
        </div>
      </div>
    );
  }

  // Get documents for this case
  const { data: documents = [] } = useQuery({
    queryKey: ['/api/cases', caseId, 'documents'],
    queryFn: async () => {
      const response = await fetch(`/api/cases/${caseId}/documents`);
      return response.ok ? response.json() : [];
    },
    enabled: !!caseId,
  });

  return (
    <div className="min-h-screen bg-background" data-testid="review-page">
      {/* Overall Progress Header */}
      <OverallProgressHeader caseId={caseId!} documents={documents} />

      {/* Action Header */}
      <div className="px-6 py-4 border-b border-border">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div>
            <p className="text-muted-foreground">Review and approve AI-generated hyperlinks</p>
          </div>
          <div className="flex items-center gap-3">
            <Button 
              onClick={() => setLocation(`/cases/${caseId}/reanalyze`)}
              variant="outline"
              className="flex items-center gap-2"
              data-testid="button-reanalyze"
            >
              <RefreshCw className="w-4 h-4" />
              Reanalyze Case
            </Button>
          </div>
        </div>
      </div>

      {/* Documents List with Progress */}
      <div className="max-w-7xl mx-auto p-6">
        <h2 className="text-xl font-semibold text-foreground mb-6">
          Documents ({documents.length})
        </h2>
        <div className="space-y-4">
          {documents.length === 0 ? (
            <div className="bg-card rounded-lg border p-8 text-center">
              <p className="text-muted-foreground">No documents found. Upload documents first.</p>
            </div>
          ) : (
            documents.map((doc: any) => (
              <DocumentProgressCard
                key={doc.id}
                document={doc}
                onReview={() => setLocation(`/cases/${caseId}/review/${doc.id}`)}
              />
            ))
          )}
        </div>
      </div>
      
      {/* Chat Assistant */}
      <Chat documentId={docId} caseId={caseId} />

    </div>
  );
}
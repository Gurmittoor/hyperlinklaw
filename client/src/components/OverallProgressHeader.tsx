import { useQuery } from '@tanstack/react-query';
import { CheckCircle, FileText, Clock } from 'lucide-react';
import type { Document, Link } from '@shared/schema';

interface OverallProgressHeaderProps {
  caseId: string;
  documents: Document[];
}

export default function OverallProgressHeader({ caseId, documents }: OverallProgressHeaderProps) {
  const { data: allLinks = [] } = useQuery({
    queryKey: ['/api/links'],
    queryFn: async () => {
      const response = await fetch('/api/links');
      return response.ok ? response.json() : [];
    },
    refetchInterval: 15000, // Refresh every 15 seconds to reduce server load
  });

  // Filter links for this case
  const caseLinks = allLinks.filter((link: Link) => 
    documents.some(doc => doc.id === link.srcDocId)
  );

  // Calculate overall progress
  const totalLinks = caseLinks.length;
  const approvedLinks = caseLinks.filter((link: Link) => link.status === 'approved').length;
  const rejectedLinks = caseLinks.filter((link: Link) => link.status === 'rejected').length;
  const pendingLinks = caseLinks.filter((link: Link) => link.status === 'pending' || !link.status).length;
  const processedLinks = approvedLinks + rejectedLinks;

  const overallPercentage = totalLinks > 0 
    ? Math.round((processedLinks / totalLinks) * 100)
    : 0;

  // Document processing status
  const documentsWithAI = documents.filter(doc => 
    doc.aiProcessingStatus === 'completed' || doc.aiProcessingStatus === 'processing'
  );
  const completedDocs = documents.filter(doc => doc.aiProcessingStatus === 'completed').length;
  const processingDocs = documents.filter(doc => doc.aiProcessingStatus === 'processing').length;

  const getProgressColor = () => {
    if (overallPercentage === 100) return 'bg-green-500';
    if (overallPercentage > 0) return 'bg-blue-500';
    return 'bg-gray-400';
  };

  const getProgressText = () => {
    if (totalLinks === 0) return 'No hyperlinks detected yet';
    if (overallPercentage === 100) return 'All hyperlinks reviewed!';
    if (processingDocs > 0) return `Processing ${processingDocs} document${processingDocs > 1 ? 's' : ''}...`;
    return 'Ready for review';
  };

  return (
    <div className="bg-card border-b border-border p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-3xl font-bold text-foreground">
            Hyperlink Review Dashboard
          </h1>
          <div className="flex items-center gap-8">
            {/* Document Status */}
            <div className="text-center">
              <div className="text-2xl font-bold text-foreground">
                {completedDocs}/{documents.length}
              </div>
              <div className="text-sm text-muted-foreground">Documents Processed</div>
            </div>
            {/* Total Links */}
            <div className="text-center">
              <div className="text-3xl font-bold text-foreground">
                {processedLinks}/{totalLinks}
              </div>
              <div className="text-sm text-muted-foreground">Total Hyperlinks</div>
            </div>
          </div>
        </div>

        {/* Master Progress Bar */}
        <div className="bg-muted rounded-lg p-6">
          <div className="flex justify-between items-center mb-3">
            <div className="flex items-center gap-3">
              {overallPercentage === 100 ? (
                <CheckCircle className="w-6 h-6 text-green-500" />
              ) : processingDocs > 0 ? (
                <Clock className="w-6 h-6 text-blue-500 animate-pulse" />
              ) : (
                <FileText className="w-6 h-6 text-muted-foreground" />
              )}
              <span className="text-lg font-semibold text-foreground">
                {getProgressText()}
              </span>
            </div>
            <span className="text-3xl font-bold text-foreground">
              {overallPercentage}%
            </span>
          </div>

          {/* Progress Bar */}
          <div className="w-full bg-background rounded-full h-4 mb-4">
            <div 
              className={`h-4 rounded-full transition-all duration-500 ${getProgressColor()} flex items-center justify-center`}
              style={{ width: `${overallPercentage}%` }}
            >
              {overallPercentage > 15 && (
                <span className="text-xs font-bold text-white">
                  {overallPercentage}%
                </span>
              )}
            </div>
          </div>
          
          {/* Breakdown Stats */}
          <div className="flex items-center gap-8">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-green-500 rounded-full"></div>
              <span className="text-muted-foreground">
                Approved: <span className="text-green-600 font-bold">{approvedLinks}</span>
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-yellow-500 rounded-full"></div>
              <span className="text-muted-foreground">
                Pending Review: <span className="text-yellow-600 font-bold">{pendingLinks}</span>
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-red-500 rounded-full"></div>
              <span className="text-muted-foreground">
                Rejected: <span className="text-red-600 font-bold">{rejectedLinks}</span>
              </span>
            </div>
            {processingDocs > 0 && (
              <>
                <div className="w-px h-4 bg-border"></div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-blue-500 rounded-full animate-pulse"></div>
                  <span className="text-muted-foreground">
                    Processing: <span className="text-blue-600 font-bold">{processingDocs} docs</span>
                  </span>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Completion Status */}
        {overallPercentage === 100 && totalLinks > 0 && (
          <div className="mt-4 bg-green-900/20 border border-green-500/30 rounded-lg p-4">
            <div className="flex items-center gap-3">
              <CheckCircle className="w-6 h-6 text-green-500" />
              <div>
                <p className="text-green-400 font-semibold">All hyperlinks processed!</p>
                <p className="text-green-300/80 text-sm">
                  Ready for final review and court submission
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
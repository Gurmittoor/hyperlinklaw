import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FileText, CheckCircle, Clock, AlertCircle } from 'lucide-react';
import type { Document, Link } from '@shared/schema';
import ReviewTRSubrule13 from './ReviewTRSubrule13';
import ReviewHyperlinksButtonInstant from './ReviewHyperlinksButtonInstant';

interface DocumentProgressCardProps {
  document: Document;
  onReview: () => void;
}

export default function DocumentProgressCard({ document, onReview }: DocumentProgressCardProps) {
  const { data: allLinks = [] } = useQuery({
    queryKey: ['/api/links'],
    queryFn: async () => {
      const response = await fetch('/api/links');
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return response.json();
    },
    staleTime: 5000, // Data is fresh for 5 seconds
    gcTime: 10000, // Keep in cache for 10 seconds
    retry: 3,
    refetchOnWindowFocus: false, // Prevent unnecessary refetches
  });

  // Filter links to only show those that originate from this document
  const documentLinks = allLinks.filter((link: Link) => link.srcDocId === document.id);

  // Calculate link counts
  const totalLinks = documentLinks.length;
  const approvedLinks = documentLinks.filter((link: Link) => link.status === 'approved').length;
  const rejectedLinks = documentLinks.filter((link: Link) => link.status === 'rejected').length;
  const pendingLinks = documentLinks.filter((link: Link) => link.status === 'pending' || !link.status).length;
  const processedLinks = approvedLinks + rejectedLinks;

  const progressPercentage = totalLinks > 0 
    ? Math.round((processedLinks / totalLinks) * 100)
    : 0;

  const getStatusIcon = () => {
    if (document.aiProcessingStatus === 'processing') {
      return <Clock className="w-5 h-5 text-blue-500 animate-pulse" />;
    }
    if (document.aiProcessingStatus === 'completed' && progressPercentage === 100) {
      return <CheckCircle className="w-5 h-5 text-green-500" />;
    }
    if (document.aiProcessingStatus === 'completed') {
      return <AlertCircle className="w-5 h-5 text-yellow-500" />;
    }
    if (document.aiProcessingStatus === 'failed') {
      return <AlertCircle className="w-5 h-5 text-red-500" />;
    }
    return <Clock className="w-5 h-5 text-gray-500" />;
  };

  const getStatusText = () => {
    if (document.aiProcessingStatus === 'processing') {
      return `AI analyzing... ${totalLinks > 0 ? `(${totalLinks} links found)` : ''}`;
    }
    if (document.aiProcessingStatus === 'completed') {
      return `AI complete - ${totalLinks} hyperlinks detected`;
    }
    if (document.aiProcessingStatus === 'failed') {
      return 'AI processing failed';
    }
    return 'Ready to process';
  };

  const getReviewButton = () => {
    // Determine which review component to show based on document name/type
    if (document.title.includes('Supp Doc Brief') || document.title.includes('Supp Brief')) {
      return <ReviewHyperlinksButtonInstant docKey="supp13" />;
    }
    if (document.title.includes('Doc Brief') && !document.title.includes('Supp')) {
      return <ReviewHyperlinksButtonInstant docKey="doc63" />;
    }
    if (document.title.includes('Trial Record')) {
      return <ReviewHyperlinksButtonInstant docKey="trial13" />;
    }
    
    // Fallback to original button for other documents
    return (
      <button
        onClick={onReview}
        className="px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg transition-colors"
        data-testid={`button-review-${document.id}`}
      >
        {totalLinks > 0 ? 'Review Hyperlinks' : 'View Document'}
      </button>
    );
  };

  const getProgressColor = () => {
    if (progressPercentage === 100) return 'bg-green-500';
    if (progressPercentage > 0) return 'bg-blue-500';
    return 'bg-gray-400';
  };

  return (
    <div className="bg-card rounded-lg p-6 border hover:border-primary/20 transition-colors">
      <div className="flex items-start justify-between">
        {/* Document Info */}
        <div className="flex items-start gap-4 flex-1">
          <FileText className="w-6 h-6 text-muted-foreground mt-1" />
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-foreground">{document.title}</h3>
            <p className="text-sm text-muted-foreground mb-4">
              {document.originalName} • {(document.fileSize / 1024 / 1024).toFixed(1)} MB
            </p>

            {/* Status */}
            <div className="flex items-center gap-2 mb-4">
              {getStatusIcon()}
              <span className="text-sm text-muted-foreground">
                {getStatusText()}
              </span>
            </div>

            {/* Progress Bar */}
            {totalLinks > 0 && (
              <div className="mb-4">
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-foreground font-medium">
                    Hyperlink Review Progress
                  </span>
                  <span className="text-foreground font-bold">
                    {processedLinks}/{totalLinks} ({progressPercentage}%)
                  </span>
                </div>
                <div className="w-full bg-muted rounded-full h-3">
                  <div 
                    className={`h-3 rounded-full transition-all duration-500 ${getProgressColor()}`}
                    style={{ width: `${progressPercentage}%` }}
                  />
                </div>

                {/* Detailed Breakdown */}
                <div className="flex items-center gap-6 mt-3 text-sm">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                    <span className="text-muted-foreground">
                      Approved: <span className="text-green-600 font-semibold">{approvedLinks}</span>
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 bg-yellow-500 rounded-full"></div>
                    <span className="text-muted-foreground">
                      Pending: <span className="text-yellow-600 font-semibold">{pendingLinks}</span>
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 bg-red-500 rounded-full"></div>
                    <span className="text-muted-foreground">
                      Rejected: <span className="text-red-600 font-semibold">{rejectedLinks}</span>
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Action Button */}
        <div className="ml-4">
          {getReviewButton()}
        </div>
      </div>
    </div>
  );
}
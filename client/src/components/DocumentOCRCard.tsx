import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import type { Document } from '@shared/schema';
import { FileText, Play, RotateCcw, Pause } from 'lucide-react';

interface DocumentOCRCardProps {
  document: Document;
  caseId: string;
}

export function DocumentOCRCard({ document, caseId }: DocumentOCRCardProps) {
  const { toast } = useToast();
  const [isProcessing, setIsProcessing] = useState(false);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-green-500';
      case 'processing':
        return 'bg-blue-500';
      case 'failed':
        return 'bg-red-500';
      case 'queued':
        return 'bg-yellow-500';
      default:
        return 'bg-gray-500';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'completed':
        return 'Completed';
      case 'processing':
        return 'Processing';
      case 'failed':
        return 'Failed';
      case 'queued':
        return 'Queued';
      default:
        return 'Ready';
    }
  };

  // Calculate progress for THIS document only
  const totalPages = document.pageCount || 0;
  const completedPages = document.ocrPagesDone || 0;
  const progressPercent = totalPages > 0 ? Math.round((completedPages / totalPages) * 100) : 0;

  // Start parallel OCR for THIS document only
  const startOcrMutation = useMutation({
    mutationFn: async () => {
      setIsProcessing(true);
      console.log(`🚀 Starting parallel OCR for individual document: ${document.id}`);
      
      const response = await fetch(`/api/documents/${document.id}/parallel-ocr`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          batchSize: 50,
          maxConcurrent: 10
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to start OCR');
      }

      return response.json();
    },
    onSuccess: (data) => {
      console.log(`✅ OCR Started for ${document.title}:`, data);
      toast({
        title: "✅ OCR Processing Started",
        description: `Processing ${document.title} (${totalPages} pages) in parallel batches`,
      });
      queryClient.invalidateQueries({ queryKey: [`/api/cases/${caseId}/documents`] });
      queryClient.invalidateQueries({ queryKey: [`/api/documents/${document.id}/batches`] });
    },
    onError: (error) => {
      setIsProcessing(false);
      console.error(`❌ OCR Failed for ${document.title}:`, error);
      toast({
        title: "❌ Failed to Start OCR",
        description: error instanceof Error ? error.message : "Could not start OCR processing",
        variant: "destructive",
      });
    },
  });

  // Reset OCR for THIS document only
  const resetOcrMutation = useMutation({
    mutationFn: async () => {
      await apiRequest('POST', `/api/documents/${document.id}/reset-ocr`, {});
    },
    onSuccess: () => {
      toast({
        title: "OCR Reset",
        description: `${document.title} has been reset and is ready for re-processing.`,
      });
      queryClient.invalidateQueries({ queryKey: [`/api/cases/${caseId}/documents`] });
      queryClient.invalidateQueries({ queryKey: [`/api/documents/${document.id}/batches`] });
    },
    onError: (error) => {
      toast({
        title: "Failed to Reset OCR",
        description: error instanceof Error ? error.message : "Could not reset OCR status",
        variant: "destructive",
      });
    },
  });

  const handleStartOCR = () => {
    startOcrMutation.mutate();
  };

  const handleResetOCR = () => {
    resetOcrMutation.mutate();
  };

  return (
    <Card className="w-full" data-testid={`document-ocr-card-${document.id}`}>
      <CardHeader>
        <CardTitle className="flex items-center gap-3">
          <FileText className="h-5 w-5" />
          <div className="flex-1">
            <div className="text-lg font-semibold text-white">
              {document.title}
            </div>
            <div className="text-sm text-gray-400">
              {totalPages} pages total
            </div>
          </div>
          <Badge 
            className={`${getStatusColor(document.ocrStatus || 'ready')} text-white`}
            data-testid={`status-${document.id}`}
          >
            {getStatusText(document.ocrStatus || 'ready')}
          </Badge>
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Individual Progress for THIS document */}
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span>Progress</span>
            <span data-testid={`progress-text-${document.id}`}>
              {completedPages}/{totalPages} pages ({progressPercent}%)
            </span>
          </div>
          <Progress 
            value={progressPercent} 
            className="w-full" 
            data-testid={`progress-bar-${document.id}`}
          />
        </div>

        {/* Confidence Score */}
        {document.ocrConfidenceAvg && (
          <div className="text-sm">
            <span className="text-gray-400">Confidence: </span>
            <span className="text-green-400" data-testid={`confidence-${document.id}`}>
              {document.ocrConfidenceAvg}%
            </span>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-2">
          {document.ocrStatus !== 'processing' && document.ocrStatus !== 'queued' && (
            <Button
              onClick={handleStartOCR}
              disabled={startOcrMutation.isPending || isProcessing}
              className="bg-blue-600 hover:bg-blue-700"
              data-testid={`button-start-ocr-${document.id}`}
            >
              <Play className="h-4 w-4 mr-2" />
              {startOcrMutation.isPending || isProcessing ? 'Starting...' : 'Start Parallel OCR'}
            </Button>
          )}

          {document.ocrStatus === 'failed' && (
            <Button
              onClick={handleResetOCR}
              disabled={resetOcrMutation.isPending}
              variant="outline"
              data-testid={`button-reset-ocr-${document.id}`}
            >
              <RotateCcw className="h-4 w-4 mr-2" />
              {resetOcrMutation.isPending ? 'Resetting...' : 'Reset & Retry'}
            </Button>
          )}

          {(document.ocrStatus === 'processing' || document.ocrStatus === 'queued') && (
            <Button
              variant="outline"
              disabled
              data-testid={`button-processing-${document.id}`}
            >
              <Pause className="h-4 w-4 mr-2" />
              Processing...
            </Button>
          )}
        </div>

        {/* Processing Time */}
        {document.ocrStartedAt && (
          <div className="text-xs text-gray-500">
            Started: {new Date(document.ocrStartedAt).toLocaleString()}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
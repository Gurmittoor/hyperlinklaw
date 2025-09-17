import React from "react";
import { useOcrProgress } from "@/hooks/useOcrProgress";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { FileText, CheckCircle, XCircle, Clock, Loader2 } from "lucide-react";

interface OcrProgressBarProps {
  documentId: string;
  className?: string;
  isParallelMode?: boolean;
  processingSpeed?: number; // pages per minute
}

export function OcrProgressBar({ documentId, className, isParallelMode = false, processingSpeed }: OcrProgressBarProps) {
  const { status, done, total, percent, etaMs } = useOcrProgress(documentId);

  // Don't show progress for completed or unknown status
  if (status === null || status === "completed") {
    return null;
  }

  // Show progress bar for any active OCR status
  const shouldShowProgress = status && ["pending", "working", "failed"].includes(status);
  
  if (!shouldShowProgress) {
    return null;
  }


  const getStatusConfig = (currentStatus: string) => {
    switch (currentStatus) {
      case "working":
        return {
          icon: <Loader2 className="w-5 h-5 text-orange-500 animate-spin" />,
          color: isParallelMode ? "bg-gradient-to-r from-yellow-50 to-orange-50 border-orange-300" : "bg-orange-50 border-orange-200",
          textColor: isParallelMode ? "text-orange-800" : "text-orange-700",
          title: isParallelMode ? "🚀 PARALLEL OCR PROCESSING" : "⚡ OCR PROCESSING",
          subtitle: isParallelMode ? `Processing ${done}/${total} pages with Vision API` : `Processing page ${done} of ${total}`,
          bgGradient: isParallelMode ? "bg-gradient-to-r from-yellow-100 to-orange-200" : "bg-gradient-to-r from-orange-50 to-orange-100"
        };
      case "pending":
        return {
          icon: <Clock className="w-5 h-5 text-blue-500 animate-pulse" />,
          color: "bg-blue-50 border-blue-200",
          textColor: "text-blue-700",
          title: "📋 OCR QUEUED",
          subtitle: "Waiting for processing to begin",
          bgGradient: "bg-gradient-to-r from-blue-50 to-blue-100"
        };
      case "failed":
        return {
          icon: <XCircle className="w-5 h-5 text-red-500" />,
          color: "bg-red-50 border-red-200",
          textColor: "text-red-700",
          title: "❌ OCR FAILED",
          subtitle: "Processing encountered an error",
          bgGradient: "bg-gradient-to-r from-red-50 to-red-100"
        };
      default:
        return {
          icon: <FileText className="w-5 h-5 text-gray-500" />,
          color: "bg-gray-50 border-gray-200",
          textColor: "text-gray-700",
          title: "📄 OCR STATUS",
          subtitle: "Initializing...",
          bgGradient: "bg-gradient-to-r from-gray-50 to-gray-100"
        };
    }
  };

  const statusConfig = getStatusConfig(status);
  const progressPercentage = total > 0 ? Math.round((done / total) * 100) : 0;

  const formatEta = (etaMs?: number) => {
    if (!etaMs || etaMs <= 0) return null;
    
    const minutes = Math.floor(etaMs / 60000);
    const seconds = Math.floor((etaMs % 60000) / 1000);
    
    if (minutes > 0) {
      return `~${minutes}m ${seconds}s remaining`;
    }
    return `~${seconds}s remaining`;
  };

  return (
    <div className={cn("border rounded-lg overflow-hidden shadow-sm", statusConfig.color, className)} data-testid="ocr-progress-card">
      {/* Header Section */}
      <div className={`p-4 ${statusConfig.bgGradient} border-b border-current/20`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {statusConfig.icon}
            <div>
              <div className={`font-bold text-lg ${statusConfig.textColor}`}>
                {statusConfig.title}
              </div>
              <div className="text-sm text-gray-600">
                {statusConfig.subtitle}
              </div>
              {/* PARALLEL PROCESSING INDICATORS */}
              {isParallelMode && (
                <div className="flex items-center gap-2 mt-2">
                  <div className="px-3 py-1 rounded-full text-xs font-bold bg-gradient-to-r from-yellow-400 to-orange-500 text-white shadow-lg animate-pulse">
                    🚀 PARALLEL MODE
                  </div>
                  <div className="px-2 py-1 rounded bg-blue-100 text-blue-800 text-xs font-medium">
                    Vision API
                  </div>
                  {processingSpeed && processingSpeed > 0 && (
                    <div className="px-2 py-1 rounded bg-green-100 text-green-800 text-xs font-medium">
                      {Math.round(processingSpeed)} pages/min
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
          
          {/* Large Progress Percentage */}
          <div className="text-right">
            <div className={`text-3xl font-bold ${statusConfig.textColor}`}>
              {progressPercentage}%
            </div>
            {etaMs && etaMs > 0 && (
              <div className="text-sm text-gray-500">
                {formatEta(etaMs)}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Progress Section */}
      <div className="p-4 space-y-3">
        {/* Large Page Count Display */}
        <div className="text-center">
          <div className="text-2xl font-bold text-blue-600">
            {status === "working" ? (
              <span>📄 {done} of {total} pages processed</span>
            ) : status === "pending" ? (
              <span>📋 {total} pages ready to process</span>
            ) : (
              <span>⏳ Preparing {total} pages...</span>
            )}
          </div>
        </div>

        {/* Progress Bar */}
        {total > 0 && (
          <div className="space-y-2">
            <Progress
              value={Math.min(Math.max(progressPercentage, 0), 100)}
              className="h-3"
              data-testid="ocr-progress-bar"
            />
            
            {/* Progress Details */}
            <div className="flex justify-center text-sm text-gray-500">
              <span data-testid="progress-percentage">
                {progressPercentage}% complete
              </span>
            </div>
          </div>
        )}

        {/* Processing Steps Indicator */}
        <div className="flex items-center justify-center gap-4 text-sm text-gray-500">
          <div className="flex items-center gap-2">
            <div className={`w-3 h-3 rounded-full ${
              status === "working" ? "bg-blue-500" : "bg-gray-300"
            }`} />
            <span>{isParallelMode ? "Parallel OCR" : "OCR"}</span>
          </div>
          <span>→</span>
          <div className="flex items-center gap-2">
            <div className={`w-3 h-3 rounded-full ${
              done > 0 ? "bg-blue-500" : "bg-gray-300"
            }`} />
            <span>Index</span>
          </div>
          <span>→</span>
          <div className="flex items-center gap-2">
            <div className={`w-3 h-3 rounded-full ${
              percent >= 100 ? "bg-green-500" : "bg-gray-300"
            }`} />
            <span>Links</span>
          </div>
        </div>
      </div>
    </div>
  );
}
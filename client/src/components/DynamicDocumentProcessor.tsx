import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { 
  Search, 
  FileText, 
  Link as LinkIcon, 
  Download, 
  AlertCircle, 
  CheckCircle, 
  Loader, 
  Eye,
  Settings,
  Zap
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';

interface IndexDetectionResult {
  ok: boolean;
  total_items: number;
  items: Array<{
    text: string;
    value: string;
    type: string;
    page: number;
  }>;
  item_types: Record<string, number>;
  index_pages: number[];
  document_path: string;
}

interface ProcessingResult {
  ok: boolean;
  message: string;
  results?: {
    total: number;
    validation?: any;
    review?: any;
  };
  outputDir?: string;
  stdout?: string;
}

export function DynamicDocumentProcessor() {
  const [briefPath, setBriefPath] = useState('');
  const [trialPath, setTrialPath] = useState('');
  const [indexPages, setIndexPages] = useState('');
  const [indexOnly, setIndexOnly] = useState(false);
  const [previewMode, setPreviewMode] = useState(false);
  
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Index detection mutation (preview mode)
  const detectIndexMutation = useMutation({
    mutationFn: async (data: { documentPath: string; indexPages?: string }) => {
      return await apiRequest('/api/detect-index', {
        method: 'POST',
        body: JSON.stringify(data)
      });
    },
    onSuccess: (data: IndexDetectionResult) => {
      if (data.ok) {
        toast({
          title: "Index Detection Complete",
          description: `Found ${data.total_items} index items across ${data.index_pages.length} pages`,
        });
      } else {
        toast({
          title: "Detection Failed",
          description: "Could not detect index items in the document",
          variant: "destructive",
        });
      }
    },
    onError: (error) => {
      console.error('Index detection error:', error);
      toast({
        title: "Detection Error",
        description: "An error occurred during index detection",
        variant: "destructive",
      });
    }
  });

  // Document processing mutation
  const processDocumentMutation = useMutation({
    mutationFn: async (data: {
      briefPath: string;
      trialPath?: string;
      indexPages?: string;
      indexOnly?: boolean;
      reviewJson?: boolean;
    }) => {
      return await apiRequest('/api/build-document-dynamic', {
        method: 'POST',
        body: JSON.stringify(data)
      });
    },
    onSuccess: (data: ProcessingResult) => {
      if (data.ok) {
        toast({
          title: "Processing Complete",
          description: `Successfully processed document with ${data.results?.total || 0} hyperlinks`,
        });
        queryClient.invalidateQueries({ queryKey: ['/api/links'] });
        queryClient.invalidateQueries({ queryKey: ['/api/deterministic-status'] });
      } else {
        toast({
          title: "Processing Failed",
          description: data.message || "Document processing failed",
          variant: "destructive",
        });
      }
    },
    onError: (error) => {
      console.error('Processing error:', error);
      toast({
        title: "Processing Error",
        description: "An error occurred during document processing",
        variant: "destructive",
      });
    }
  });

  const handleDetectIndex = () => {
    if (!briefPath.trim()) {
      toast({
        title: "Missing Document",
        description: "Please provide a document path",
        variant: "destructive",
      });
      return;
    }

    detectIndexMutation.mutate({
      documentPath: briefPath.trim(),
      indexPages: indexPages.trim() || undefined
    });
  };

  const handleProcessDocument = () => {
    if (!briefPath.trim()) {
      toast({
        title: "Missing Document",
        description: "Please provide a brief document path",
        variant: "destructive",
      });
      return;
    }

    processDocumentMutation.mutate({
      briefPath: briefPath.trim(),
      trialPath: trialPath.trim() || undefined,
      indexPages: indexPages.trim() || undefined,
      indexOnly,
      reviewJson: true
    });
  };

  const renderIndexResults = (data: IndexDetectionResult) => {
    if (!data || !data.ok) return null;

    return (
      <div className="space-y-4">
        <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-white">Index Detection Results</h3>
            <Badge variant="secondary" className="bg-green-600">
              {data.total_items} items found
            </Badge>
          </div>
          
          {/* Summary */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            <div className="bg-slate-700 rounded p-3">
              <div className="text-2xl font-bold text-white">{data.total_items}</div>
              <div className="text-sm text-gray-400">Total Items</div>
            </div>
            <div className="bg-slate-700 rounded p-3">
              <div className="text-2xl font-bold text-blue-400">{data.index_pages.length}</div>
              <div className="text-sm text-gray-400">Index Pages</div>
            </div>
            <div className="bg-slate-700 rounded p-3">
              <div className="text-2xl font-bold text-purple-400">{Object.keys(data.item_types).length}</div>
              <div className="text-sm text-gray-400">Item Types</div>
            </div>
            <div className="bg-slate-700 rounded p-3">
              <div className="text-lg font-bold text-green-400">Pages {data.index_pages.join(', ')}</div>
              <div className="text-sm text-gray-400">Found On</div>
            </div>
          </div>

          {/* Item Types Breakdown */}
          <div className="mb-4">
            <h4 className="text-md font-medium text-white mb-2">Item Types:</h4>
            <div className="flex flex-wrap gap-2">
              {Object.entries(data.item_types).map(([type, count]) => (
                <Badge key={type} variant="outline" className="text-white border-slate-600">
                  {type}: {count}
                </Badge>
              ))}
            </div>
          </div>

          {/* Sample Items */}
          {data.items && data.items.length > 0 && (
            <div>
              <h4 className="text-md font-medium text-white mb-2">Sample Items:</h4>
              <div className="bg-slate-900 rounded p-3 max-h-40 overflow-y-auto">
                {data.items.slice(0, 10).map((item, index) => (
                  <div key={index} className="flex justify-between text-sm py-1 border-b border-slate-700 last:border-b-0">
                    <span className="text-gray-300">{item.text}</span>
                    <div className="flex gap-2">
                      <Badge variant="secondary" className="text-xs">
                        {item.type}
                      </Badge>
                      <span className="text-gray-400">p.{item.page}</span>
                    </div>
                  </div>
                ))}
                {data.items.length > 10 && (
                  <div className="text-center text-gray-400 text-sm pt-2">
                    ... and {data.items.length - 10} more items
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderProcessingResults = (data: ProcessingResult) => {
    if (!data || !data.ok) return null;

    return (
      <div className="space-y-4">
        <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-white">Processing Results</h3>
            <Badge variant="secondary" className="bg-green-600">
              {data.results?.total || 0} hyperlinks created
            </Badge>
          </div>

          <div className="grid grid-cols-2 gap-4 mb-4">
            <div className="bg-slate-700 rounded p-3">
              <div className="text-2xl font-bold text-white">{data.results?.total || 0}</div>
              <div className="text-sm text-gray-400">Hyperlinks Created</div>
            </div>
            <div className="bg-slate-700 rounded p-3">
              <div className="text-lg font-bold text-blue-400">
                {data.outputDir?.split('/').pop() || 'Dynamic'}
              </div>
              <div className="text-sm text-gray-400">Output Directory</div>
            </div>
          </div>

          {data.outputDir && (
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                asChild
                className="text-white border-slate-600 hover:bg-slate-700"
              >
                <a
                  href={`/${data.outputDir}/review.json`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Eye className="w-4 h-4 mr-2" />
                  View Review JSON
                </a>
              </Button>
              
              <Button
                variant="outline"
                size="sm"
                asChild
                className="text-white border-slate-600 hover:bg-slate-700"
              >
                <a
                  href={`/${data.outputDir}/Master.Dynamic.linked.pdf`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Download className="w-4 h-4 mr-2" />
                  Download Linked PDF
                </a>
              </Button>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <Card className="w-full bg-slate-900 border-slate-700">
      <CardHeader>
        <CardTitle className="flex items-center text-white">
          <Zap className="mr-3 text-yellow-400" />
          Dynamic Document Processor
        </CardTitle>
        <CardDescription className="text-gray-400">
          Automatically detect and process hyperlinks in any legal document with varying index sizes
        </CardDescription>
      </CardHeader>
      
      <CardContent className="space-y-6">
        {/* Input Form */}
        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="briefPath" className="text-white">Brief Document Path *</Label>
            <Input
              id="briefPath"
              value={briefPath}
              onChange={(e) => setBriefPath(e.target.value)}
              placeholder="e.g., uploads/my-brief.pdf"
              className="bg-slate-800 border-slate-600 text-white"
              data-testid="input-brief-path"
            />
          </div>
          
          <div className="grid gap-2">
            <Label htmlFor="trialPath" className="text-white">Trial Document Path (Optional)</Label>
            <Input
              id="trialPath"
              value={trialPath}
              onChange={(e) => setTrialPath(e.target.value)}
              placeholder="e.g., uploads/trial-record.pdf"
              className="bg-slate-800 border-slate-600 text-white"
              data-testid="input-trial-path"
            />
          </div>
          
          <div className="grid gap-2">
            <Label htmlFor="indexPages" className="text-white">Index Pages (Optional)</Label>
            <Input
              id="indexPages"
              value={indexPages}
              onChange={(e) => setIndexPages(e.target.value)}
              placeholder="e.g., 2,3,4 or 2-5"
              className="bg-slate-800 border-slate-600 text-white"
              data-testid="input-index-pages"
            />
          </div>

          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-white cursor-pointer">
              <input
                type="checkbox"
                checked={indexOnly}
                onChange={(e) => setIndexOnly(e.target.checked)}
                className="rounded border-slate-600"
                data-testid="checkbox-index-only"
              />
              Index detection only (no hyperlink processing)
            </label>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3">
          <Button
            onClick={handleDetectIndex}
            disabled={detectIndexMutation.isPending}
            variant="outline"
            className="text-white border-slate-600 hover:bg-slate-700"
            data-testid="button-detect-index"
          >
            {detectIndexMutation.isPending ? (
              <Loader className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Search className="w-4 h-4 mr-2" />
            )}
            Detect Index Items
          </Button>

          <Button
            onClick={handleProcessDocument}
            disabled={processDocumentMutation.isPending}
            className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500"
            data-testid="button-process-document"
          >
            {processDocumentMutation.isPending ? (
              <Loader className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <LinkIcon className="w-4 h-4 mr-2" />
            )}
            Process Document
          </Button>
        </div>

        {/* Results Display */}
        {detectIndexMutation.data && renderIndexResults(detectIndexMutation.data)}
        {processDocumentMutation.data && renderProcessingResults(processDocumentMutation.data)}

        {/* Loading States */}
        {(detectIndexMutation.isPending || processDocumentMutation.isPending) && (
          <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
            <div className="flex items-center justify-center space-x-3">
              <Loader className="w-6 h-6 animate-spin text-blue-400" />
              <span className="text-white">
                {detectIndexMutation.isPending ? 'Detecting index items...' : 'Processing document...'}
              </span>
            </div>
          </div>
        )}

        {/* Error Display */}
        {(detectIndexMutation.error || processDocumentMutation.error) && (
          <div className="bg-red-900/20 border border-red-500/30 rounded-lg p-4">
            <div className="flex items-center space-x-2 text-red-300">
              <AlertCircle className="w-5 h-5" />
              <span>
                {detectIndexMutation.error ? 'Index detection failed' : 'Document processing failed'}
              </span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
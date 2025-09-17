import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CheckCircle, XCircle, Upload, Download, FileText, Scale, Zap, Search } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface ProcessingResult {
  status: 'success' | 'warning' | 'error';
  message: string;
  total_references: number;
  high_confidence: number;
  needs_review: number;
  by_type: Record<string, number>;
  validation: {
    broken_links: number;
    court_ready: boolean;
    summary: {
      status: string;
      message: string;
    };
  };
  downloads: {
    master_pdf: string;
    candidate_map_json: string;
    candidate_map_csv: string;
    validation_report: string;
  };
  processing_info: {
    timestamp: string;
    brief_count: number;
    model_used: string;
    min_confidence: number;
  };
}

export default function InstantProcessor() {
  const [allFiles, setAllFiles] = useState<FileList | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<Set<number>>(new Set());
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState<ProcessingResult | null>(null);
  const [minConfidence, setMinConfidence] = useState(0.92);
  const [useGPT5, setUseGPT5] = useState(true);
  const { toast } = useToast();

  const handleFilesChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 10) {
      toast({
        title: "Too Many Files",
        description: "Please upload maximum 10 documents to prevent processing overload",
        variant: "destructive",
      });
      e.target.value = ''; // Reset the input
      return;
    }
    setAllFiles(files);
    // Auto-select all files when uploaded
    if (files) {
      const allIndices = Array.from({ length: files.length }, (_, i) => i);
      setSelectedFiles(new Set(allIndices));
    }
  };

  const toggleFileSelection = (index: number) => {
    const newSelected = new Set(selectedFiles);
    if (newSelected.has(index)) {
      newSelected.delete(index);
    } else {
      newSelected.add(index);
    }
    setSelectedFiles(newSelected);
  };

  const selectAllFiles = () => {
    if (allFiles) {
      const allIndices = Array.from({ length: allFiles.length }, (_, i) => i);
      setSelectedFiles(new Set(allIndices));
    }
  };

  const deselectAllFiles = () => {
    setSelectedFiles(new Set());
  };

  const processDocuments = async () => {
    if (!allFiles || allFiles.length === 0) {
      toast({
        title: "Missing Files",
        description: "Please upload files first",
        variant: "destructive",
      });
      return;
    }

    if (selectedFiles.size === 0) {
      toast({
        title: "No Files Selected",
        description: "Please select at least 2 documents to process",
        variant: "destructive",
      });
      return;
    }

    if (selectedFiles.size < 1) {
      toast({
        title: "No Files Selected",
        description: "Please select at least 1 document to process",
        variant: "destructive",
      });
      return;
    }

    setIsProcessing(true);
    setResult(null);

    try {
      const formData = new FormData();
      const selectedFileArray = Array.from(selectedFiles).sort((a, b) => a - b);
      
      if (selectedFileArray.length === 1) {
        // Single file: use as trial record only
        formData.append('trial_record', allFiles[selectedFileArray[0]]);
      } else {
        // Multiple files: first ones as brief files, last as trial record
        for (let i = 0; i < selectedFileArray.length - 1; i++) {
          const fileIndex = selectedFileArray[i];
          formData.append('brief_files', allFiles[fileIndex]);
        }
        
        // Add the last selected file as trial record
        const lastFileIndex = selectedFileArray[selectedFileArray.length - 1];
        formData.append('trial_record', allFiles[lastFileIndex]);
      }
      
      // Add parameters
      formData.append('min_confidence', minConfidence.toString());
      formData.append('use_gpt5', useGPT5.toString());
      formData.append('model', 'gpt-5');
      formData.append('seed', '42');

      const response = await fetch('/api/instant', {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        throw new Error(`Processing failed: ${response.statusText}`);
      }

      const processingResult = await response.json();
      setResult(processingResult);

      if (processingResult.status === 'success') {
        toast({
          title: "🎉 Master PDF Ready!",
          description: "Court-ready PDF with internal hyperlinks created successfully",
        });
      } else if (processingResult.status === 'warning') {
        toast({
          title: "⚠️ Processing Complete with Warnings",
          description: processingResult.message,
          variant: "destructive",
        });
      }

    } catch (error) {
      console.error('Processing error:', error);
      toast({
        title: "Processing Failed",
        description: error instanceof Error ? error.message : "Unknown error occurred",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const downloadFile = (path: string, filename: string) => {
    window.open(path, '_blank');
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="text-center">
        <h1 className="text-4xl font-bold mb-2">Instant Court-Ready PDF Processor</h1>
        <p className="text-xl text-gray-600">
          Upload your legal documents and get a Master PDF with internal hyperlinks in minutes
        </p>
      </div>

      {/* Configuration */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-yellow-500" />
            Processing Configuration
          </CardTitle>
          <CardDescription>
            AI powered with deterministic settings for court-ready results
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Minimum Confidence</label>
              <select 
                value={minConfidence} 
                onChange={(e) => setMinConfidence(parseFloat(e.target.value))}
                className="w-full p-2 border rounded bg-background text-foreground"
              >
                <option value={0.90}>90% - More links</option>
                <option value={0.92}>92% - Recommended</option>
                <option value={0.95}>95% - High precision</option>
                <option value={1.00}>100% - Exact matches only</option>
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">AI Model</label>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={useGPT5}
                  onChange={(e) => setUseGPT5(e.target.checked)}
                />
                <span className="text-foreground">Use AI-Powered analysis for ambiguous references</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* File Upload - Single Area */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="w-5 h-5 text-blue-500" />
            Document Upload
          </CardTitle>
          <CardDescription>
            Upload all documents at once (Brief files + Trial Record). Maximum 10 files to prevent processing overload. 
            <br />
            <span className="text-amber-600 dark:text-amber-400 font-medium">Note: Last file will be treated as Trial Record</span>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <input
            type="file"
            accept=".pdf"
            multiple
            onChange={handleFilesChange}
            className="w-full p-4 border-2 border-dashed border-gray-300 rounded-lg hover:border-blue-400 transition-colors"
            data-testid="input-all-files"
          />
          {allFiles && allFiles.length > 0 && (
            <div className="mt-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-foreground">
                  {allFiles.length} files uploaded • {selectedFiles.size} selected for processing
                </span>
                <div className="flex items-center gap-2">
                  <Badge variant={selectedFiles.size >= 1 ? "default" : "secondary"}>
                    {selectedFiles.size >= 1 ? "Ready" : "Need 1+"}
                  </Badge>
                  <Badge variant={allFiles.length <= 10 ? "default" : "destructive"}>
                    {allFiles.length <= 10 ? "OK" : "TOO MANY"}
                  </Badge>
                </div>
              </div>
              
              {/* Select/Deselect All Buttons */}
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={selectAllFiles}
                  className="text-xs"
                >
                  Select All
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={deselectAllFiles}
                  className="text-xs"
                >
                  Deselect All
                </Button>
              </div>

              {/* File List with Checkboxes */}
              <div className="max-h-60 overflow-y-auto space-y-2 border rounded-md p-3 bg-muted/30">
                {Array.from(allFiles).map((file, index) => (
                  <div 
                    key={index} 
                    className={`flex items-center justify-between p-3 border rounded-md transition-colors cursor-pointer ${
                      selectedFiles.has(index) 
                        ? 'bg-blue-50 border-blue-200 dark:bg-blue-950/30 dark:border-blue-800' 
                        : 'bg-card hover:bg-muted/50 border-border'
                    }`}
                    onClick={() => toggleFileSelection(index)}
                    data-testid={`file-${index}`}
                  >
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={selectedFiles.has(index)}
                        onChange={() => toggleFileSelection(index)}
                        className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                        data-testid={`checkbox-${index}`}
                      />
                      
                      <div className="flex items-center gap-2">
                        {index === allFiles.length - 1 ? (
                          <>
                            <Scale className="w-4 h-4 text-blue-500" />
                            <span className="font-medium text-blue-600 text-sm">Trial Record:</span>
                          </>
                        ) : (
                          <>
                            <FileText className="w-4 h-4 text-green-500" />
                            <span className="text-green-600 text-sm">Brief {index + 1}:</span>
                          </>
                        )}
                        <span className="text-sm font-medium text-foreground truncate max-w-xs">
                          {file.name}
                        </span>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-foreground/70">
                        {(file.size / 1024 / 1024).toFixed(1)} MB
                      </span>
                      {selectedFiles.has(index) && (
                        <CheckCircle className="w-4 h-4 text-blue-500" />
                      )}
                    </div>
                  </div>
                ))}
              </div>
              
              {selectedFiles.size > 0 && (
                <div className="text-xs text-foreground/80 p-2 bg-blue-50 dark:bg-blue-950/30 rounded border border-blue-200 dark:border-blue-800/50">
                  📄 {selectedFiles.size === 1 
                    ? "Single file selected will be processed as Trial Record only" 
                    : `Processing order: First ${selectedFiles.size - 1} selected files will be Brief documents, last selected file will be Trial Record`
                  }
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Process Button */}
      <div className="text-center">
        <Button
          onClick={processDocuments}
          disabled={isProcessing || !allFiles || selectedFiles.size < 1 || allFiles.length > 10}
          size="lg"
          className="px-8 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
          data-testid="button-process"
        >
          {isProcessing ? (
            <>
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
              Processing with AI...
            </>
          ) : (
            <>
              <Zap className="w-4 h-4 mr-2" />
              Create Court-Ready Master PDF
            </>
          )}
        </Button>
      </div>

      {/* Results */}
      {result && (
        <div className="space-y-6">
          {/* Status */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {result.status === 'success' ? (
                  <CheckCircle className="w-5 h-5 text-green-600" />
                ) : (
                  <XCircle className="w-5 h-5 text-red-600" />
                )}
                Processing Results
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex justify-between items-center p-3 bg-muted rounded">
                  <span className="font-medium text-foreground">Status</span>
                  <Badge variant={result.status === 'success' ? "default" : "destructive"}>
                    {result.status.toUpperCase()}
                  </Badge>
                </div>
                <div className="flex justify-between items-center p-3 bg-muted rounded">
                  <span className="font-medium text-foreground">Message</span>
                  <span className="text-sm text-foreground">{result.message}</span>
                </div>
                <div className="flex justify-between items-center p-3 bg-muted rounded">
                  <span className="font-medium text-foreground">Court Ready</span>
                  <Badge variant={result.validation.court_ready ? "default" : "destructive"}>
                    {result.validation.court_ready ? 'YES' : 'NO'}
                  </Badge>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Statistics */}
          <Card>
            <CardHeader>
              <CardTitle>Processing Statistics</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-4 gap-4">
                <div className="text-center p-3 bg-blue-50 rounded">
                  <div className="text-2xl font-bold text-blue-600">{result.total_references}</div>
                  <div className="text-sm text-gray-600">Total References</div>
                </div>
                <div className="text-center p-3 bg-green-50 rounded">
                  <div className="text-2xl font-bold text-green-600">{result.high_confidence}</div>
                  <div className="text-sm text-gray-600">High Confidence</div>
                </div>
                <div className="text-center p-3 bg-yellow-50 rounded">
                  <div className="text-2xl font-bold text-yellow-600">{result.needs_review}</div>
                  <div className="text-sm text-gray-600">Needs Review</div>
                </div>
                <div className="text-center p-3 bg-red-50 rounded">
                  <div className="text-2xl font-bold text-red-600">{result.validation.broken_links}</div>
                  <div className="text-sm text-gray-600">Broken Links</div>
                </div>
              </div>

              {/* By Type */}
              <div className="mt-4">
                <h4 className="font-medium mb-2">References by Type:</h4>
                <div className="grid grid-cols-3 gap-2">
                  {Object.entries(result.by_type).map(([type, count]) => (
                    <div key={type} className="flex justify-between p-2 bg-gray-50 rounded">
                      <span className="capitalize">{type.replace('_', ' ')}</span>
                      <span className="font-mono">{count}</span>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Downloads */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Download className="w-5 h-5" />
                Download Files
              </CardTitle>
              <CardDescription>
                Court-ready Master PDF and supporting documents
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                <Button
                  onClick={() => downloadFile(result.downloads.master_pdf, 'Ferrante_Master.linked.pdf')}
                  className="flex items-center gap-2"
                  data-testid="download-master-pdf"
                >
                  <Download className="w-4 h-4" />
                  Master PDF (Court Ready)
                </Button>
                <Button
                  onClick={() => downloadFile(result.downloads.candidate_map_json, 'candidate_map.json')}
                  variant="outline"
                  className="flex items-center gap-2"
                >
                  <Download className="w-4 h-4" />
                  Candidate Map (JSON)
                </Button>
                <Button
                  onClick={() => downloadFile(result.downloads.candidate_map_csv, 'candidate_map.csv')}
                  variant="outline"
                  className="flex items-center gap-2"
                >
                  <Download className="w-4 h-4" />
                  Candidate Map (CSV)
                </Button>
                <Button
                  onClick={() => downloadFile(result.downloads.validation_report, 'validation_report.json')}
                  variant="outline"
                  className="flex items-center gap-2"
                >
                  <Download className="w-4 h-4" />
                  Validation Report
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
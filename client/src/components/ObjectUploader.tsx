import { useState, useRef } from "react";
import { useToast } from "@/hooks/use-toast";
import { api } from "@/lib/api";
import SmartDocumentInput from "./SmartDocumentInput";

interface ObjectUploaderProps {
  caseId: string;
  onUploadComplete: () => void;
  onClose: () => void;
}

export default function ObjectUploader({ caseId, onUploadComplete, onClose }: ObjectUploaderProps) {
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});
  const [failedFiles, setFailedFiles] = useState<Set<string>>(new Set());
  const [uploadingFiles, setUploadingFiles] = useState<Set<string>>(new Set());
  const [documentInfos, setDocumentInfos] = useState<Record<string, { title: string; alias?: string; fileNumber?: string }>>({});
  const [duplicateWarnings, setDuplicateWarnings] = useState<Record<string, any[]>>({});
  const [indexStatuses, setIndexStatuses] = useState<Record<string, { status: string; count: number | null }>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  // Retry index detection for a specific file
  const retryIndexDetection = async (fileName: string) => {
    const documentId = Object.keys(indexStatuses).find(key => key === fileName);
    if (!documentId) return;

    try {
      setIndexStatuses(prev => ({ ...prev, [fileName]: { status: "pending", count: null } }));
      await api.upload.retryIndexDetection(documentId);
      
      // Start polling again
      pollIndexStatus(documentId, fileName);
      
      toast({
        title: "Index Detection",
        description: "Retrying index detection...",
      });
    } catch (error) {
      console.error("Error retrying index detection:", error);
      toast({
        title: "Retry Failed",
        description: "Failed to retry index detection. Please try again.",
        variant: "destructive",
      });
    }
  };

  // Poll for index detection status
  const pollIndexStatus = async (documentId: string, fileName: string) => {
    let tries = 0;
    const maxTries = 40; // ~20s at 500ms intervals
    
    const poll = async () => {
      tries++;
      try {
        const status = await api.upload.getIndexStatus(documentId);
        setIndexStatuses(prev => ({ 
          ...prev, 
          [fileName]: { 
            status: status.index_status || "error", 
            count: status.index_count 
          } 
        }));
        
        if (status.index_status === "ok" || status.index_status === "error" || tries >= maxTries) {
          return; // Stop polling
        }
        
        // Continue polling
        setTimeout(poll, 500);
      } catch (error) {
        console.error("Error polling index status:", error);
        if (tries < maxTries) {
          setTimeout(poll, 500);
        }
      }
    };
    
    poll();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const droppedFiles = Array.from(e.dataTransfer.files).filter(
      file => file.type === 'application/pdf' || file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    );
    setFiles(prev => [...prev, ...droppedFiles]);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const selectedFiles = Array.from(e.target.files).filter(
        file => file.type === 'application/pdf' || file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      );
      setFiles(prev => [...prev, ...selectedFiles]);
    }
  };

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const uploadFiles = async () => {
    if (files.length === 0) return;
    
    setUploading(true);
    setFailedFiles(new Set());
    const newFailedFiles = new Set<string>();
    let successCount = 0;
    
    // Upload all files in parallel
    const uploadPromises = files.map(async (file) => {
      try {
        setUploadingFiles(prev => new Set(Array.from(prev).concat([file.name])));
        setUploadProgress(prev => ({ ...prev, [file.name]: 10 }));
        
        // Upload via object storage with real progress tracking
        const uploadResult = await api.upload.document(file, caseId, (progressPercent) => {
          setUploadProgress(prev => ({ ...prev, [file.name]: Math.round(progressPercent) }));
        });
        setUploadProgress(prev => ({ ...prev, [file.name]: 100 }));
        setUploadingFiles(prev => {
          const newSet = new Set(prev);
          newSet.delete(file.name);
          return newSet;
        });
        
        // Start polling for index detection status
        if (uploadResult.id) {
          setIndexStatuses(prev => ({ ...prev, [file.name]: { status: "pending", count: null } }));
          pollIndexStatus(uploadResult.id, file.name);
        }
        
        successCount++;
        
      } catch (error) {
        console.error(`Upload error for ${file.name}:`, error);
        newFailedFiles.add(file.name);
        setUploadProgress(prev => ({ ...prev, [file.name]: 0 }));
        setUploadingFiles(prev => {
          const newSet = new Set(prev);
          newSet.delete(file.name);
          return newSet;
        });
      }
    });
    
    // Wait for all uploads to complete
    await Promise.allSettled(uploadPromises);
    
    setFailedFiles(newFailedFiles);
    setUploading(false);
    
    if (successCount > 0) {
      toast({
        title: "Upload Progress",
        description: `${successCount} file${successCount > 1 ? 's' : ''} uploaded successfully${newFailedFiles.size > 0 ? `, ${newFailedFiles.size} failed` : ''}`,
      });
      
      if (newFailedFiles.size === 0) {
        setFiles([]);
        setUploadProgress({});
        onUploadComplete();
        onClose();
      } else {
        onUploadComplete(); // Refresh the document list
      }
    } else if (newFailedFiles.size > 0) {
      toast({
        title: "Upload Failed", 
        description: `${newFailedFiles.size} file${newFailedFiles.size > 1 ? 's' : ''} failed to upload. Check file size and format.`,
        variant: "destructive",
      });
    }
  };

  const retryFailedFile = async (fileName: string) => {
    const file = files.find(f => f.name === fileName);
    if (!file) return;
    
    setUploadingFiles(prev => new Set(Array.from(prev).concat([fileName])));
    setUploadProgress(prev => ({ ...prev, [fileName]: 10 }));
    
    try {
      await api.upload.document(file, caseId, (progressPercent) => {
        setUploadProgress(prev => ({ ...prev, [fileName]: Math.round(progressPercent) }));
      });
      setFailedFiles(prev => {
        const newSet = new Set(prev);
        newSet.delete(fileName);
        return newSet;
      });
      
      toast({
        title: "Retry Successful",
        description: `${fileName} uploaded successfully`,
      });
      
      onUploadComplete();
      
    } catch (error) {
      console.error(`Retry failed for ${fileName}:`, error);
      setUploadProgress(prev => ({ ...prev, [fileName]: 0 }));
      toast({
        title: "Retry Failed",
        description: `Failed to upload ${fileName}. Please check the file and try again.`,
        variant: "destructive",
      });
    } finally {
      setUploadingFiles(prev => {
        const newSet = new Set(prev);
        newSet.delete(fileName);
        return newSet;
      });
    }
  };

  const removeFailedFile = (fileName: string) => {
    setFiles(prev => prev.filter(f => f.name !== fileName));
    setFailedFiles(prev => {
      const newSet = new Set(prev);
      newSet.delete(fileName);
      return newSet;
    });
    setUploadProgress(prev => {
      const newProg = { ...prev };
      delete newProg[fileName];
      return newProg;
    });
  };

  if (!caseId) return null;

  return (
    <div className="mx-6 mt-6" data-testid="object-uploader">
      <div 
        className="upload-area rounded-lg p-8 text-center transition-all duration-200"
        onDrop={handleDrop}
        onDragOver={(e) => e.preventDefault()}
        data-testid="upload-area"
      >
        <div className="flex flex-col items-center gap-4">
          <div className="w-16 h-16 bg-primary/20 rounded-full flex items-center justify-center">
            <i className="fas fa-cloud-upload-alt text-primary text-2xl"></i>
          </div>
          <div>
            <h3 className="text-lg font-semibold text-foreground">Upload Legal Documents</h3>
            <p className="text-muted-foreground mt-1">Drag and drop PDF or DOCX files here, or click to browse</p>
          </div>
          <div className="flex flex-col gap-2 text-sm text-muted-foreground">
            <p>• Supports PDF and DOCX files</p>
            <p>• Maximum file size: 500MB</p>
            <p>• Multiple files supported</p>
            <p>• Files stored securely in object storage</p>
          </div>
          <input 
            type="file" 
            multiple 
            accept=".pdf,.docx" 
            className="hidden" 
            ref={fileInputRef}
            onChange={handleFileSelect}
            data-testid="file-input"
          />
          <button 
            className="px-6 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
            onClick={() => fileInputRef.current?.click()}
            data-testid="button-select-files"
          >
            Select Files
          </button>
        </div>
      </div>

      {files.length > 0 && (
        <div className="mt-6 bg-card rounded-lg border border-border p-4">
          <h4 className="text-sm font-medium text-foreground mb-4">Selected Files ({files.length})</h4>
          <div className="space-y-3">
            {files.map((file, index) => (
              <div key={index} className="space-y-4">
                <div className="flex items-center justify-between p-3 bg-muted/50 rounded">
                  <div className="flex items-center gap-3">
                    <i className={`fas ${file.type === 'application/pdf' ? 'fa-file-pdf text-destructive' : 'fa-file-word text-blue-600'} text-lg`}></i>
                    <div>
                      <div className="font-medium text-foreground">{file.name}</div>
                      <div className="text-sm text-muted-foreground">
                        {(file.size / 1024 / 1024).toFixed(2)} MB
                        {/* Page count will be shown after upload */}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {uploadingFiles.has(file.name) ? (
                    <div className="flex items-center gap-2">
                      <div className="w-32 bg-muted rounded-full h-3 overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-blue-500 to-blue-600 rounded-full transition-all duration-300 ease-out"
                          style={{ width: `${uploadProgress[file.name] || 0}%` }}
                        />
                      </div>
                      <span className="text-sm font-medium text-foreground min-w-[3rem] text-right">
                        {Math.round(uploadProgress[file.name] || 0)}%
                      </span>
                    </div>
                  ) : failedFiles.has(file.name) ? (
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-red-400 font-medium">Failed</span>
                      <button
                        onClick={() => retryFailedFile(file.name)}
                        className="p-1 hover:bg-secondary rounded text-green-400 hover:text-green-300 transition-colors"
                        title="Retry upload"
                        data-testid={`button-retry-${index}`}
                      >
                        <i className="fas fa-redo text-xs"></i>
                      </button>
                      <button
                        onClick={() => removeFailedFile(file.name)}
                        className="p-1 hover:bg-secondary rounded text-red-400 hover:text-red-300 transition-colors"
                        title="Remove failed file"
                        data-testid={`button-remove-failed-${index}`}
                      >
                        <i className="fas fa-times text-xs"></i>
                      </button>
                    </div>
                  ) : uploadProgress[file.name] === 100 ? (
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-green-400 font-medium">Success</span>
                      <i className="fas fa-check text-green-400 text-xs"></i>
                      {indexStatuses[file.name] && (
                        <div className="ml-2 flex items-center gap-1">
                          {indexStatuses[file.name].status === "pending" ? (
                            <span className="text-xs text-yellow-400 font-medium">🔍 Detecting index...</span>
                          ) : indexStatuses[file.name].status === "ok" ? (
                            indexStatuses[file.name].count === 0 ? (
                              <span className="text-xs text-orange-400 font-medium">
                                📄 No Index found — open Review to set start pages manually
                              </span>
                            ) : (
                              <span className="text-xs text-blue-400 font-medium">
                                📋 Index items detected: {indexStatuses[file.name].count}
                              </span>
                            )
                          ) : indexStatuses[file.name].status === "error" ? (
                            <div className="flex items-center gap-1">
                              <span className="text-xs text-red-400 font-medium">❌ Index detection failed</span>
                              <button
                                onClick={() => retryIndexDetection(file.name)}
                                className="text-xs text-blue-400 hover:text-blue-300 underline ml-1"
                                data-testid={`button-retry-index-${index}`}
                              >
                                Retry detection
                              </button>
                            </div>
                          ) : null}
                        </div>
                      )}
                    </div>
                  ) : (
                    <button
                      onClick={() => removeFile(index)}
                      className="p-1 hover:bg-secondary rounded text-muted-foreground hover:text-foreground transition-colors"
                      data-testid={`button-remove-file-${index}`}
                    >
                      <i className="fas fa-times text-sm"></i>
                    </button>
                  )}
                  </div>
                </div>
                
                {/* Optional Smart Document Input for each file */}
                {!uploadProgress[file.name] || uploadProgress[file.name] < 100 ? (
                  <details className="group">
                    <summary className="cursor-pointer p-2 bg-gray-100 hover:bg-gray-200 rounded text-sm text-gray-600 transition-colors">
                      <span className="group-open:hidden">📝 Add document details (optional)</span>
                      <span className="hidden group-open:inline">📝 Document details</span>
                    </summary>
                    <div className="mt-2 p-3 bg-blue-50 rounded border border-blue-200">
                      <SmartDocumentInput
                        caseId={caseId}
                        fileName={file.name}
                        onDocumentInfo={(info) => {
                          setDocumentInfos(prev => ({ ...prev, [file.name]: info }));
                        }}
                        onDuplicateWarning={(duplicates) => {
                          setDuplicateWarnings(prev => ({ ...prev, [file.name]: duplicates }));
                        }}
                      />
                    </div>
                  </details>
                ) : null}
              </div>
            ))}
          </div>
          
          <div className="flex items-center gap-3 mt-4">
            <button
              onClick={uploadFiles}
              disabled={uploading || files.length === 0}
              className="px-6 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center gap-2"
              data-testid="button-upload-files"
            >
              {uploading ? (
                <>
                  <i className="fas fa-spinner fa-spin"></i>
                  <div className="flex flex-col items-start gap-1">
                    <span>Uploading... ({Object.keys(uploadProgress).filter(k => uploadProgress[k] === 100).length}/{files.length})</span>
                    <div className="w-32 bg-muted rounded-full h-2">
                      <div
                        className="h-full bg-gradient-to-r from-green-500 to-green-600 rounded-full transition-all duration-300"
                        style={{ 
                          width: `${Math.round((Object.keys(uploadProgress).filter(k => uploadProgress[k] === 100).length / files.length) * 100)}%` 
                        }}
                      />
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <i className="fas fa-upload"></i>
                  Upload {files.filter(f => !failedFiles.has(f.name) && uploadProgress[f.name] !== 100).length} File{files.filter(f => !failedFiles.has(f.name) && uploadProgress[f.name] !== 100).length > 1 ? 's' : ''}
                </>
              )}
            </button>
            
            {failedFiles.size > 0 && (
              <button
                onClick={() => {
                  const failedFileList = files.filter(f => failedFiles.has(f.name));
                  failedFileList.forEach(f => retryFailedFile(f.name));
                }}
                disabled={uploading}
                className="px-4 py-2 bg-yellow-600 text-white rounded-md hover:bg-yellow-700 transition-colors disabled:opacity-50 flex items-center gap-2"
                data-testid="button-retry-all-failed"
              >
                <i className="fas fa-redo"></i>
                Retry All Failed ({failedFiles.size})
              </button>
            )}
            
            <button
              onClick={onClose}
              className="px-4 py-2 bg-secondary text-secondary-foreground rounded-md hover:bg-secondary/80 transition-colors"
              data-testid="button-cancel-upload"
            >
              {failedFiles.size > 0 || (files.length > 0 && files.some(f => uploadProgress[f.name] === 100)) ? 'Close' : 'Cancel'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
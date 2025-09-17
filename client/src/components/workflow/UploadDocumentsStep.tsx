import { useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import type { Document } from "@shared/schema";

interface UploadDocumentsStepProps {
  caseId: string;
  documents: Document[];
  onDocumentsUploaded: () => void;
}

export function UploadDocumentsStep({ caseId, documents, onDocumentsUploaded }: UploadDocumentsStepProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const uploadMutation = useMutation({
    mutationFn: async (files: FileList) => {
      const formData = new FormData();
      Array.from(files).forEach((file) => {
        formData.append("documents", file);
      });
      formData.append("caseId", caseId);

      return apiRequest("/api/documents/upload", {
        method: "POST",
        body: formData,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/documents", caseId] });
      onDocumentsUploaded();
      toast({
        title: "Documents Uploaded",
        description: "Your documents have been uploaded successfully. Continue to Step 3 for OCR processing.",
      });
    },
    onError: (error) => {
      toast({
        title: "Upload Failed",
        description: `Failed to upload documents: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      uploadMutation.mutate(files);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      uploadMutation.mutate(files);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  const hasDocuments = documents.length > 0;

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-4">
          <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
            hasDocuments ? "bg-green-100 dark:bg-green-900" : "bg-primary"
          }`}>
            <i className={`text-xl ${
              hasDocuments ? "fas fa-check text-green-600" : "fas fa-folder-open text-primary-foreground"
            }`}></i>
          </div>
          <div>
            <h1 className="text-3xl font-bold text-foreground">
              Step 2: Upload Documents {hasDocuments ? "✅" : ""}
            </h1>
            <p className="text-lg text-muted-foreground">
              {hasDocuments 
                ? "Documents uploaded successfully - ready for next step"
                : "Add your legal documents to the case"
              }
            </p>
          </div>
        </div>
      </div>

      {/* Upload Area */}
      <div
        className={`border-2 border-dashed rounded-lg p-8 text-center mb-6 transition-colors ${
          uploadMutation.isPending 
            ? "border-primary bg-primary/5" 
            : "border-border hover:border-primary hover:bg-primary/5"
        }`}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        data-testid="upload-dropzone"
      >
        {uploadMutation.isPending ? (
          <div className="space-y-4">
            <i className="fas fa-spinner fa-spin text-primary text-4xl"></i>
            <div>
              <h3 className="text-xl font-semibold">Uploading Documents...</h3>
              <p className="text-muted-foreground">Please wait while we process your files</p>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <i className="fas fa-cloud-upload-alt text-muted-foreground text-4xl"></i>
            <div>
              <h3 className="text-xl font-semibold">Drop PDF files here</h3>
              <p className="text-muted-foreground">or click to browse for documents</p>
            </div>
            <Button
              onClick={() => fileInputRef.current?.click()}
              className="mt-4"
              data-testid="button-browse-files"
            >
              <i className="fas fa-file-pdf mr-2"></i>
              Browse Files
            </Button>
          </div>
        )}
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept=".pdf"
        onChange={handleFileSelect}
        className="hidden"
        data-testid="file-input"
      />

      {/* Uploaded Documents List */}
      {hasDocuments && (
        <div className="bg-card border border-border rounded-lg p-6 mb-6">
          <h3 className="text-lg font-semibold mb-4">Uploaded Documents ({documents.length})</h3>
          <div className="space-y-3">
            {documents.map((doc) => (
              <div key={doc.id} className="flex items-center justify-between p-3 bg-background rounded border">
                <div className="flex items-center gap-3">
                  <i className="fas fa-file-pdf text-red-500 text-lg"></i>
                  <div>
                    <div className="font-medium">{doc.title}</div>
                    <div className="text-sm text-muted-foreground">
                      {formatFileSize(doc.fileSize)} • {doc.pageCount} pages
                    </div>
                  </div>
                </div>
                {/* OCR status removed - will be shown on OCR Processing page */}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Continue Button */}
      {hasDocuments && (
        <div className="flex gap-4">
          <Button
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
            data-testid="button-add-more-documents"
          >
            <i className="fas fa-plus mr-2"></i>
            Add More Documents
          </Button>
          <Button
            className="bg-green-600 hover:bg-green-700"
            onClick={onDocumentsUploaded}
            data-testid="button-continue-to-ocr"
          >
            Continue to Step 3: OCR Processing
            <i className="fas fa-arrow-right ml-2"></i>
          </Button>
        </div>
      )}

      {/* Instructions */}
      <div className="mt-8 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <i className="fas fa-info-circle text-blue-500 mt-1"></i>
          <div>
            <h4 className="font-medium text-blue-900 dark:text-blue-100">Upload Guidelines</h4>
            <ul className="text-sm text-blue-700 dark:text-blue-200 mt-2 space-y-1">
              <li>• Only PDF files are supported</li>
              <li>• Maximum file size: 500MB per document</li>
              <li>• Upload completes the document preparation step</li>
              <li>• Continue to Step 3 for OCR text processing</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
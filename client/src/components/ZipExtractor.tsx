import { useState } from 'react';
import JSZip from 'jszip';
import { useToast } from '@/hooks/use-toast';

interface ZipExtractorProps {
  documentId: string;
  className?: string;
}

export function ZipExtractor({ documentId, className = '' }: ZipExtractorProps) {
  const [isExtracting, setIsExtracting] = useState(false);
  const { toast } = useToast();

  const handleOpenDirectly = async () => {
    try {
      setIsExtracting(true);
      
      toast({
        title: "Opening ZIP Bundle",
        description: "Extracting files and opening HTML index automatically...",
      });

      // Get the ZIP bundle from the server
      const response = await fetch(`/api/documents/${documentId}/highlight-tabs`, {
        method: 'POST',
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      // Get the ZIP file as blob
      const zipBlob = await response.blob();
      
      // Extract ZIP using JSZip
      const zip = await JSZip.loadAsync(zipBlob);
      
      let htmlContent: string | null = null;
      let pdfBlob: Blob | null = null;
      let htmlFileName = '';
      let pdfFileName = '';

      // Extract files from ZIP
      for (const [fileName, file] of Object.entries(zip.files)) {
        if (fileName.endsWith('.html')) {
          htmlContent = await file.async('text');
          htmlFileName = fileName;
        } else if (fileName.endsWith('.pdf') && fileName.includes('highlighted')) {
          pdfBlob = await file.async('blob');
          pdfFileName = fileName;
        }
      }

      if (!htmlContent || !pdfBlob) {
        throw new Error('Could not find HTML index or PDF file in ZIP bundle');
      }

      // Create blob URL for the PDF
      const pdfUrl = URL.createObjectURL(pdfBlob);
      
      // Update HTML content to use the blob URL for PDF links
      const updatedHtmlContent = htmlContent.replace(
        /href="[^"]*\.pdf#page=(\d+)"/g,
        `href="${pdfUrl}#page=$1"`
      );

      // Create blob URL for the updated HTML
      const htmlBlob = new Blob([updatedHtmlContent], { type: 'text/html' });
      const htmlUrl = URL.createObjectURL(htmlBlob);

      // Open the HTML index in a new window
      const newWindow = window.open(htmlUrl, '_blank');
      
      if (!newWindow) {
        // Fallback: download the ZIP if popup is blocked
        const downloadUrl = URL.createObjectURL(zipBlob);
        const a = document.createElement('a');
        a.href = downloadUrl;
        a.download = `document-bundle-${documentId}.zip`;
        a.click();
        URL.revokeObjectURL(downloadUrl);
        
        toast({
          title: "Popup Blocked",
          description: "ZIP bundle downloaded instead. Extract and open the HTML file to access hyperlinks.",
          variant: "default",
        });
      } else {
        toast({
          title: "HTML Index Opened!",
          description: "Click any tab link to open the PDF at the exact page in a new window.",
        });
      }

      // Clean up URLs after a delay
      setTimeout(() => {
        URL.revokeObjectURL(htmlUrl);
        URL.revokeObjectURL(pdfUrl);
      }, 5000);

    } catch (error) {
      console.error('ZIP extraction failed:', error);
      toast({
        title: "Extraction Failed",
        description: "Failed to extract and open ZIP bundle. Try downloading instead.",
        variant: "destructive",
      });
    } finally {
      setIsExtracting(false);
    }
  };

  return (
    <button
      onClick={handleOpenDirectly}
      disabled={isExtracting}
      className={`px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded text-sm transition-colors disabled:opacity-50 ${className}`}
      data-testid={`button-open-directly-${documentId}`}
    >
      <i className={`fas ${isExtracting ? 'fa-spinner fa-spin' : 'fa-external-link-alt'} mr-1.5`}></i>
      {isExtracting ? 'Opening...' : 'Open Directly'}
    </button>
  );
}
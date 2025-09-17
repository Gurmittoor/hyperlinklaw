import { useRoute, useLocation } from 'wouter';
import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { ArrowLeft, ZoomIn, ZoomOut, Link } from 'lucide-react';
import MultiPagePdf from '@/components/MultiPagePdf';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { queryClient } from '@/lib/queryClient';

export default function PdfViewer() {
  const [match, params] = useRoute('/pdf-viewer/:caseId/:documentId');
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [zoom, setZoom] = useState(() => {
    const savedZoom = localStorage.getItem('pdf-zoom-level');
    return savedZoom ? parseFloat(savedZoom) : 1;
  });
  const [totalPages, setTotalPages] = useState(0);
  const [isApplyingHyperlinks, setIsApplyingHyperlinks] = useState(false);

  useEffect(() => {
    localStorage.setItem('pdf-zoom-level', zoom.toString());
  }, [zoom]);

  // Apply hyperlinks function - Enhanced to generate page 2 overlay links
  const applyHyperlinks = async () => {
    console.log('🔗 Apply Hyperlinks button clicked! documentId:', documentId);
    if (!documentId) return;
    
    setIsApplyingHyperlinks(true);
    try {
      // Step 1: Fetch index items with hyperlink page assignments
      const indexItemsResponse = await fetch(`/api/documents/${documentId}/index-items`);
      if (!indexItemsResponse.ok) {
        throw new Error('Failed to fetch index items');
      }
      const indexItemsData = await indexItemsResponse.json();
      
      // Extract table rows or use the response directly
      const tableRows = indexItemsData.tableRows || indexItemsData || [];
      
      console.log('🔗 Index items fetched for Apply Hyperlinks:', tableRows.length, 'items');

      // Step 2: Apply traditional hyperlinks (original functionality)
      const hyperlinkResponse = await fetch(`/api/documents/${documentId}/apply-hyperlinks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: [],
          indexPage: 2,
          backBanner: true
        })
      });
      
      // Step 3: Generate page 2 overlay links based on hyperlink page assignments
      await generatePage2OverlayLinks(tableRows);

      if (hyperlinkResponse.ok) {
        const data = await hyperlinkResponse.json();
        if (data?.url) {
          window.open(data.url, '_blank');
        }
        toast({
          title: 'Success',
          description: 'Hyperlinks applied successfully with page 2 overlay links. Opening PDF...',
        });
      } else {
        // Even if traditional hyperlinks fail, we still generated page 2 links
        toast({
          title: 'Page 2 Links Applied',
          description: 'Page 2 overlay links generated successfully.',
        });
      }
    } catch (error) {
      console.error('Apply hyperlinks error:', error);
      toast({
        title: 'Error',
        description: 'Failed to apply hyperlinks',
        variant: 'destructive'
      });
    } finally {
      setIsApplyingHyperlinks(false);
    }
  };

  // Generate page 2 overlay links based on current hyperlink page assignments
  const generatePage2OverlayLinks = async (tableRows: any[]) => {
    console.log('🔗 Generating page 2 overlay links from hyperlink assignments...');
    
    try {
      // Filter valid rows with hyperlink page assignments
      const validLinks = tableRows.filter(row => 
        row.tabNo && 
        row.hyperlinkPage && 
        !isNaN(parseInt(row.hyperlinkPage.toString()))
      );

      if (validLinks.length === 0) {
        toast({
          title: 'No Hyperlink Assignments',
          description: 'No valid hyperlink page assignments found to generate overlay links.',
          variant: 'default'
        });
        return;
      }

      console.log(`📍 Creating ${validLinks.length} page 2 overlay links...`);

      // Generate positions for each link (use auto-alignment spacing)
      const page2Links = validLinks.map((row, index) => ({
        documentId,
        pageNumber: 2,
        tabNumber: String(row.tabNo), // Convert to string for consistency
        targetPage: parseInt(row.hyperlinkPage.toString()),
        // Use fallback positioning with 24px spacing between items
        xNorm: "0.08",  // Left side positioning
        yNorm: ((120 + (index * 24)) / 792).toFixed(8),  // Vertical spacing, normalized to page height
        isAutoAligned: false  // Mark as manually generated
      }));

      // Save all page 2 overlay links using the correct API format
      await apiRequest('POST', `/api/documents/${documentId}/page2-links/positions`, {
        positions: page2Links
      });

      // Invalidate the cache to refresh the UI immediately (using hierarchical query key)
      const hierarchicalQueryKey = ['/api/documents', documentId, 'page2-links', 'positions'];
      queryClient.invalidateQueries({ 
        queryKey: hierarchicalQueryKey 
      });
      
      console.log('✅ Cache invalidated for query key:', hierarchicalQueryKey);

      console.log(`✅ Generated ${validLinks.length} page 2 overlay links successfully`);
      
      // Show success message with link details
      toast({
        title: '🔗 Page 2 Links Generated',
        description: `Created ${validLinks.length} clickable overlay links on page 2 based on your hyperlink assignments.`,
      });

    } catch (error) {
      console.error('Error generating page 2 overlay links:', error);
      toast({
        title: 'Page 2 Links Error',
        description: 'Failed to generate overlay links for page 2. Check console for details.',
        variant: 'destructive'
      });
    }
  };

  if (!match || !params) {
    return <div>PDF not found</div>;
  }

  const { caseId, documentId } = params;
  const pdfUrl = `/online/pdf/${caseId}/${documentId}`;

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header with controls */}
      <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setLocation(`/cases/${caseId}/documents`)}
            className="flex items-center gap-2"
            data-testid="button-back-to-case"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Case
          </Button>
          <h1 className="text-lg font-semibold text-gray-900">PDF Viewer</h1>
        </div>

        <div className="flex items-center gap-4">
          {/* Apply Hyperlinks Button */}
          <Button
            variant="default"
            size="sm"
            onClick={applyHyperlinks}
            disabled={isApplyingHyperlinks}
            className="flex items-center gap-2"
            data-testid="button-apply-hyperlinks"
          >
            <Link className="h-4 w-4" />
            {isApplyingHyperlinks ? 'Applying...' : 'Apply Hyperlinks'}
          </Button>

          {/* Zoom Controls */}
          <div className="flex items-center gap-2 border border-gray-300 rounded-lg px-3 py-1 bg-white">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setZoom(Math.max(0.25, zoom - 0.25))}
              className="px-2 py-1 h-8"
              title="Zoom Out"
              data-testid="button-zoom-out"
            >
              <ZoomOut className="h-4 w-4" />
            </Button>
            <span className="text-sm min-w-[3rem] text-center font-medium">
              {Math.round(zoom * 100)}%
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setZoom(Math.min(2, zoom + 0.25))}
              className="px-2 py-1 h-8"
              title="Zoom In"
              data-testid="button-zoom-in"
            >
              <ZoomIn className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* PDF Content */}
      <div className="p-4">
        <div className="max-w-none mx-auto bg-white rounded-lg shadow-sm">
          <MultiPagePdf
            url={pdfUrl}
            documentId={documentId}
            zoom={zoom}
            start={1}
            end={totalPages || 999999} // Show all pages
            onTotalPages={setTotalPages}
            showHighlightTools={false}
          />
        </div>
        
        {totalPages > 0 && (
          <div className="mt-4 text-center text-sm text-gray-600">
            Total Pages: {totalPages}
          </div>
        )}
      </div>
    </div>
  );
}
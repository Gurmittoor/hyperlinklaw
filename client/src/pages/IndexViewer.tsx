import { useState, useEffect } from 'react';
import { useRoute } from 'wouter';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { FileText, ExternalLink, CheckCircle, XCircle, RefreshCw } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface IndexItem {
  no: number;
  label: string;
  start_page?: number;
  end_page?: number;
  found: boolean;
  index_bbox?: number[];
}

interface IndexManifest {
  success: boolean;
  index_page_1based: number;
  total_tabs: number;
  links_found: number;
  auto_detected: boolean;
  items: IndexItem[];
}

export default function IndexViewer() {
  const [, params] = useRoute('/index-viewer/:filename');
  const [manifest, setManifest] = useState<IndexManifest | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedTab, setSelectedTab] = useState<number | null>(null);
  const [overrides, setOverrides] = useState<Record<number, number>>({});
  const [regenerating, setRegenerating] = useState(false);
  const { toast } = useToast();
  
  const filename = params?.filename;

  useEffect(() => {
    if (!filename) return;
    
    // Try to load existing manifest first
    fetch(`/uploads/${filename}_index_map.json`)
      .then(res => res.json())
      .then(data => {
        setManifest(data);
        setLoading(false);
      })
      .catch(() => {
        // Fallback to auto-detection API
        fetch(`/api/auto-detection/${filename}`)
          .then(res => res.json())
          .then(data => {
            if (data.ok) {
              setManifest(data.manifest);
            }
            setLoading(false);
          })
          .catch(err => {
            console.error('Failed to load index manifest:', err);
            setLoading(false);
          });
      });
  }, [filename]);

  const handleOverride = async (tabNo: number, newPage: number) => {
    if (!filename || !manifest) return;
    
    setRegenerating(true);
    try {
      const response = await fetch('/api/regenerate-links', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pdfPath: `/uploads/${filename}.pdf`,
          manifestPath: `/uploads/${filename}_index_map.json`,
          tabNo,
          newPage
        })
      });
      
      const result = await response.json();
      if (result.ok) {
        setManifest(result.manifest);
        toast({
          title: "Links Updated",
          description: `Tab ${tabNo} now points to page ${newPage}`,
        });
      } else {
        throw new Error(result.error);
      }
    } catch (error) {
      toast({
        title: "Update Failed",
        description: error instanceof Error ? error.message : "Failed to update links",
        variant: "destructive",
      });
    } finally {
      setRegenerating(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p>Loading index manifest...</p>
        </div>
      </div>
    );
  }

  if (!manifest || !manifest.success) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <XCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold mb-2">Index Not Found</h2>
          <p className="text-gray-600">Could not detect index page in this document.</p>
        </div>
      </div>
    );
  }

  const pdfUrl = `/uploads/${filename}_linked.pdf`;

  return (
    <div className="h-screen flex">
      {/* Left Panel - Index Items */}
      <div className="w-96 border-r border-gray-200 bg-gray-50 p-4 overflow-auto">
        <div className="mb-6">
          <h2 className="text-xl font-bold mb-2" data-testid="header-index-viewer">
            Document Index
          </h2>
          <div className="flex gap-2 text-sm text-gray-600">
            <Badge variant="secondary" data-testid="badge-index-page">
              Index Page {manifest.index_page_1based}
            </Badge>
            <Badge variant="secondary" data-testid="badge-total-tabs">
              {manifest.total_tabs} Tabs
            </Badge>
            <Badge variant={manifest.links_found === manifest.total_tabs ? "default" : "destructive"} data-testid="badge-links-found">
              {manifest.links_found} Found
            </Badge>
          </div>
        </div>

        <div className="space-y-3">
          {manifest.items.map((item) => (
            <Card 
              key={item.no} 
              className={`transition-colors ${
                selectedTab === item.no ? 'ring-2 ring-blue-500' : ''
              } ${item.found ? 'hover:bg-gray-100' : 'opacity-60'}`}
              data-testid={`card-tab-${item.no}`}
            >
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center justify-between">
                  <span data-testid={`text-tab-${item.no}-title`}>
                    Tab {item.no}
                  </span>
                  {item.found ? (
                    <CheckCircle className="h-4 w-4 text-green-500" data-testid={`icon-found-${item.no}`} />
                  ) : (
                    <XCircle className="h-4 w-4 text-red-500" data-testid={`icon-not-found-${item.no}`} />
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <p className="text-xs text-gray-600 mb-3" data-testid={`text-tab-${item.no}-label`}>
                  {item.label}
                </p>
                
                {/* Navigation Buttons */}
                <div className="flex gap-2 mb-3">
                  <Button 
                    size="sm" 
                    variant="outline"
                    disabled={!item.found}
                    onClick={() => {
                      const iframe = document.getElementById('pdf-viewer') as HTMLIFrameElement;
                      if (iframe) {
                        iframe.src = `${pdfUrl}#page=${item.start_page}&view=FitH`;
                        setSelectedTab(item.no);
                      }
                    }}
                    data-testid={`button-open-${item.no}`}
                  >
                    <FileText className="h-3 w-3 mr-1" />
                    Open
                  </Button>
                  {item.start_page !== item.end_page && (
                    <Button 
                      size="sm" 
                      variant="outline"
                      disabled={!item.found}
                      onClick={() => {
                        window.open(`${pdfUrl}#page=${item.start_page}&view=FitH`, '_blank');
                      }}
                      data-testid={`button-preview-${item.no}`}
                    >
                      <ExternalLink className="h-3 w-3 mr-1" />
                      New Window
                    </Button>
                  )}
                </div>

                {/* Page Override */}
                <div className="flex gap-2 items-center">
                  <Input
                    type="number"
                    placeholder="New page"
                    value={overrides[item.no] || item.start_page || ''}
                    onChange={(e) => {
                      const value = parseInt(e.target.value) || 0;
                      setOverrides(prev => ({ ...prev, [item.no]: value }));
                    }}
                    className="w-20 h-8 text-xs"
                    data-testid={`input-override-${item.no}`}
                  />
                  <Button 
                    size="sm" 
                    variant="secondary"
                    disabled={regenerating || !overrides[item.no] || overrides[item.no] === item.start_page}
                    onClick={() => {
                      const newPage = overrides[item.no];
                      if (newPage) {
                        handleOverride(item.no, newPage);
                      }
                    }}
                    data-testid={`button-apply-${item.no}`}
                  >
                    {regenerating ? (
                      <RefreshCw className="h-3 w-3 mr-1 animate-spin" />
                    ) : (
                      <RefreshCw className="h-3 w-3 mr-1" />
                    )}
                    Apply
                  </Button>
                </div>

                {/* Page Info */}
                {item.found && (
                  <p className="text-xs text-gray-500 mt-2" data-testid={`text-pages-${item.no}`}>
                    Pages: {item.start_page}
                    {item.end_page && item.start_page !== item.end_page 
                      ? `–${item.end_page}` 
                      : ''}
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Right Panel - PDF Viewer */}
      <div className="flex-1 h-full">
        <iframe
          id="pdf-viewer"
          src={`${pdfUrl}#page=${manifest.index_page_1based}&view=FitH`}
          className="w-full h-full border-0"
          title="PDF Viewer"
          data-testid="pdf-viewer-iframe"
        />
      </div>
    </div>
  );
}
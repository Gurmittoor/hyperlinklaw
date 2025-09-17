import { useRoute } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, FileText, Eye, CheckCircle, XCircle, MapPin } from "lucide-react";
import { Link } from "wouter";
import PdfWithOverlay from "@/components/review/PdfWithOverlay";

interface IndexItem {
  id: string;
  ordinal: number;
  label: string;
  page_hint: number;
  tabNumber?: string;
  tabTitle?: string;
}

interface ReviewHighlight {
  id: string;
  page_number: number;
  bbox: { x: number; y: number; width: number; height: number };
  kind: "index-row" | "candidate-link" | "custom";
  label?: string;
  confidence?: number;
  source_item_id?: string;
}

export default function VisualReviewPage() {
  const [match, params] = useRoute('/cases/:caseId/documents/:documentId/visual-review');
  const { caseId, documentId } = params || {};
  
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("pdf");

  // Fetch case data
  const { data: caseData } = useQuery({
    queryKey: [`/api/cases/${caseId}`],
    enabled: !!caseId,
  });

  // Fetch document data
  const { data: document } = useQuery({
    queryKey: [`/api/documents/${documentId}`],
    enabled: !!documentId,
  });

  // Fetch index items
  const { data: indexItems = [] } = useQuery<IndexItem[]>({
    queryKey: [`/api/documents/${documentId}/index-items`],
    enabled: !!documentId,
  });

  // Fetch review highlights
  const { data: highlights = [] } = useQuery<ReviewHighlight[]>({
    queryKey: [`/api/documents/${documentId}/review-highlights`],
    enabled: !!documentId,
  });

  if (!caseData || !document) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Loading visual review...</p>
          </div>
        </div>
      </div>
    );
  }

  const fileUrl = `/api/files/${documentId}.pdf`;

  const handleItemClick = (item: IndexItem) => {
    setSelectedItemId(selectedItemId === item.id ? null : item.id);
  };

  const indexHighlights = highlights.filter(h => h.kind === 'index-row');
  const candidateHighlights = highlights.filter(h => h.kind === 'candidate-link');
  const customHighlights = highlights.filter(h => h.kind === 'custom');

  return (
    <div className="container mx-auto p-6 max-w-7xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Link href={`/cases/${caseId}`}>
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Case
            </Button>
          </Link>
          
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Visual Review</h1>
            <p className="text-gray-600">
              {document.originalName} • {caseData.caseNumber}
            </p>
          </div>
        </div>

        <div className="flex gap-2">
          <Badge variant="secondary" className="flex items-center gap-1">
            <FileText className="h-3 w-3" />
            {document.pageCount} pages
          </Badge>
          <Badge variant="outline" className="flex items-center gap-1">
            <Eye className="h-3 w-3" />
            {highlights.length} highlights
          </Badge>
        </div>
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        
        {/* Sidebar - Index Items and Highlights */}
        <div className="lg:col-span-1 space-y-4">
          
          {/* Index Items */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Index Items ({indexItems.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {indexItems.length === 0 ? (
                <p className="text-sm text-gray-500">No index items detected</p>
              ) : (
                indexItems.map((item) => (
                  <div
                    key={item.id}
                    className={`p-2 rounded border cursor-pointer transition-colors ${
                      selectedItemId === item.id
                        ? 'bg-blue-50 border-blue-200'
                        : 'hover:bg-gray-50'
                    }`}
                    onClick={() => handleItemClick(item)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">
                          {item.tabNumber}
                        </p>
                        <p className="text-xs text-gray-600 truncate">
                          {item.tabTitle}
                        </p>
                      </div>
                      {item.page_hint && (
                        <Badge variant="outline" className="text-xs">
                          p.{item.page_hint}
                        </Badge>
                      )}
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          {/* Highlight Statistics */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Highlights</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-4 h-3 bg-green-200 border-2 border-green-600 rounded"></div>
                  <span className="text-sm">Index Rows</span>
                </div>
                <Badge variant="secondary">{indexHighlights.length}</Badge>
              </div>
              
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-4 h-3 bg-blue-200 border-2 border-blue-600 rounded"></div>
                  <span className="text-sm">Link Candidates</span>
                </div>
                <Badge variant="secondary">{candidateHighlights.length}</Badge>
              </div>
              
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-4 h-3 bg-yellow-200 border-2 border-yellow-600 rounded"></div>
                  <span className="text-sm">Custom</span>
                </div>
                <Badge variant="secondary">{customHighlights.length}</Badge>
              </div>
            </CardContent>
          </Card>

          {/* Actions */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Link href={`/cases/${caseId}/documents/${documentId}/review-links`}>
                <Button variant="outline" className="w-full text-sm">
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Review Links
                </Button>
              </Link>
              
              <Button variant="outline" className="w-full text-sm" disabled>
                <MapPin className="h-4 w-4 mr-2" />
                Add Custom Highlight
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Main Content - PDF Viewer */}
        <div className="lg:col-span-3">
          <Card className="h-full">
            <CardHeader className="pb-4">
              <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList>
                  <TabsTrigger value="pdf">PDF with Highlights</TabsTrigger>
                  <TabsTrigger value="highlights">Highlight List</TabsTrigger>
                </TabsList>
              </Tabs>
            </CardHeader>
            
            <CardContent className="p-0">
              <Tabs value={activeTab} onValueChange={setActiveTab}>
                
                <TabsContent value="pdf" className="m-0">
                  <div className="h-[800px] overflow-hidden">
                    <PdfWithOverlay
                      fileUrl={fileUrl}
                      documentId={documentId!}
                      selectedItemId={selectedItemId}
                    />
                  </div>
                </TabsContent>

                <TabsContent value="highlights" className="m-0 p-6">
                  <div className="space-y-4">
                    <h3 className="text-lg font-semibold">All Highlights</h3>
                    
                    {highlights.length === 0 ? (
                      <p className="text-gray-500">No highlights generated yet</p>
                    ) : (
                      <div className="space-y-3">
                        {highlights.map((highlight) => (
                          <div
                            key={highlight.id}
                            className="p-3 border rounded-lg hover:bg-gray-50"
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-1">
                                  <Badge 
                                    variant={
                                      highlight.kind === 'index-row' ? 'default' :
                                      highlight.kind === 'candidate-link' ? 'secondary' : 'outline'
                                    }
                                  >
                                    {highlight.kind.replace('-', ' ')}
                                  </Badge>
                                  <span className="text-sm text-gray-600">
                                    Page {highlight.page_number}
                                  </span>
                                </div>
                                <p className="text-sm font-medium">
                                  {highlight.label || 'Unlabeled highlight'}
                                </p>
                                {highlight.confidence && (
                                  <p className="text-xs text-gray-500">
                                    Confidence: {Math.round(highlight.confidence * 100)}%
                                  </p>
                                )}
                              </div>
                              
                              <Button variant="ghost" size="sm">
                                <Eye className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </TabsContent>

              </Tabs>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
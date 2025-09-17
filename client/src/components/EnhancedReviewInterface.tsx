import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { 
  Edit3, 
  Save, 
  Download, 
  Eye, 
  Highlighter, 
  FileText, 
  CheckCircle, 
  XCircle,
  RefreshCw,
  AlertCircle,
  Target,
  Hash
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';

interface Hyperlink {
  id: string;
  text: string;
  sourcePage: number;
  sourceCoordinates: number[];
  targetPage: number;
  targetParagraph?: string;
  type: string;
  highlighted: boolean;
  approved: boolean;
  notes?: string;
}

interface ReviewData {
  total: number;
  links: Hyperlink[];
  documentPath: string;
  outputDir: string;
}

interface EnhancedReviewInterfaceProps {
  reviewDataUrl: string;
  title: string;
  documentType: string;
}

export function EnhancedReviewInterface({ reviewDataUrl, title, documentType }: EnhancedReviewInterfaceProps) {
  const [editingLink, setEditingLink] = useState<string | null>(null);
  const [localEdits, setLocalEdits] = useState<Record<string, Partial<Hyperlink>>>({});
  const [selectedHighlights, setSelectedHighlights] = useState<Set<string>>(new Set());
  const [regenerating, setRegenerating] = useState(false);
  
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Load review data
  const { data: reviewData, isLoading, error } = useQuery({
    queryKey: [reviewDataUrl],
    queryFn: async (): Promise<ReviewData> => {
      const response = await fetch(reviewDataUrl);
      if (!response.ok) throw new Error('Failed to load review data');
      return response.json();
    }
  });

  // Update hyperlink mutation
  const updateHyperlinkMutation = useMutation({
    mutationFn: async (updates: { linkId: string; changes: Partial<Hyperlink> }) => {
      return await apiRequest('/api/update-hyperlink', {
        method: 'POST',
        body: JSON.stringify({
          documentType,
          linkId: updates.linkId,
          changes: updates.changes
        })
      });
    },
    onSuccess: () => {
      toast({
        title: "Hyperlink Updated",
        description: "Changes saved successfully",
      });
      queryClient.invalidateQueries({ queryKey: [reviewDataUrl] });
    }
  });

  // Regenerate PDF mutation
  const regeneratePdfMutation = useMutation({
    mutationFn: async (options: { highlightedLinks: string[]; documentType: string }) => {
      return await apiRequest('/api/regenerate-pdf', {
        method: 'POST',
        body: JSON.stringify(options)
      });
    },
    onSuccess: (data) => {
      toast({
        title: "PDF Regenerated",
        description: "New PDF created with your changes",
      });
      setRegenerating(false);
    }
  });

  const handleEditStart = (linkId: string, currentLink: Hyperlink) => {
    setEditingLink(linkId);
    setLocalEdits({
      ...localEdits,
      [linkId]: {
        targetPage: currentLink.targetPage,
        targetParagraph: currentLink.targetParagraph || '',
        highlighted: currentLink.highlighted,
        notes: currentLink.notes || ''
      }
    });
  };

  const handleEditSave = async (linkId: string) => {
    const changes = localEdits[linkId];
    if (!changes) return;

    await updateHyperlinkMutation.mutateAsync({ linkId, changes });
    setEditingLink(null);
    
    // Remove from local edits
    const { [linkId]: removed, ...remainingEdits } = localEdits;
    setLocalEdits(remainingEdits);
  };

  const handleEditCancel = (linkId: string) => {
    setEditingLink(null);
    const { [linkId]: removed, ...remainingEdits } = localEdits;
    setLocalEdits(remainingEdits);
  };

  const toggleHighlight = (linkId: string) => {
    const newHighlights = new Set(selectedHighlights);
    if (newHighlights.has(linkId)) {
      newHighlights.delete(linkId);
    } else {
      newHighlights.add(linkId);
    }
    setSelectedHighlights(newHighlights);
  };

  const handleRegeneratePdf = async () => {
    setRegenerating(true);
    await regeneratePdfMutation.mutateAsync({
      highlightedLinks: Array.from(selectedHighlights),
      documentType
    });
  };

  const getEditValue = (linkId: string, field: keyof Hyperlink, defaultValue: any) => {
    return localEdits[linkId]?.[field] ?? defaultValue;
  };

  const updateLocalEdit = (linkId: string, field: keyof Hyperlink, value: any) => {
    setLocalEdits({
      ...localEdits,
      [linkId]: {
        ...localEdits[linkId],
        [field]: value
      }
    });
  };

  if (isLoading) {
    return (
      <Card className="w-full bg-slate-900 border-slate-700">
        <CardContent className="p-6">
          <div className="flex items-center justify-center space-x-2">
            <RefreshCw className="w-5 h-5 animate-spin text-blue-400" />
            <span className="text-white">Loading review data...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="w-full bg-slate-900 border-slate-700">
        <CardContent className="p-6">
          <div className="flex items-center space-x-2 text-red-400">
            <AlertCircle className="w-5 h-5" />
            <span>Error loading review data</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full bg-slate-900 border-slate-700">
      <CardHeader>
        <CardTitle className="flex items-center justify-between text-white">
          <span className="flex items-center">
            <FileText className="mr-3 text-blue-400" />
            {title} - Enhanced Review
          </span>
          <Badge variant="secondary" className="bg-blue-600">
            {reviewData?.total || 0} hyperlinks
          </Badge>
        </CardTitle>
        <CardDescription className="text-gray-400">
          Edit hyperlink destinations, add highlights, and regenerate PDFs with your changes
        </CardDescription>
      </CardHeader>
      
      <CardContent className="space-y-6">
        {/* Control Panel */}
        <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-4">
              <div className="text-white">
                <span className="font-semibold">{selectedHighlights.size}</span> hyperlinks selected for highlighting
              </div>
            </div>
            <div className="flex items-center space-x-3">
              <Button
                onClick={handleRegeneratePdf}
                disabled={regenerating}
                className="bg-gradient-to-r from-green-600 to-blue-600 hover:from-green-500 hover:to-blue-500"
                data-testid="button-regenerate-pdf"
              >
                {regenerating ? (
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Download className="w-4 h-4 mr-2" />
                )}
                Regenerate PDF
              </Button>
            </div>
          </div>
          
          <div className="flex items-center space-x-4 text-sm text-gray-400">
            <div className="flex items-center">
              <Highlighter className="w-4 h-4 mr-1" />
              Select hyperlinks to highlight in the final PDF
            </div>
            <div className="flex items-center">
              <Edit3 className="w-4 h-4 mr-1" />
              Click edit to change page/paragraph destinations
            </div>
          </div>
        </div>

        {/* Hyperlinks List */}
        <div className="space-y-3 max-h-96 overflow-y-auto">
          {reviewData?.links.map((link) => (
            <div key={link.id} className="bg-slate-800 rounded-lg p-4 border border-slate-700">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  {/* Hyperlink Text and Type */}
                  <div className="flex items-center space-x-3 mb-3">
                    <Badge variant="outline" className="text-white border-slate-600">
                      {link.type}
                    </Badge>
                    <span className="font-medium text-white">"{link.text}"</span>
                    <span className="text-gray-400 text-sm">Page {link.sourcePage}</span>
                  </div>

                  {/* Edit Mode */}
                  {editingLink === link.id ? (
                    <div className="space-y-3 bg-slate-700 rounded p-3">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label className="text-white flex items-center">
                            <Target className="w-4 h-4 mr-1" />
                            Target Page
                          </Label>
                          <Input
                            type="number"
                            value={getEditValue(link.id, 'targetPage', link.targetPage)}
                            onChange={(e) => updateLocalEdit(link.id, 'targetPage', parseInt(e.target.value))}
                            className="bg-slate-600 border-slate-500 text-white"
                            min="1"
                            data-testid={`input-target-page-${link.id}`}
                          />
                        </div>
                        <div>
                          <Label className="text-white flex items-center">
                            <Hash className="w-4 h-4 mr-1" />
                            Target Paragraph (Optional)
                          </Label>
                          <Input
                            value={getEditValue(link.id, 'targetParagraph', link.targetParagraph || '')}
                            onChange={(e) => updateLocalEdit(link.id, 'targetParagraph', e.target.value)}
                            placeholder="e.g., paragraph 3, section A"
                            className="bg-slate-600 border-slate-500 text-white"
                            data-testid={`input-target-paragraph-${link.id}`}
                          />
                        </div>
                      </div>
                      
                      <div>
                        <Label className="text-white">Notes (Optional)</Label>
                        <Textarea
                          value={getEditValue(link.id, 'notes', link.notes || '')}
                          onChange={(e) => updateLocalEdit(link.id, 'notes', e.target.value)}
                          placeholder="Add notes about this hyperlink..."
                          className="bg-slate-600 border-slate-500 text-white"
                          rows={2}
                          data-testid={`textarea-notes-${link.id}`}
                        />
                      </div>

                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2">
                          <Switch
                            checked={getEditValue(link.id, 'highlighted', link.highlighted)}
                            onCheckedChange={(checked) => updateLocalEdit(link.id, 'highlighted', checked)}
                            data-testid={`switch-highlight-${link.id}`}
                          />
                          <Label className="text-white">Highlight in PDF</Label>
                        </div>
                        
                        <div className="flex items-center space-x-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleEditCancel(link.id)}
                            className="text-white border-slate-600 hover:bg-slate-700"
                            data-testid={`button-cancel-${link.id}`}
                          >
                            <XCircle className="w-4 h-4 mr-1" />
                            Cancel
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => handleEditSave(link.id)}
                            disabled={updateHyperlinkMutation.isPending}
                            className="bg-green-600 hover:bg-green-500"
                            data-testid={`button-save-${link.id}`}
                          >
                            <Save className="w-4 h-4 mr-1" />
                            Save
                          </Button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    /* Display Mode */
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-4">
                        <div className="text-gray-300">
                          → Page <span className="font-semibold text-white">{link.targetPage}</span>
                          {link.targetParagraph && (
                            <span className="text-gray-400"> ({link.targetParagraph})</span>
                          )}
                        </div>
                        
                        {link.highlighted && (
                          <Badge className="bg-yellow-600 text-yellow-100">
                            <Highlighter className="w-3 h-3 mr-1" />
                            Highlighted
                          </Badge>
                        )}
                      </div>

                      <div className="flex items-center space-x-2">
                        <label className="flex items-center space-x-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={selectedHighlights.has(link.id)}
                            onChange={() => toggleHighlight(link.id)}
                            className="rounded border-slate-600 text-yellow-600"
                            data-testid={`checkbox-highlight-${link.id}`}
                          />
                          <span className="text-sm text-gray-400">Highlight</span>
                        </label>
                        
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleEditStart(link.id, link)}
                          className="text-white border-slate-600 hover:bg-slate-700"
                          data-testid={`button-edit-${link.id}`}
                        >
                          <Edit3 className="w-4 h-4 mr-1" />
                          Edit
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Notes Display */}
              {link.notes && !editingLink && (
                <div className="mt-3 p-2 bg-slate-700 rounded text-sm text-gray-300">
                  <strong>Notes:</strong> {link.notes}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Quick Actions */}
        <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
          <div className="flex items-center justify-between">
            <div className="text-white">
              <h3 className="font-semibold mb-1">Quick Actions</h3>
              <p className="text-gray-400 text-sm">Bulk operations for multiple hyperlinks</p>
            </div>
            
            <div className="flex items-center space-x-3">
              <Button
                variant="outline"
                onClick={() => setSelectedHighlights(new Set(reviewData?.links.map(l => l.id) || []))}
                className="text-white border-slate-600 hover:bg-slate-700"
                data-testid="button-select-all"
              >
                Select All for Highlighting
              </Button>
              
              <Button
                variant="outline"
                onClick={() => setSelectedHighlights(new Set())}
                className="text-white border-slate-600 hover:bg-slate-700"
                data-testid="button-clear-selection"
              >
                Clear Selection
              </Button>
              
              <Button
                asChild
                variant="outline"
                className="text-white border-slate-600 hover:bg-slate-700"
              >
                <a
                  href={`/${reviewData?.outputDir}/Master.linked.pdf`}
                  target="_blank"
                  rel="noopener noreferrer"
                  data-testid="button-view-current-pdf"
                >
                  <Eye className="w-4 h-4 mr-2" />
                  View Current PDF
                </a>
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
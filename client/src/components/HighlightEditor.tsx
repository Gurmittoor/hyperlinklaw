import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';

interface HighlightPosition {
  id?: string;
  tabNumber: number;
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  opacity: number;
  text?: string;
  isCustom: boolean;
}

interface HighlightEditorProps {
  documentId: string;
  caseId: string;
  isOpen: boolean;
  onClose: () => void;
  onSave: () => void;
}

export function HighlightEditor({ documentId, caseId, isOpen, onClose, onSave }: HighlightEditorProps) {
  const [highlights, setHighlights] = useState<HighlightPosition[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const { toast } = useToast();

  // Load existing highlight positions
  useEffect(() => {
    if (isOpen && documentId) {
      loadHighlightPositions();
    }
  }, [isOpen, documentId]);

  const loadHighlightPositions = async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`/api/documents/${documentId}/highlight-positions`);
      if (response.ok) {
        const data = await response.json();
        if (data.length === 0) {
          // Create default positions for 13 tabs
          const defaultHighlights = Array.from({ length: 13 }, (_, i) => ({
            tabNumber: i + 1,
            x: 0.08, // 8% from left
            y: 0.80 - (i * 0.04), // Start at 80% from top, 4% spacing
            width: 0.84, // 84% width
            height: 0.025, // 2.5% height
            color: '#FFFF00',
            opacity: 0.3,
            text: `Tab ${i + 1}`,
            isCustom: false,
          }));
          setHighlights(defaultHighlights);
        } else {
          setHighlights(data.map((h: any) => ({
            ...h,
            x: parseFloat(h.x),
            y: parseFloat(h.y),
            width: parseFloat(h.width),
            height: parseFloat(h.height),
            opacity: parseFloat(h.opacity),
          })));
        }
      }
    } catch (error) {
      console.error('Error loading highlight positions:', error);
      toast({
        title: 'Error',
        description: 'Failed to load highlight positions',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const saveHighlightPositions = async () => {
    setIsSaving(true);
    try {
      const response = await fetch(`/api/documents/${documentId}/highlight-positions`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ highlights }),
      });

      if (response.ok) {
        toast({
          title: 'Success',
          description: 'Highlight positions saved successfully',
        });
        onSave();
        onClose();
      } else {
        throw new Error('Failed to save');
      }
    } catch (error) {
      console.error('Error saving highlight positions:', error);
      toast({
        title: 'Error',
        description: 'Failed to save highlight positions',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const updateHighlight = (index: number, field: keyof HighlightPosition, value: any) => {
    const updated = [...highlights];
    updated[index] = { ...updated[index], [field]: value, isCustom: true };
    setHighlights(updated);
  };

  const resetToDefaults = async () => {
    try {
      await fetch(`/api/documents/${documentId}/reset-highlights`, {
        method: 'POST',
      });
      
      toast({
        title: 'Reset Complete',
        description: 'All highlights reset to default positions',
      });
      
      loadHighlightPositions();
    } catch (error) {
      console.error('Error resetting highlights:', error);
      toast({
        title: 'Error',
        description: 'Failed to reset highlights',
        variant: 'destructive',
      });
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <Card className="w-full max-w-4xl max-h-[90vh] overflow-y-auto">
        <CardHeader>
          <CardTitle>Edit Tab Highlight Positions</CardTitle>
          <p className="text-sm text-gray-600">
            Adjust the position, size, and appearance of tab highlights on the index page.
            Values are normalized (0-1) relative to the page dimensions.
          </p>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8">Loading highlight positions...</div>
          ) : (
            <div className="space-y-4">
              <div className="flex gap-2 mb-4">
                <Button 
                  onClick={() => {
                    const pdfUrl = `/online/pdf/${caseId}/${documentId}`;
                    window.open(pdfUrl, '_blank');
                  }}
                  className="flex-1 bg-blue-500 text-white hover:bg-blue-600 text-base py-3"
                  data-testid="button-view-pdf"
                >
                  <i className="fas fa-eye mr-2"></i>
                  View
                </Button>
                <Button 
                  onClick={resetToDefaults} 
                  className="flex-1 bg-orange-500 text-white hover:bg-orange-600 text-base py-3"
                  data-testid="button-edit-highlights"
                >
                  <i className="fas fa-edit mr-2"></i>
                  Edit
                </Button>
                <Button 
                  onClick={saveHighlightPositions} 
                  disabled={isSaving} 
                  className="flex-1 bg-green-500 text-white hover:bg-green-600 text-base py-3 disabled:bg-green-300"
                  data-testid="button-save-highlights"
                >
                  <i className={`fas ${isSaving ? 'fa-spinner fa-spin' : 'fa-save'} mr-2`}></i>
                  {isSaving ? 'Saving...' : 'Save'}
                </Button>
              </div>
              
              <div className="flex gap-2 mb-4">
                <Button onClick={onClose} variant="outline" size="sm" className="ml-auto">
                  <i className="fas fa-times mr-1"></i>
                  Cancel
                </Button>
              </div>

              <div className="grid gap-4">
                {highlights.map((highlight, index) => (
                  <Card key={highlight.tabNumber} className="p-4">
                    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 items-center">
                      <div>
                        <Label className="text-sm font-medium">Tab {highlight.tabNumber}</Label>
                      </div>
                      
                      <div>
                        <Label htmlFor={`x-${index}`} className="text-xs">X Position</Label>
                        <Input
                          id={`x-${index}`}
                          type="number"
                          step="0.01"
                          min="0"
                          max="1"
                          value={highlight.x}
                          onChange={(e) => updateHighlight(index, 'x', parseFloat(e.target.value))}
                          className="text-sm"
                        />
                      </div>
                      
                      <div>
                        <Label htmlFor={`y-${index}`} className="text-xs">Y Position</Label>
                        <Input
                          id={`y-${index}`}
                          type="number"
                          step="0.01"
                          min="0"
                          max="1"
                          value={highlight.y}
                          onChange={(e) => updateHighlight(index, 'y', parseFloat(e.target.value))}
                          className="text-sm"
                        />
                      </div>
                      
                      <div>
                        <Label htmlFor={`width-${index}`} className="text-xs">Width</Label>
                        <Input
                          id={`width-${index}`}
                          type="number"
                          step="0.01"
                          min="0.01"
                          max="1"
                          value={highlight.width}
                          onChange={(e) => updateHighlight(index, 'width', parseFloat(e.target.value))}
                          className="text-sm"
                        />
                      </div>
                      
                      <div>
                        <Label htmlFor={`height-${index}`} className="text-xs">Height</Label>
                        <Input
                          id={`height-${index}`}
                          type="number"
                          step="0.01"
                          min="0.01"
                          max="1"
                          value={highlight.height}
                          onChange={(e) => updateHighlight(index, 'height', parseFloat(e.target.value))}
                          className="text-sm"
                        />
                      </div>
                      
                      <div>
                        <Label htmlFor={`opacity-${index}`} className="text-xs">Opacity</Label>
                        <Input
                          id={`opacity-${index}`}
                          type="number"
                          step="0.1"
                          min="0.1"
                          max="1"
                          value={highlight.opacity}
                          onChange={(e) => updateHighlight(index, 'opacity', parseFloat(e.target.value))}
                          className="text-sm"
                        />
                      </div>
                    </div>
                    
                    <div className="mt-2 flex items-center gap-4">
                      <div>
                        <Label htmlFor={`color-${index}`} className="text-xs">Color</Label>
                        <div className="flex items-center gap-2">
                          <Input
                            id={`color-${index}`}
                            type="color"
                            value={highlight.color}
                            onChange={(e) => updateHighlight(index, 'color', e.target.value)}
                            className="w-12 h-8 p-1"
                          />
                          <Input
                            type="text"
                            value={highlight.color}
                            onChange={(e) => updateHighlight(index, 'color', e.target.value)}
                            className="text-sm w-20"
                            placeholder="#FFFF00"
                          />
                        </div>
                      </div>
                      
                      <div className="flex-1">
                        <Label htmlFor={`text-${index}`} className="text-xs">Text Label (optional)</Label>
                        <Input
                          id={`text-${index}`}
                          type="text"
                          value={highlight.text || ''}
                          onChange={(e) => updateHighlight(index, 'text', e.target.value)}
                          className="text-sm"
                          placeholder="Tab description"
                        />
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
              
              <div className="flex justify-end gap-2 mt-6 pt-4 border-t">
                <Button onClick={onClose} variant="outline">
                  Cancel
                </Button>
                <Button onClick={saveHighlightPositions} disabled={isSaving}>
                  {isSaving ? 'Saving...' : 'Save All Positions'}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
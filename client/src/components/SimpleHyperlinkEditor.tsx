import { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface TabItem {
  tabNo: number;
  date: string;
  nature: string;
  targetPage?: number; // Current page number
}

interface SimpleHyperlinkEditorProps {
  documentId: string;
  caseId: string;
  onClose: () => void;
}

export default function SimpleHyperlinkEditor({ documentId, caseId, onClose }: SimpleHyperlinkEditorProps) {
  const [editedTabs, setEditedTabs] = useState<TabItem[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const { toast } = useToast();

  // Fetch current document tab data
  const { data: documentData, isLoading } = useQuery({
    queryKey: [`/api/documents/${documentId}`],
    queryFn: async () => {
      const response = await fetch(`/api/documents/${documentId}/tabs`);
      if (!response.ok) throw new Error('Failed to fetch document tabs');
      return response.json();
    },
  });

  // Initialize tabs with default page numbers (can be edited)
  useEffect(() => {
    if (documentData?.tabs) {
      // Add default page numbers if not set
      const tabsWithPages = documentData.tabs.map((tab: TabItem, index: number) => ({
        ...tab,
        targetPage: tab.targetPage || (index + 1) * 10 // Default page spacing
      }));
      setEditedTabs(tabsWithPages);
    }
  }, [documentData]);

  // Update tab page number
  const updateTabPage = (tabNo: number, newPage: number) => {
    setEditedTabs(prev => 
      prev.map(tab => 
        tab.tabNo === tabNo 
          ? { ...tab, targetPage: newPage }
          : tab
      )
    );
  };

  // Save changes and regenerate hyperlinks
  const confirmChangesMutation = useMutation({
    mutationFn: async () => {
      setIsGenerating(true);
      
      // Update tab data with new page numbers
      const response = await fetch(`/api/documents/${documentId}/update-tabs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tabs: editedTabs })
      });
      
      if (!response.ok) throw new Error('Failed to update tabs');
      
      // Regenerate hyperlinks with new page numbers
      const regenerateResponse = await fetch(`/api/documents/${documentId}/highlight-tabs`, {
        method: 'POST'
      });
      
      if (!regenerateResponse.ok) throw new Error('Failed to regenerate hyperlinks');
      
      return regenerateResponse;
    },
    onSuccess: () => {
      toast({
        title: "Hyperlinks Updated!",
        description: "New page numbers saved and hyperlinks regenerated. Review online to see changes.",
      });
      setIsGenerating(false);
      onClose();
    },
    onError: (error: any) => {
      toast({
        title: "Update Failed", 
        description: error.message,
        variant: "destructive",
      });
      setIsGenerating(false);
    },
  });

  if (isLoading) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-white dark:bg-gray-900 rounded-lg p-6 max-w-2xl w-full mx-4">
          <div className="flex items-center justify-center py-8">
            <i className="fas fa-spinner fa-spin text-2xl mr-3"></i>
            Loading hyperlinks...
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-900 rounded-lg p-6 max-w-4xl w-full mx-4 max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between mb-6 pb-4 border-b">
          <div>
            <h2 className="text-2xl font-bold">Edit Hyperlink Pages</h2>
            <p className="text-gray-600 dark:text-gray-400 mt-1">
              Simply change the page numbers and click Confirm to update all hyperlinks
            </p>
          </div>
          <button 
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
          >
            <i className="fas fa-times text-xl"></i>
          </button>
        </div>

        {/* Tabs List */}
        <div className="flex-1 overflow-y-auto mb-6">
          <div className="space-y-3">
            {editedTabs.map((tab) => (
              <div 
                key={tab.tabNo}
                className="flex items-center gap-4 p-4 border rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              >
                {/* Tab Badge */}
                <div className="bg-blue-600 text-white px-3 py-2 rounded-lg font-medium min-w-[80px] text-center">
                  Tab {tab.tabNo}
                </div>

                {/* Tab Info */}
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-gray-900 dark:text-white">
                    {tab.nature}
                  </div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">
                    {tab.date}
                  </div>
                </div>

                {/* Original Hyperlink Display */}
                <div className="flex flex-col gap-3 min-w-0 flex-1">
                  <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg border">
                    <div className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                      Current Hyperlink:
                    </div>
                    <div className="text-sm text-blue-600 dark:text-blue-400 font-medium">
                      👆 Click to open PDF at page {tab.targetPage || 1}
                    </div>
                  </div>
                  
                  {/* Page Number Editor */}
                  <div className="flex items-center gap-3">
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300 whitespace-nowrap">
                      New Page:
                    </label>
                    <Input
                      type="number"
                      min="1"
                      value={tab.targetPage || ''}
                      onChange={(e) => updateTabPage(tab.tabNo, parseInt(e.target.value) || 1)}
                      className="w-24 text-center font-medium"
                      placeholder="Page"
                    />
                  </div>
                  
                  {/* New Hyperlink Preview */}
                  <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
                    <div className="text-xs font-medium text-green-600 dark:text-green-400 mb-1">
                      New Hyperlink Will Be:
                    </div>
                    <div className="text-sm text-green-700 dark:text-green-300 font-medium">
                      👆 Click to open PDF at page {tab.targetPage || 1}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between pt-4 border-t">
          <div className="text-sm text-gray-600 dark:text-gray-400">
            Changes will update the online hosted HTML index immediately
          </div>
          
          <div className="flex gap-3">
            <Button 
              variant="outline" 
              onClick={onClose}
              disabled={isGenerating}
            >
              Cancel
            </Button>
            
            <Button 
              onClick={() => confirmChangesMutation.mutate()}
              disabled={isGenerating}
              className="bg-green-600 hover:bg-green-700"
            >
              {isGenerating ? (
                <>
                  <i className="fas fa-spinner fa-spin mr-2"></i>
                  Generating...
                </>
              ) : (
                <>
                  <i className="fas fa-check mr-2"></i>
                  Confirm Changes
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Help Text */}
        <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
          <div className="text-sm text-blue-800 dark:text-blue-200">
            <i className="fas fa-info-circle mr-2"></i>
            <strong>How it works:</strong> Enter the page number where each tab should link to. 
            When you click "Confirm Changes", new hyperlinks will be created and the online HTML index will be updated instantly.
          </div>
        </div>
      </div>
    </div>
  );
}
import { Link2 } from 'lucide-react';
import { useLocation } from 'wouter';

interface HeaderProps {
  caseData?: {
    id?: string;
    caseNumber: string;
    title: string;
  };
  selectedCount: number;
  onProcessSelected: () => void;
  onUploadDocuments: () => void;
}

export default function Header({ 
  caseData, 
  selectedCount, 
  onProcessSelected, 
  onUploadDocuments 
}: HeaderProps) {
  const [, setLocation] = useLocation();
  
  const handleReviewHyperlinks = () => {
    if (caseData?.id) {
      setLocation(`/cases/${caseData.id}/review`);
    }
  };
  
  return (
    <header className="bg-card border-b border-border px-6 py-4" data-testid="header">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Case Documents</h2>
          <p className="text-sm text-muted-foreground mt-1">
            {caseData ? `Case #${caseData.caseNumber} - ${caseData.title}` : "Select a case to view documents"}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button 
            className="px-4 py-2 bg-secondary text-secondary-foreground rounded-md hover:bg-secondary/80 transition-colors flex items-center gap-2 disabled:opacity-50"
            onClick={onProcessSelected}
            disabled={selectedCount === 0}
            data-testid="button-process-selected"
          >
            <i className="fas fa-cogs text-sm"></i>
            Process Selected ({selectedCount})
          </button>
          <button 
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors flex items-center gap-2"
            onClick={handleReviewHyperlinks}
            disabled={!caseData?.id}
            data-testid="button-review-hyperlinks"
          >
            <Link2 className="w-4 h-4" />
            Review Hyperlinks
          </button>
          <button 
            className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors flex items-center gap-2"
            onClick={onUploadDocuments}
            data-testid="button-upload-documents"
          >
            <i className="fas fa-plus text-sm"></i>
            Upload Documents
          </button>
        </div>
      </div>
    </header>
  );
}

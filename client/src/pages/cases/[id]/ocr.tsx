import { useRoute, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { OCRProcessingStep } from "@/components/workflow/OCRProcessingStep";
import type { Document } from "@shared/schema";

export default function OCRPage() {
  const [match] = useRoute('/cases/:caseId/ocr');
  const [location] = useLocation();
  
  // Extract case ID more reliably
  const getCaseIdFromUrl = () => {
    const caseMatch = location.match(/\/cases\/([a-f0-9-]+)/);
    return caseMatch ? caseMatch[1] : null;
  };
  
  const caseId = (match ? (match as any).params?.caseId : null) || getCaseIdFromUrl();

  // Fetch case documents
  const { data: documents = [] } = useQuery<Document[]>({
    queryKey: [`/api/cases/${caseId}/documents`],
    enabled: !!caseId,
  });

  const handleOCRComplete = () => {
    // This will be handled by the workflow step component
    console.log("OCR processing completed");
  };

  if (!caseId) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-lg text-muted-foreground">Case ID not found</div>
      </div>
    );
  }

  return (
    <OCRProcessingStep 
      caseId={caseId}
      documents={documents}
      onOCRComplete={handleOCRComplete}
    />
  );
}
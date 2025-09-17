import { useParams } from "wouter";
import { useLocation } from "wouter";
import SimpleHyperlinkEditor from "@/components/SimpleHyperlinkEditor";

export default function Review() {
  const params = useParams<{ caseId: string; docId: string }>();
  const [, setLocation] = useLocation();

  const handleClose = () => {
    setLocation(`/cases/${params.caseId}`);
  };

  if (!params.caseId || !params.docId) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-muted-foreground">Invalid document or case ID</p>
      </div>
    );
  }

  return (
    <SimpleHyperlinkEditor 
      documentId={params.docId}
      caseId={params.caseId}
      onClose={handleClose}
    />
  );
}

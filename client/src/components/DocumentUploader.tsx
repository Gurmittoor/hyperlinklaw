import ObjectUploader from "./ObjectUploader";

interface DocumentUploaderProps {
  caseId: string;
  onUploadComplete: () => void;
  onClose: () => void;
}

export default function DocumentUploader({ caseId, onUploadComplete, onClose }: DocumentUploaderProps) {
  return (
    <ObjectUploader 
      caseId={caseId}
      onUploadComplete={onUploadComplete}
      onClose={onClose}
    />
  );
}

import { useEffect } from "react";
import { useLocation } from "wouter";

export function RedirectToLatestCaseOCR() {
  const [, setLocation] = useLocation();

  useEffect(() => {
    const redirectToLatestCase = async () => {
      try {
        // First try the last opened case from localStorage
        const lastCaseId = localStorage.getItem("lastOpenedCaseId");
        if (lastCaseId) {
          setLocation(`/cases/${lastCaseId}/ocr`);
          return;
        }

        // Fallback: fetch the most recent case
        const response = await fetch("/api/cases?limit=1&sort=recent", { 
          credentials: "include" 
        });
        
        if (response.ok) {
          const cases = await response.json();
          const latestCase = cases?.[0];
          
          if (latestCase?.id) {
            setLocation(`/cases/${latestCase.id}/ocr`);
            return;
          }
        }

        // Final fallback: redirect to case management
        setLocation("/case-management");
      } catch (error) {
        console.error("Error redirecting to latest case OCR:", error);
        setLocation("/case-management");
      }
    };

    redirectToLatestCase();
  }, [setLocation]);

  // Show loading while redirecting
  return (
    <div className="flex items-center justify-center h-64">
      <div className="flex items-center gap-3">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <span className="text-lg">Redirecting to OCR processing...</span>
      </div>
    </div>
  );
}
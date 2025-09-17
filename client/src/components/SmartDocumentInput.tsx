import { useState, useEffect, useRef } from "react";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import type { DocumentMemory } from "@shared/schema";

interface SmartDocumentInputProps {
  caseId: string;
  fileName: string;
  onDocumentInfo: (info: { title: string; alias?: string; fileNumber?: string }) => void;
  onDuplicateWarning: (duplicates: any[]) => void;
}

export default function SmartDocumentInput({ 
  caseId, 
  fileName, 
  onDocumentInfo, 
  onDuplicateWarning 
}: SmartDocumentInputProps) {
  const [title, setTitle] = useState("");
  const [alias, setAlias] = useState("");
  const [fileNumber, setFileNumber] = useState("");
  const [suggestions, setSuggestions] = useState<DocumentMemory[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [duplicates, setDuplicates] = useState<any[]>([]);
  const [showDuplicateWarning, setShowDuplicateWarning] = useState(false);
  const { toast } = useToast();
  const titleInputRef = useRef<HTMLInputElement>(null);

  // Check for duplicates when fileName changes
  useEffect(() => {
    if (fileName && caseId) {
      checkDuplicates();
    }
  }, [fileName, caseId]);

  // Get suggestions when typing
  useEffect(() => {
    if (title.length > 1) {
      getSuggestions(title);
    } else {
      setSuggestions([]);
      setShowSuggestions(false);
    }
  }, [title]);

  // Update parent component when info changes
  useEffect(() => {
    onDocumentInfo({ title, alias, fileNumber });
  }, [title, alias, fileNumber]);

  const checkDuplicates = async () => {
    try {
      const result = await api.documents.checkDuplicates(caseId, fileName);
      if (result.duplicates && result.duplicates.length > 0) {
        setDuplicates(result.duplicates);
        setShowDuplicateWarning(true);
        onDuplicateWarning(result.duplicates);
        toast({
          title: "Duplicate Files Found",
          description: `Found ${result.duplicates.length} similar document(s) in this case`,
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("Error checking duplicates:", error);
    }
  };

  const getSuggestions = async (query: string) => {
    try {
      const result = await api.documents.getSuggestions(query);
      setSuggestions(result);
      setShowSuggestions(result.length > 0);
    } catch (error) {
      console.error("Error fetching suggestions:", error);
    }
  };

  const selectSuggestion = (suggestion: DocumentMemory) => {
    setTitle(suggestion.documentName);
    setAlias(suggestion.alias ?? "");
    setFileNumber(suggestion.fileNumber ?? "");
    setShowSuggestions(false);
    
    // Save usage for this suggestion
    saveMemory(suggestion.documentName, suggestion.fileNumber ?? undefined, suggestion.alias ?? undefined);
  };

  const saveMemory = async (documentName: string, fileNumber?: string, alias?: string) => {
    try {
      await api.documents.saveMemory({
        documentName,
        fileNumber,
        alias
      });
    } catch (error) {
      console.error("Error saving document memory:", error);
    }
  };

  const handleSubmit = () => {
    if (title.trim()) {
      // Save this document info to memory for future use
      saveMemory(title, fileNumber, alias);
    }
  };

  return (
    <div className="space-y-4">
      {/* Duplicate Warning */}
      {showDuplicateWarning && duplicates.length > 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <i className="fas fa-exclamation-triangle text-yellow-600 mt-1"></i>
            <div className="flex-1">
              <h4 className="font-medium text-yellow-800 mb-2">
                Similar Documents Found
              </h4>
              <p className="text-yellow-700 text-sm mb-3">
                The following documents in this case have similar names:
              </p>
              <div className="space-y-2">
                {duplicates.slice(0, 3).map((doc, index) => (
                  <div key={index} className="text-sm text-yellow-700 bg-yellow-100 rounded p-2">
                    <div className="font-medium">{doc.title}</div>
                    <div className="text-xs">{doc.originalName}</div>
                  </div>
                ))}
                {duplicates.length > 3 && (
                  <div className="text-sm text-yellow-600">
                    ...and {duplicates.length - 3} more
                  </div>
                )}
              </div>
              <div className="mt-3 flex gap-2">
                <button
                  onClick={() => setShowDuplicateWarning(false)}
                  className="text-xs px-3 py-1 bg-yellow-200 text-yellow-800 rounded hover:bg-yellow-300"
                >
                  Continue Anyway
                </button>
                <button
                  onClick={() => setShowDuplicateWarning(false)}
                  className="text-xs px-3 py-1 bg-white text-yellow-700 border border-yellow-300 rounded hover:bg-yellow-50"
                >
                  Dismiss
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Document Title Input with Autocomplete */}
      <div className="relative">
        <label className="block text-sm font-medium mb-2">
          Document Title *
        </label>
        <input
          ref={titleInputRef}
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
          onFocus={() => title.length > 1 && suggestions.length > 0 && setShowSuggestions(true)}
          placeholder="Start typing document name..."
          className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          data-testid="input-document-title"
        />
        
        {/* Suggestions Dropdown */}
        {showSuggestions && suggestions.length > 0 && (
          <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-60 overflow-auto">
            <div className="p-2 text-xs text-gray-500 border-b">
              <i className="fas fa-lightbulb mr-1"></i>
              Previously used documents:
            </div>
            {suggestions.map((suggestion, index) => (
              <button
                key={index}
                onClick={() => selectSuggestion(suggestion)}
                className="w-full text-left px-3 py-2 hover:bg-blue-50 border-b border-gray-100 last:border-b-0"
              >
                <div className="font-medium text-sm">{suggestion.documentName}</div>
                <div className="text-xs text-gray-500 space-x-3">
                  {suggestion.fileNumber && (
                    <span>File: {suggestion.fileNumber}</span>
                  )}
                  {suggestion.alias && (
                    <span>Alias: {suggestion.alias}</span>
                  )}
                  <span className="text-blue-600">Used {suggestion.usageCount} times</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* File Number Input */}
      <div>
        <label className="block text-sm font-medium mb-2">
          File/Case Number
        </label>
        <input
          type="text"
          value={fileNumber}
          onChange={(e) => setFileNumber(e.target.value)}
          placeholder="e.g., 2024-CV-001, File #123"
          className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          data-testid="input-file-number"
        />
      </div>

      {/* Alias Input */}
      <div>
        <label className="block text-sm font-medium mb-2">
          Document Alias (Optional)
        </label>
        <input
          type="text"
          value={alias}
          onChange={(e) => setAlias(e.target.value)}
          placeholder="e.g., Exhibit A, Schedule 1, Attachment B"
          className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          data-testid="input-document-alias"
        />
        <p className="text-xs text-gray-500 mt-1">
          Aliases help identify documents quickly during review
        </p>
      </div>

      {/* Memory Feature Info */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
        <div className="flex items-start gap-2">
          <i className="fas fa-brain text-blue-600 mt-0.5"></i>
          <div className="text-sm text-blue-700">
            <div className="font-medium">Smart Memory</div>
            <div>
              Document names you type are remembered to speed up future uploads. 
              Start typing to see suggestions from previously entered documents.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
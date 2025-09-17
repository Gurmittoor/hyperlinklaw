import React from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { ExternalLink, FileText, Scale, Settings, Brain } from "lucide-react";
import { DynamicDocumentProcessor } from "@/components/DynamicDocumentProcessor";
import type { Document, Case } from "@shared/schema";

export default function HyperlinksPage() {
  const [location] = useLocation();
  
  // Extract case ID from URL - this page can be accessed from workflow sidebar
  const getCaseIdFromUrl = () => {
    const caseMatch = location.match(/\/cases\/([a-f0-9-]+)/);
    return caseMatch ? caseMatch[1] : null;
  };
  
  // Get cases to determine fallback case ID  
  const { data: cases = [] } = useQuery({
    queryKey: ['/api/cases'],
    retry: false,
  });
  
  const urlCaseId = getCaseIdFromUrl();
  const fallbackCaseId = Array.isArray(cases) && cases.length > 0 ? cases[0]?.id : null;
  const caseId = urlCaseId || fallbackCaseId;

  // Fetch case data
  const { data: caseData } = useQuery<Case>({
    queryKey: ["/api/cases", caseId],
    enabled: !!caseId,
  });

  // Fetch case documents
  const { data: documents = [], isLoading } = useQuery<Document[]>({
    queryKey: [`/api/cases/${caseId}/documents`],
    enabled: !!caseId,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-900 text-white p-8">
        <div className="flex items-center justify-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
          <span className="ml-4">Loading case documents...</span>
        </div>
      </div>
    );
  }

  if (!caseId) {
    return (
      <div className="min-h-screen bg-gray-900 text-white p-8">
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <Scale className="mx-auto h-12 w-12 text-gray-400 mb-4" />
            <h2 className="text-xl font-semibold text-gray-300">No Case Selected</h2>
            <p className="text-gray-400">Please select a case to process hyperlinks.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white p-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2 flex items-center">
            <Brain className="mr-3 text-blue-400" />
            AI Hyperlinking
          </h1>
          <p className="text-gray-400 text-lg">
            Step 4 of 6: Automatically detect and create hyperlinks for {caseData?.title || "your case"}
          </p>
          {caseData && (
            <div className="mt-2 text-sm text-gray-500">
              Case: {caseData.caseNumber} | Documents: {documents.length}
            </div>
          )}
        </div>

        {/* Enhanced Information Box */}
        <div className="mb-8 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-6">
          <div className="flex items-start gap-3">
            <Brain className="text-blue-500 mt-1 h-5 w-5" />
            <div>
              <h3 className="font-medium text-blue-900 dark:text-blue-100 mb-2">Dynamic Hyperlink Detection</h3>
              <div className="text-sm text-blue-700 dark:text-blue-200 space-y-1">
                <p>• <strong>Index-deterministic:</strong> Creates exactly as many hyperlinks as index items found</p>
                <p>• <strong>Document-specific:</strong> Each document processed individually with variable hyperlink counts</p>
                <p>• <strong>AI-powered:</strong> Automatically detects and maps references to exact page locations</p>
                <p>• <strong>Court-ready:</strong> Generates professional PDFs with clickable hyperlinks</p>
              </div>
            </div>
          </div>
        </div>

        {/* Unified Document Processing Interface */}
        <div className="mb-8">
          {documents.length > 0 ? (
            <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
              <h2 className="text-xl font-semibold mb-6 flex items-center">
                <FileText className="mr-2 text-green-400" />
                Document Analysis & Hyperlink Detection
              </h2>
              
              {/* Document Path Section */}
              <div className="mb-6">
                <h3 className="text-lg font-medium text-white mb-3">Document Path</h3>
                <div className="bg-slate-700 rounded-lg p-4">
                  {documents.map((doc, index) => (
                    <div key={doc.id} className="flex items-center justify-between py-2 border-b border-slate-600 last:border-b-0">
                      <div className="flex items-center gap-3">
                        <span className="text-blue-400 font-mono text-sm">#{index + 1}</span>
                        <span className="text-white">{doc.originalName || doc.title}</span>
                        <span className="text-xs px-2 py-1 bg-blue-900 text-blue-200 rounded">
                          {doc.pageCount || '?'} pages
                        </span>
                      </div>
                      <span className="text-xs text-gray-400">
                        OCR: {doc.ocrStatus || 'pending'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Index Pages Section */}
              <div className="mb-6">
                <h3 className="text-lg font-medium text-white mb-3">Index Pages</h3>
                <div className="bg-slate-700 rounded-lg p-4">
                  <div className="text-gray-300 text-sm">
                    <p className="mb-2">• System will automatically detect index pages in each document</p>
                    <p className="mb-2">• Typical locations: Beginning pages, Table of Contents, Exhibit lists</p>
                    <p>• Index pages contain the source references for hyperlink creation</p>
                  </div>
                </div>
              </div>

              {/* Index Items List Section */}
              <div className="mb-6">
                <h3 className="text-lg font-medium text-white mb-3">Index Items Detection</h3>
                <div className="bg-slate-700 rounded-lg p-4">
                  <div className="grid md:grid-cols-2 gap-4">
                    <div>
                      <h4 className="text-sm font-medium text-green-400 mb-2">What will be detected:</h4>
                      <ul className="text-sm text-gray-300 space-y-1">
                        <li>• Tab references (Tab 1, Tab 2, etc.)</li>
                        <li>• Exhibit numbers (Exhibit A, B, C, etc.)</li>
                        <li>• Page references (Page X, Line Y)</li>
                        <li>• Section headings and subsections</li>
                        <li>• Document citations and cross-references</li>
                      </ul>
                    </div>
                    <div>
                      <h4 className="text-sm font-medium text-blue-400 mb-2">Hyperlink creation:</h4>
                      <ul className="text-sm text-gray-300 space-y-1">
                        <li>• Exact count matches index items found</li>
                        <li>• Each item links to precise page location</li>
                        <li>• AI maps references to target pages</li>
                        <li>• Court-ready PDF with clickable links</li>
                        <li>• Professional formatting maintained</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>

              {/* Processing Action */}
              <div className="bg-blue-900/30 border border-blue-700 rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-white font-medium">Ready to Process</h4>
                    <p className="text-blue-200 text-sm mt-1">
                      Click below to start automatic hyperlink detection for all documents
                    </p>
                  </div>
                  <button className="px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-medium transition-colors">
                    Start Processing
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-slate-800 rounded-lg p-8 border border-slate-700 text-center">
              <FileText className="mx-auto h-12 w-12 text-gray-400 mb-4" />
              <h2 className="text-xl font-semibold text-gray-300 mb-2">No Documents Found</h2>
              <p className="text-gray-400 mb-4">
                Upload documents in Step 2 before processing hyperlinks.
              </p>
            </div>
          )}
        </div>

        {/* Workflow Navigation Helper */}
        <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
          <h3 className="text-lg font-medium text-white mb-3">Next Steps</h3>
          <p className="text-gray-300 mb-4">
            After processing hyperlinks for all documents, proceed to Step 5 (Lawyer Review) to validate 
            the detected links before generating court-ready PDFs.
          </p>
          <div className="text-sm text-gray-400">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-2 h-2 bg-green-500 rounded-full"></div>
              <span>Documents with completed hyperlink detection will show review options</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
              <span>Click on any workflow step in the sidebar to navigate</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
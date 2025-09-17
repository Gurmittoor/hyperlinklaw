import React, { useState } from 'react';
import { useRoute } from 'wouter';
import { FileSearch, Download, CheckCircle, AlertCircle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';

interface ReanalysisResult {
  total_references: number;
  by_type: {
    exhibit?: number;
    undertaking?: number;
    refusal?: number;
    under_advisement?: number;
    affidavit?: number;
    tab?: number;
    schedule?: number;
  };
  high_confidence: number;
  needs_review: number;
  expected_vs_found: Array<{
    type: string;
    expected: number;
    found: number;
    accuracy: string;
  }>;
  exports: {
    csv: string;
    json: string;
    master_pdf: string;
  };
  output: string;
  deterministic_hash?: string;
  reproducibility?: string;
  ai_features?: {
    model: string;
    api_type: string;
    deterministic_seed: number;
    temperature: number;
    top_p: number;
  };
}

export default function ReanalyzePage() {
  const [match] = useRoute('/cases/:caseId/reanalyze');
  const caseId = match?.caseId;
  const { toast } = useToast();
  
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ReanalysisResult | null>(null);

  const handleReanalyze = async () => {
    if (!caseId) return;
    
    setLoading(true);
    try {
      const response = await fetch(`/api/cases/${caseId}/reanalyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      
      if (!response.ok) {
        throw new Error('Failed to reanalyze case');
      }
      
      const data = await response.json();
      setResult(data);
      
      toast({
        title: "Analysis Complete",
        description: `Found ${data.total_references} references with ${data.high_confidence} high-confidence matches`,
      });
    } catch (error) {
      console.error('Error reanalyzing case:', error);
      toast({
        title: "Analysis Failed",
        description: "Failed to reanalyze hyperlinks. Please try again.",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const downloadFile = async (format: 'csv' | 'json') => {
    if (!caseId) return;
    
    try {
      const response = await fetch(`/api/cases/${caseId}/export/${format}`);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ferrante_candidate_hyperlink_map.${format}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error downloading file:', error);
      toast({
        title: "Download Failed",
        description: `Failed to download ${format.toUpperCase()} file`,
        variant: "destructive"
      });
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Hyperlink Accuracy Analysis
          </h1>
          <p className="text-gray-600">
            Re-analyze Ferrante case documents for 100% accurate internal cross-references
          </p>
        </div>

        {/* Reanalysis Card */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileSearch className="w-5 h-5" />
              Accurate Hyperlink Detection
            </CardTitle>
            <CardDescription>
              Re-run hyperlink detection with enhanced patterns for Exhibits, Undertakings, 
              Refusals, Under Advisement, Affidavits, Tabs, and Schedules
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="bg-blue-50 p-4 rounded-lg">
                <h3 className="font-semibold text-blue-900 mb-2">Detection Patterns</h3>
                <ul className="text-sm text-blue-800 space-y-1">
                  <li>• <strong>Exhibits:</strong> \bExhibit\s+(?!No\b)([A-Z]{1,3}(?:-\d+)?|\d+)\b</li>
                  <li>• <strong>Tabs:</strong> \bTab\s+(\d{1,3})\b</li>
                  <li>• <strong>Schedules:</strong> \bSchedule\s+([A-Z0-9]{1,3})\b</li>
                  <li>• <strong>Affidavits:</strong> \bAffidavit of ([A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+)+)</li>
                  <li>• <strong>Undertakings/Refusals/Under Advisement:</strong> Literal word detection</li>
                </ul>
              </div>
              
              <Button 
                onClick={handleReanalyze}
                disabled={loading}
                className="w-full"
                data-testid="button-reanalyze"
              >
                {loading ? (
                  <>
                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                    Analyzing Documents...
                  </>
                ) : (
                  <>
                    <FileSearch className="w-4 h-4 mr-2" />
                    Start Accurate Analysis
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Results */}
        {result && (
          <div className="space-y-6">
            {/* Summary Stats */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CheckCircle className="w-5 h-5 text-green-600" />
                  Analysis Results
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-blue-600" data-testid="total-references">
                      {result.total_references}
                    </div>
                    <div className="text-sm text-gray-600">Total References</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-green-600" data-testid="high-confidence">
                      {result.high_confidence}
                    </div>
                    <div className="text-sm text-gray-600">High Confidence (≥92%)</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-yellow-600" data-testid="needs-review">
                      {result.needs_review}
                    </div>
                    <div className="text-sm text-gray-600">Needs Review (&lt;92%)</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-purple-600">
                      {Math.round((result.high_confidence / result.total_references) * 100)}%
                    </div>
                    <div className="text-sm text-gray-600">Accuracy Rate</div>
                  </div>
                </div>

                {/* By Type Breakdown */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {Object.entries(result.by_type).map(([type, count]) => (
                    <Badge key={type} variant="outline" className="justify-center py-2">
                      {type.replace('_', ' ')}: {count}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Expected vs Found Comparison */}
            <Card>
              <CardHeader>
                <CardTitle>100% Accuracy Validation</CardTitle>
                <CardDescription>
                  Based on your email: Exhibits (108), Refusals (21), Under Advisement (11), Affidavits (1)
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {result.expected_vs_found?.map(({ type, expected, found, accuracy }) => (
                    <div key={type} className="flex justify-between items-center p-3 bg-gray-50 rounded">
                      <span className="capitalize font-medium">{type.replace('_', ' ')}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-gray-600">Expected: {expected}</span>
                        <span className="text-sm text-gray-600">Found: {found}</span>
                        {accuracy === 'perfect' ? (
                          <CheckCircle className="w-4 h-4 text-green-600" />
                        ) : (
                          <AlertCircle className="w-4 h-4 text-yellow-600" />
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Export Options */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Download className="w-5 h-5" />
                  Download Candidate Maps
                </CardTitle>
                <CardDescription>
                  Export the candidate hyperlink map for review and approval
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex gap-4">
                  <Button 
                    onClick={() => downloadFile('csv')}
                    variant="outline"
                    data-testid="button-download-csv"
                  >
                    <Download className="w-4 h-4 mr-2" />
                    Download CSV
                  </Button>
                  <Button 
                    onClick={() => downloadFile('json')}
                    variant="outline"
                    data-testid="button-download-json"
                  >
                    <Download className="w-4 h-4 mr-2" />
                    Download JSON
                  </Button>
                  <Button 
                    onClick={() => downloadFile('master_pdf')}
                    className="bg-green-600 hover:bg-green-700 text-white"
                    data-testid="button-download-master-pdf"
                  >
                    <Download className="w-4 h-4 mr-2" />
                    Download Master PDF
                  </Button>
                </div>
                <p className="text-sm text-gray-600 mt-2">
                  Sort CSV by confidence score and approve all 1.00 items first
                </p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Lovable Prompt */}
        <Card className="mt-8">
          <CardHeader>
            <CardTitle>Lovable AI Prompt</CardTitle>
            <CardDescription>
              Use this exact prompt in Lovable to replicate this analysis
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="bg-gray-900 text-gray-100 p-4 rounded-lg text-sm font-mono">
              <div className="mb-2 text-green-400">// Copy this prompt to Lovable:</div>
              <div className="text-wrap">
                Role: You are the Hyperlinking Orchestrator for the Ferrante case bundle. Create internal, 
                in-PDF hyperlinks from the two Briefs into the Trial Record – Ferrante – Aug 13, 2025, 
                with zero hallucinations and strict lawyer-review gate using patterns: 
                Exhibits: \bExhibit\s+(?!No\b)([A-Z]&#123;1,3&#125;(?:-\d+)?|\d+)\b, 
                Tabs: \bTab\s+(\d&#123;1,3&#125;)\b, 
                Schedules: \bSchedule\s+([A-Z0-9]&#123;1,3&#125;)\b, 
                Affidavits: \bAffidavit of ([A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+)+), 
                Undertakings/Refusals/Under Advisement: literal detection. 
                Expected counts: Exhibits (108), Refusals (21), Under Advisement (11), Affidavits (1).
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
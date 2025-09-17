import { useState } from 'react';
import { useRoute } from 'wouter';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CheckCircle, XCircle, RefreshCw } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';

interface AITestResult {
  success: boolean;
  model: string;
  decision?: string;
  error?: string;
  message: string;
}

export default function GPT5TestPage() {
  const [match] = useRoute('/cases/:caseId/gpt5-test');
  const caseId = match?.caseId;
  const [testResult, setTestResult] = useState<AITestResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const runAITest = async () => {
    setIsLoading(true);
    try {
      const result = await apiRequest<AITestResult>('/api/gpt5/test');
      setTestResult(result);
      
      if (result.success) {
        toast({
          title: "AI Connection Successful",
          description: `Model: ${result.model} - ${result.decision}`,
        });
      } else {
        toast({
          title: "AI Connection Failed",
          description: result.message,
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('Error testing AI:', error);
      toast({
        title: "Test Failed",
        description: "Failed to test AI connection",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">AI Connection Test</h1>
          <p className="text-gray-600 mt-2">
            Test AI API connection for deterministic hyperlink resolution
          </p>
        </div>
        <Button 
          onClick={runAITest}
          disabled={isLoading}
          data-testid="button-test-gpt5"
        >
          {isLoading ? (
            <>
              <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
              Testing...
            </>
          ) : (
            <>
              <RefreshCw className="w-4 h-4 mr-2" />
              Test AI
            </>
          )}
        </Button>
      </div>

      {/* Test Configuration */}
      <Card>
        <CardHeader>
          <CardTitle>AI Configuration</CardTitle>
          <CardDescription>
            Deterministic settings for reproducible hyperlink resolution
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <span className="font-medium">Model:</span>
              <Badge variant="outline">
                {process.env.OPENAI_MODEL || 'AI-Powered'}
              </Badge>
            </div>
            <div className="space-y-2">
              <span className="font-medium">API Type:</span>
              <Badge variant="outline">Responses API</Badge>
            </div>
            <div className="space-y-2">
              <span className="font-medium">Temperature:</span>
              <Badge variant="outline">0 (deterministic)</Badge>
            </div>
            <div className="space-y-2">
              <span className="font-medium">Seed:</span>
              <Badge variant="outline">42 (fixed)</Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Test Results */}
      {testResult && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {testResult.success ? (
                <CheckCircle className="w-5 h-5 text-green-600" />
              ) : (
                <XCircle className="w-5 h-5 text-red-600" />
              )}
              Connection Test Results
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex justify-between items-center p-3 bg-gray-50 rounded">
                <span className="font-medium">Status</span>
                <Badge variant={testResult.success ? "default" : "destructive"}>
                  {testResult.success ? "Connected" : "Failed"}
                </Badge>
              </div>
              
              <div className="flex justify-between items-center p-3 bg-gray-50 rounded">
                <span className="font-medium">Model</span>
                <code className="text-sm">{testResult.model}</code>
              </div>
              
              {testResult.decision && (
                <div className="flex justify-between items-center p-3 bg-green-50 rounded">
                  <span className="font-medium">Test Decision</span>
                  <Badge variant="outline" className="text-green-700">
                    {testResult.decision}
                  </Badge>
                </div>
              )}
              
              <div className="flex justify-between items-center p-3 bg-gray-50 rounded">
                <span className="font-medium">Message</span>
                <span className="text-sm">{testResult.message}</span>
              </div>
              
              {testResult.error && (
                <div className="p-3 bg-red-50 rounded">
                  <span className="font-medium text-red-700">Error:</span>
                  <pre className="text-sm text-red-600 mt-1">{testResult.error}</pre>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* AI Features */}
      <Card>
        <CardHeader>
          <CardTitle>AI Features for Legal Documents</CardTitle>
          <CardDescription>
            Advanced capabilities for precise hyperlink resolution
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="flex justify-between items-center p-3 bg-blue-50 rounded">
              <span className="font-medium">Deterministic Output</span>
              <span className="text-sm text-blue-700">Same inputs = identical results</span>
            </div>
            <div className="flex justify-between items-center p-3 bg-blue-50 rounded">
              <span className="font-medium">JSON Response Format</span>
              <span className="text-sm text-blue-700">Structured, parseable decisions</span>
            </div>
            <div className="flex justify-between items-center p-3 bg-blue-50 rounded">
              <span className="font-medium">Legal Context Understanding</span>
              <span className="text-sm text-blue-700">Optimized for legal document references</span>
            </div>
            <div className="flex justify-between items-center p-3 bg-blue-50 rounded">
              <span className="font-medium">Reproducible Decisions</span>
              <span className="text-sm text-blue-700">Court-ready consistency</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
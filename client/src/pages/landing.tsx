import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Scale, FileText, Link, Zap, Shield, CheckCircle } from "lucide-react";

export default function Landing() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white dark:from-slate-950 dark:to-slate-900">
      <div className="container mx-auto px-4 py-16">
        <div className="text-center mb-16">
          <div className="flex items-center justify-center mb-6">
            <Scale className="h-12 w-12 text-blue-600 mr-3" />
            <h1 className="text-5xl font-bold text-slate-900 dark:text-white">hyperlinklaw.com</h1>
          </div>
          <h2 className="text-2xl text-slate-600 dark:text-slate-400 mb-4">
            Legal Document Auto-Hyperlinking System
          </h2>
          <p className="text-lg text-slate-500 dark:text-slate-500 max-w-2xl mx-auto mb-8">
            Transform your legal documents with instant hyperlink detection between briefs and trial records. 
            Built for law firms requiring court-ready documents with professional accuracy.
          </p>
          <Button 
            size="lg" 
            onClick={() => {
              // DUAL DEPLOYMENT: Smart login URL computation
              const hostname = window.location.hostname;
              let loginUrl: string;
              
              // For production marketing domain, redirect to app subdomain
              if (hostname === 'hyperlinklaw.com' || hostname === 'www.hyperlinklaw.com') {
                loginUrl = 'https://app.hyperlinklaw.com/api/login';
              } 
              // For all other cases (app subdomain, localhost, development URLs), use relative path
              else {
                loginUrl = '/api/login';
              }
              
              console.log(`Marketing site redirecting to: ${loginUrl}`);
              window.location.href = loginUrl;
            }}
            className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-3 text-lg"
            data-testid="button-login"
          >
            Sign In to Get Started
          </Button>
        </div>

        <div className="grid md:grid-cols-3 gap-8 mb-16">
          <Card className="border-2 hover:shadow-lg transition-shadow">
            <CardHeader>
              <FileText className="h-10 w-10 text-blue-600 mb-2" />
              <CardTitle>Instant Processing</CardTitle>
              <CardDescription>
                Upload PDFs and get hyperlinked documents ready for court submission in minutes
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm text-slate-600 dark:text-slate-400">
                <li className="flex items-center"><CheckCircle className="h-4 w-4 text-green-500 mr-2" />Batch document processing</li>
                <li className="flex items-center"><CheckCircle className="h-4 w-4 text-green-500 mr-2" />Real-time progress tracking</li>
                <li className="flex items-center"><CheckCircle className="h-4 w-4 text-green-500 mr-2" />Court-ready PDF generation</li>
              </ul>
            </CardContent>
          </Card>

          <Card className="border-2 hover:shadow-lg transition-shadow">
            <CardHeader>
              <Link className="h-10 w-10 text-green-600 mb-2" />
              <CardTitle>Smart Linking</CardTitle>
              <CardDescription>
                AI-powered hyperlink detection between document references and trial records
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm text-slate-600 dark:text-slate-400">
                <li className="flex items-center"><CheckCircle className="h-4 w-4 text-green-500 mr-2" />Exhibit & tab detection</li>
                <li className="flex items-center"><CheckCircle className="h-4 w-4 text-green-500 mr-2" />Index-deterministic approach</li>
                <li className="flex items-center"><CheckCircle className="h-4 w-4 text-green-500 mr-2" />Zero broken links guarantee</li>
              </ul>
            </CardContent>
          </Card>

          <Card className="border-2 hover:shadow-lg transition-shadow">
            <CardHeader>
              <Shield className="h-10 w-10 text-purple-600 mb-2" />
              <CardTitle>Professional Review</CardTitle>
              <CardDescription>
                Lawyer review interface for validating and approving hyperlinks before court submission
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm text-slate-600 dark:text-slate-400">
                <li className="flex items-center"><CheckCircle className="h-4 w-4 text-green-500 mr-2" />Interactive review panels</li>
                <li className="flex items-center"><CheckCircle className="h-4 w-4 text-green-500 mr-2" />Confidence scoring</li>
                <li className="flex items-center"><CheckCircle className="h-4 w-4 text-green-500 mr-2" />Audit trail & compliance</li>
              </ul>
            </CardContent>
          </Card>
        </div>

        <div className="text-center mb-12">
          <Badge variant="secondary" className="text-lg px-4 py-2 mb-4">
            <Zap className="h-4 w-4 mr-2" />
            Proven Results
          </Badge>
          <div className="grid md:grid-cols-3 gap-8 max-w-4xl mx-auto">
            <div>
              <div className="text-4xl font-bold text-blue-600 mb-2">Dynamic</div>
              <div className="text-slate-600 dark:text-slate-400">Index Detection</div>
              <div className="text-sm text-slate-500">Adapts to any document</div>
            </div>
            <div>
              <div className="text-4xl font-bold text-green-600 mb-2">100%</div>
              <div className="text-slate-600 dark:text-slate-400">Accuracy</div>
              <div className="text-sm text-slate-500">Zero broken links</div>
            </div>
            <div>
              <div className="text-4xl font-bold text-purple-600 mb-2">Instant</div>
              <div className="text-slate-600 dark:text-slate-400">Review</div>
              <div className="text-sm text-slate-500">Court-ready PDFs</div>
            </div>
          </div>
        </div>

        <div className="text-center text-slate-500 dark:text-slate-500">
          <p className="mb-2">Trusted by legal professionals for critical court documents</p>
          <p>Sign in with your account to access the system</p>
        </div>
      </div>
    </div>
  );
}
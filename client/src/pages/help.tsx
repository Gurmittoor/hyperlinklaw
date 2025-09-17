import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { FileText, Upload, Search, CheckCircle, Download, AlertCircle } from 'lucide-react';

export default function Help() {
  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <div className="mb-8">
        <h1 className="text-4xl font-bold mb-4">Help & Documentation</h1>
        <p className="text-xl text-muted-foreground">
          Complete guide to using hyperlinklaw.com for legal document auto-hyperlinking
        </p>
      </div>

      {/* Quick Start Guide */}
      <Card className="mb-8">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="w-5 h-5" />
            Quick Start Guide
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="text-center">
              <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900 rounded-full flex items-center justify-center mx-auto mb-3">
                <FileText className="w-6 h-6 text-blue-600" />
              </div>
              <h3 className="font-semibold mb-2">1. Create Case</h3>
              <p className="text-sm text-muted-foreground">
                Start by creating a new case with a unique case number
              </p>
            </div>
            <div className="text-center">
              <div className="w-12 h-12 bg-green-100 dark:bg-green-900 rounded-full flex items-center justify-center mx-auto mb-3">
                <Upload className="w-6 h-6 text-green-600" />
              </div>
              <h3 className="font-semibold mb-2">2. Upload PDFs</h3>
              <p className="text-sm text-muted-foreground">
                Upload your legal documents (up to 50MB each)
              </p>
            </div>
            <div className="text-center">
              <div className="w-12 h-12 bg-purple-100 dark:bg-purple-900 rounded-full flex items-center justify-center mx-auto mb-3">
                <Search className="w-6 h-6 text-purple-600" />
              </div>
              <h3 className="font-semibold mb-2">3. AI Processing</h3>
              <p className="text-sm text-muted-foreground">
                Our AI automatically detects index and creates hyperlinks
              </p>
            </div>
            <div className="text-center">
              <div className="w-12 h-12 bg-orange-100 dark:bg-orange-900 rounded-full flex items-center justify-center mx-auto mb-3">
                <CheckCircle className="w-6 h-6 text-orange-600" />
              </div>
              <h3 className="font-semibold mb-2">4. Review & Submit</h3>
              <p className="text-sm text-muted-foreground">
                Review hyperlinks and download court-ready PDFs
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* FAQ Section */}
      <Card className="mb-8">
        <CardHeader>
          <CardTitle>Frequently Asked Questions</CardTitle>
        </CardHeader>
        <CardContent>
          <Accordion type="single" collapsible className="w-full">
            <AccordionItem value="item-1">
              <AccordionTrigger>What is index-deterministic hyperlinking?</AccordionTrigger>
              <AccordionContent>
                Our system creates exactly as many hyperlinks as items exist in your document's 
                index. If your index has 13 items, exactly 13 hyperlinks will be created. This 
                ensures accuracy and prevents false positives.
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="item-2">
              <AccordionTrigger>What file formats are supported?</AccordionTrigger>
              <AccordionContent>
                We currently support PDF files only. Documents can be scanned PDFs or text-based 
                PDFs. Our OCR technology can read special characters like ★, •, and → symbols 
                commonly found in legal documents.
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="item-3">
              <AccordionTrigger>How does the review process work?</AccordionTrigger>
              <AccordionContent>
                After AI processing, you can review all generated hyperlinks in a side-by-side 
                interface. You can override any hyperlink targets if needed and regenerate the 
                document. All hyperlinks must be approved before court submission.
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="item-4">
              <AccordionTrigger>What if my document doesn't have a clear index?</AccordionTrigger>
              <AccordionContent>
                Our system automatically detects index pages. If no index is found, the system 
                will gracefully handle this and notify you. Documents without proper indexes 
                cannot be processed for hyperlink creation.
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="item-5">
              <AccordionTrigger>How large can my PDF files be?</AccordionTrigger>
              <AccordionContent>
                We support PDF files up to 50MB in size. Larger documents may take longer to 
                process but are handled efficiently through our background processing system.
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="item-6">
              <AccordionTrigger>Is my data secure?</AccordionTrigger>
              <AccordionContent>
                Yes. We use industry-standard encryption, secure authentication, and follow 
                strict privacy policies. Documents are retained for 90 days by default and 
                can be deleted immediately upon request. See our Privacy Policy for details.
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </CardContent>
      </Card>

      {/* Troubleshooting */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertCircle className="w-5 h-5" />
            Troubleshooting
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div>
              <h3 className="font-semibold mb-2">Processing Failed</h3>
              <p className="text-sm text-muted-foreground mb-2">
                If document processing fails, check:
              </p>
              <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
                <li>File is a valid PDF format</li>
                <li>Document contains a clear index or table of contents</li>
                <li>File size is under 50MB</li>
                <li>Document is not password protected</li>
              </ul>
            </div>

            <div>
              <h3 className="font-semibold mb-2">Incorrect Hyperlinks</h3>
              <p className="text-sm text-muted-foreground mb-2">
                If hyperlinks point to wrong pages:
              </p>
              <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
                <li>Use the review interface to override page targets</li>
                <li>Regenerate the document after making changes</li>
                <li>Ensure index page numbers match actual content pages</li>
              </ul>
            </div>

            <div>
              <h3 className="font-semibold mb-2">Need More Help?</h3>
              <p className="text-sm text-muted-foreground">
                Contact our support team through the "Report an Issue" button in the application 
                for technical assistance. Include your case ID for faster resolution.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
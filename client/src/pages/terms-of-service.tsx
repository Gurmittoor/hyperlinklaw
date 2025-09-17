import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function TermsOfService() {
  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <Card>
        <CardHeader>
          <CardTitle className="text-3xl font-bold">Terms of Service</CardTitle>
          <p className="text-muted-foreground">Last updated: {new Date().toLocaleDateString()}</p>
        </CardHeader>
        <CardContent className="space-y-6">
          <section>
            <h2 className="text-2xl font-semibold mb-3">1. Service Description</h2>
            <p className="text-gray-700 dark:text-gray-300">
              hyperlinklaw.com provides automated hyperlink creation for legal documents based 
              on index content. Our service uses AI-powered OCR and text analysis to create 
              court-ready PDFs with clickable cross-references.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-3">2. Acceptable Use</h2>
            <ul className="list-disc list-inside space-y-1 text-gray-700 dark:text-gray-300">
              <li>Service is intended for legal professionals and law firms</li>
              <li>Upload only legitimate legal documents (PDFs)</li>
              <li>Do not attempt to upload malicious files or abuse the system</li>
              <li>Respect rate limits and usage guidelines</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-3">3. Index-Deterministic Processing</h2>
            <p className="text-gray-700 dark:text-gray-300">
              Our system creates exactly as many hyperlinks as items exist in your document's 
              index. This ensures accuracy and prevents false positives. If your document 
              has 13 index items, exactly 13 hyperlinks will be created.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-3">4. Professional Review Required</h2>
            <p className="text-gray-700 dark:text-gray-300">
              All automatically generated hyperlinks must be reviewed and approved by a legal 
              professional before court submission. Our service provides tools for review and 
              manual override when necessary.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-3">5. Data Responsibility</h2>
            <p className="text-gray-700 dark:text-gray-300">
              Users are responsible for ensuring uploaded documents do not contain confidential 
              information that should not be processed. We recommend using test documents for 
              initial evaluation.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-3">6. Service Availability</h2>
            <p className="text-gray-700 dark:text-gray-300">
              We strive for 99.9% uptime but cannot guarantee uninterrupted service. 
              Maintenance windows will be announced in advance when possible.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-3">7. Limitation of Liability</h2>
            <p className="text-gray-700 dark:text-gray-300">
              This service is provided as-is for document processing assistance. Users 
              maintain full responsibility for final document accuracy and court compliance.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-3">8. Support and Contact</h2>
            <p className="text-gray-700 dark:text-gray-300">
              Technical support is available through the in-application support channel. 
              Response time target is 24 hours for non-critical issues.
            </p>
          </section>
        </CardContent>
      </Card>
    </div>
  );
}
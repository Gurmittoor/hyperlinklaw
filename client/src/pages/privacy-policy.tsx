import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function PrivacyPolicy() {
  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <Card>
        <CardHeader>
          <CardTitle className="text-3xl font-bold">Privacy Policy</CardTitle>
          <p className="text-muted-foreground">Last updated: {new Date().toLocaleDateString()}</p>
        </CardHeader>
        <CardContent className="space-y-6">
          <section>
            <h2 className="text-2xl font-semibold mb-3">1. Information We Collect</h2>
            <p className="text-gray-700 dark:text-gray-300">
              hyperlinklaw.com collects the following information to provide our legal document 
              auto-hyperlinking services:
            </p>
            <ul className="list-disc list-inside mt-2 space-y-1 text-gray-700 dark:text-gray-300">
              <li>Account information (email, name) through Replit authentication</li>
              <li>Legal documents uploaded for processing (PDFs only)</li>
              <li>Case management data (case numbers, titles, processing status)</li>
              <li>Usage analytics to improve our service</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-3">2. How We Use Your Information</h2>
            <ul className="list-disc list-inside space-y-1 text-gray-700 dark:text-gray-300">
              <li>Process legal documents and create hyperlinks based on index content</li>
              <li>Provide case management and document organization</li>
              <li>Maintain account security and prevent abuse</li>
              <li>Improve our AI-powered document processing capabilities</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-3">3. Data Security</h2>
            <p className="text-gray-700 dark:text-gray-300">
              We implement industry-standard security measures including:
            </p>
            <ul className="list-disc list-inside mt-2 space-y-1 text-gray-700 dark:text-gray-300">
              <li>Encrypted data transmission (HTTPS/TLS)</li>
              <li>Secure database storage with access controls</li>
              <li>Regular security audits and monitoring</li>
              <li>File upload validation and virus scanning</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-3">4. Data Retention</h2>
            <p className="text-gray-700 dark:text-gray-300">
              Document data is retained for 90 days by default to allow case completion. 
              Users can request immediate deletion of their data at any time.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-3">5. Legal Compliance</h2>
            <p className="text-gray-700 dark:text-gray-300">
              This service is designed for legal professionals. We do not access or review 
              the content of your documents beyond automated processing for hyperlink creation.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-3">6. Contact Information</h2>
            <p className="text-gray-700 dark:text-gray-300">
              For privacy-related questions or data deletion requests, contact us through 
              the support channel in the application.
            </p>
          </section>
        </CardContent>
      </Card>
    </div>
  );
}
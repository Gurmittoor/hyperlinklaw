import React from 'react';
import { Link } from 'wouter';

export default function Footer() {
  return (
    <footer className="border-t bg-muted/50 mt-auto">
      <div className="container mx-auto px-4 py-6">
        <div className="flex flex-col md:flex-row justify-between items-center space-y-4 md:space-y-0">
          <div className="text-sm text-muted-foreground">
            © 2025 hyperlinklaw.com - Legal Document Auto-Hyperlinking System
          </div>
          
          <div className="flex space-x-6 text-sm">
            <Link href="/privacy-policy" className="text-muted-foreground hover:text-foreground transition-colors">
              Privacy Policy
            </Link>
            <Link href="/terms-of-service" className="text-muted-foreground hover:text-foreground transition-colors">
              Terms of Service
            </Link>
            <Link href="/help" className="text-muted-foreground hover:text-foreground transition-colors">
              Help
            </Link>
            <a 
              href="/health" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              Status
            </a>
          </div>
        </div>
        
        <div className="mt-4 pt-4 border-t text-xs text-muted-foreground text-center">
          <p>
            Professional legal document processing with index-deterministic hyperlinking. 
            Always review AI-generated hyperlinks before court submission.
          </p>
        </div>
      </div>
    </footer>
  );
}
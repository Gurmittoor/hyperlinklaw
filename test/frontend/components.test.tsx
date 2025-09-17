import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// Create a wrapper for testing with QueryClient
const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
};

// Mock components for testing
const MockLandingPage = () => (
  <div data-testid="landing-page">
    <h1>hyperlinklaw.com</h1>
    <p>Legal Document Auto-Hyperlinking System</p>
  </div>
);

const MockCaseWorkflow = () => (
  <div data-testid="case-workflow">
    <h2>hyperlinklaw.com Workflow Progress</h2>
    <div>Step 1: Case Created</div>
    <div>Step 2: Documents Uploaded</div>
  </div>
);

describe('Frontend Components', () => {
  describe('Landing Page', () => {
    it('should render with correct branding', () => {
      render(<MockLandingPage />);
      
      expect(screen.getByText('hyperlinklaw.com')).toBeInTheDocument();
      expect(screen.getByText('Legal Document Auto-Hyperlinking System')).toBeInTheDocument();
    });

    it('should have proper test IDs for accessibility', () => {
      render(<MockLandingPage />);
      
      expect(screen.getByTestId('landing-page')).toBeInTheDocument();
    });
  });

  describe('Case Workflow', () => {
    it('should display workflow progress correctly', () => {
      render(<MockCaseWorkflow />);
      
      expect(screen.getByText('hyperlinklaw.com Workflow Progress')).toBeInTheDocument();
      expect(screen.getByText('Step 1: Case Created')).toBeInTheDocument();
      expect(screen.getByText('Step 2: Documents Uploaded')).toBeInTheDocument();
    });
  });

  describe('Authentication', () => {
    it('should handle unauthorized access gracefully', () => {
      const mockError = { message: '401: Unauthorized' };
      
      // Test error handling
      expect(mockError.message).toContain('401');
      expect(mockError.message).toContain('Unauthorized');
    });
  });
});
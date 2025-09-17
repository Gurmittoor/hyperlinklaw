import { test, expect } from '@playwright/test';
import path from 'path';

test.describe('Complete PDF Processing Workflow', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the application
    await page.goto('/');
    
    // Wait for authentication or handle login
    await page.waitForLoadState('networkidle');
  });

  test('Full workflow: upload → process → review → download', async ({ page }) => {
    // Test the complete user journey
    
    // 1. Create a new case
    await page.click('[data-testid="button-new-case"]');
    await page.fill('[data-testid="input-case-name"]', 'E2E Test Case');
    await page.click('[data-testid="button-create-case"]');
    
    // Wait for case creation
    await expect(page.locator('[data-testid="text-case-name"]')).toContainText('E2E Test Case');

    // 2. Upload a PDF
    const testPdfPath = path.join(__dirname, 'fixtures', 'sample-legal-doc.pdf');
    
    await page.setInputFiles('[data-testid="input-file-upload"]', testPdfPath);
    await page.click('[data-testid="button-upload"]');
    
    // Verify upload success
    await expect(page.locator('[data-testid="text-upload-status"]')).toContainText('Upload successful');

    // 3. Start processing
    await page.click('[data-testid="button-process"]');
    
    // Verify processing started
    await expect(page.locator('[data-testid="text-processing-status"]')).toContainText('Processing');

    // 4. Wait for processing to complete (with timeout)
    await expect(page.locator('[data-testid="text-processing-status"]')).toContainText('Completed', { timeout: 300000 }); // 5 minutes

    // 5. Review detected links
    const linkCount = await page.locator('[data-testid="text-link-count"]').textContent();
    expect(parseInt(linkCount || '0')).toBeGreaterThan(0);

    // Click on first link to review
    await page.click('[data-testid="link-item-0"]');
    
    // Verify PDF viewer opens to correct page
    await expect(page.locator('[data-testid="pdf-viewer"]')).toBeVisible();

    // 6. Override a link if needed
    await page.click('[data-testid="button-override-0"]');
    await page.fill('[data-testid="input-target-page"]', '10');
    await page.click('[data-testid="button-save-override"]');

    // Verify override was saved
    await expect(page.locator('[data-testid="text-target-page-0"]')).toContainText('10');

    // 7. Generate court-ready bundle
    await page.click('[data-testid="button-generate-bundle"]');
    
    // Wait for bundle generation
    await expect(page.locator('[data-testid="text-bundle-status"]')).toContainText('Ready for download');

    // 8. Download the bundle
    const downloadPromise = page.waitForDownload();
    await page.click('[data-testid="button-download-bundle"]');
    const download = await downloadPromise;

    // Verify download
    expect(download.suggestedFilename()).toMatch(/.*\.zip$/);
    expect(await download.path()).toBeTruthy();
  });

  test('Strict mode validation', async ({ page }) => {
    // Test strict mode behavior
    await page.goto('/?strict=true');
    
    // Create case and upload document
    await page.click('[data-testid="button-new-case"]');
    await page.fill('[data-testid="input-case-name"]', 'Strict Mode Test');
    await page.click('[data-testid="button-create-case"]');

    const testPdf = path.join(__dirname, 'fixtures', 'strict-test-doc.pdf');
    await page.setInputFiles('[data-testid="input-file-upload"]', testPdf);
    await page.click('[data-testid="button-upload"]');
    
    // Enable strict mode
    await page.check('[data-testid="checkbox-strict-mode"]');
    await page.click('[data-testid="button-process"]');

    // Wait for processing
    await page.waitForSelector('[data-testid="text-processing-status"]', { state: 'visible' });
    
    // In strict mode, should show validation results
    await expect(page.locator('[data-testid="text-validation-result"]')).toBeVisible({ timeout: 300000 });
    
    // Check that link count equals index items
    const linkCount = await page.locator('[data-testid="text-link-count"]').textContent();
    const indexCount = await page.locator('[data-testid="text-index-count"]').textContent();
    expect(linkCount).toBe(indexCount);
  });

  test('Mobile responsiveness', async ({ page }) => {
    // Test mobile viewport
    await page.setViewportSize({ width: 375, height: 667 }); // iPhone SE

    await page.goto('/');
    
    // Mobile navigation should be accessible
    await expect(page.locator('[data-testid="mobile-nav"]')).toBeVisible();
    
    // PDF viewer should adapt to mobile
    const testPdf = path.join(__dirname, 'fixtures', 'mobile-test.pdf');
    
    await page.click('[data-testid="button-new-case"]');
    await page.fill('[data-testid="input-case-name"]', 'Mobile Test');
    await page.click('[data-testid="button-create-case"]');
    
    await page.setInputFiles('[data-testid="input-file-upload"]', testPdf);
    await page.click('[data-testid="button-upload"]');
    await page.click('[data-testid="button-process"]');

    // Wait for processing
    await expect(page.locator('[data-testid="text-processing-status"]')).toContainText('Completed', { timeout: 300000 });

    // Mobile PDF viewer should be responsive
    const pdfViewer = page.locator('[data-testid="pdf-viewer"]');
    await expect(pdfViewer).toBeVisible();
    
    const viewerBox = await pdfViewer.boundingBox();
    expect(viewerBox?.width).toBeLessThanOrEqual(375);
  });

  test('Accessibility compliance', async ({ page }) => {
    await page.goto('/');
    
    // Test keyboard navigation
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Enter'); // Should activate focused element
    
    // Test ARIA labels
    const uploadButton = page.locator('[data-testid="button-upload"]');
    await expect(uploadButton).toHaveAttribute('aria-label');
    
    // Test focus management
    await page.click('[data-testid="button-new-case"]');
    await expect(page.locator('[data-testid="input-case-name"]')).toBeFocused();
    
    // Test screen reader content
    const main = page.locator('main');
    await expect(main).toHaveAttribute('role', 'main');
  });

  test('Error handling', async ({ page }) => {
    // Test various error scenarios
    
    // 1. Invalid file upload
    await page.goto('/');
    await page.click('[data-testid="button-new-case"]');
    await page.fill('[data-testid="input-case-name"]', 'Error Test');
    await page.click('[data-testid="button-create-case"]');

    // Try to upload non-PDF file
    const invalidFile = path.join(__dirname, 'fixtures', 'invalid.txt');
    await page.setInputFiles('[data-testid="input-file-upload"]', invalidFile);
    
    await expect(page.locator('[data-testid="error-message"]')).toContainText('Only PDF files are allowed');
    
    // 2. Network error simulation
    await page.route('**/api/process', route => route.abort());
    
    const validPdf = path.join(__dirname, 'fixtures', 'valid-test.pdf');
    await page.setInputFiles('[data-testid="input-file-upload"]', validPdf);
    await page.click('[data-testid="button-upload"]');
    await page.click('[data-testid="button-process"]');
    
    await expect(page.locator('[data-testid="error-message"]')).toContainText('Processing failed');
  });

  test('Performance validation', async ({ page }) => {
    // Test performance metrics
    await page.goto('/');
    
    // Measure page load time
    const loadStart = Date.now();
    await page.waitForLoadState('networkidle');
    const loadTime = Date.now() - loadStart;
    
    expect(loadTime).toBeLessThan(5000); // Should load within 5 seconds
    
    // Test large file handling
    const largePdf = path.join(__dirname, 'fixtures', 'large-test.pdf'); // 10MB+ file
    
    await page.click('[data-testid="button-new-case"]');
    await page.fill('[data-testid="input-case-name"]', 'Performance Test');
    await page.click('[data-testid="button-create-case"]');
    
    const uploadStart = Date.now();
    await page.setInputFiles('[data-testid="input-file-upload"]', largePdf);
    await page.click('[data-testid="button-upload"]');
    
    await expect(page.locator('[data-testid="text-upload-status"]')).toContainText('Upload successful', { timeout: 60000 });
    
    const uploadTime = Date.now() - uploadStart;
    expect(uploadTime).toBeLessThan(60000); // Should upload within 1 minute
  });

  test('Security validation', async ({ page }) => {
    // Test CSRF protection
    await page.goto('/');
    
    // Get CSRF token
    const csrfToken = await page.evaluate(() => {
      return document.querySelector('meta[name="csrf-token"]')?.getAttribute('content');
    });
    
    expect(csrfToken).toBeTruthy();
    
    // Test file type restrictions
    const maliciousFile = path.join(__dirname, 'fixtures', 'malicious.exe');
    
    await page.click('[data-testid="button-new-case"]');
    await page.fill('[data-testid="input-case-name"]', 'Security Test');
    await page.click('[data-testid="button-create-case"]');
    
    await page.setInputFiles('[data-testid="input-file-upload"]', maliciousFile);
    
    await expect(page.locator('[data-testid="error-message"]')).toContainText('File type not allowed');
  });
});
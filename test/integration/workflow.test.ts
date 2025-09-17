import { expect, test, describe, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import fs from 'fs/promises';
import path from 'path';

// This would import your Express app
// import app from '../../server/index';

describe('Complete PDF Processing Workflow', () => {
  let testPdfPath: string;
  let caseId: string;

  beforeAll(async () => {
    // Setup test PDF file
    testPdfPath = path.join(__dirname, '../fixtures/sample-court-doc.pdf');
    // Create a test PDF if it doesn't exist
    try {
      await fs.access(testPdfPath);
    } catch {
      // Create a minimal test PDF for testing
      await fs.writeFile(testPdfPath, 'Test PDF content');
    }
  });

  afterAll(async () => {
    // Cleanup test files
    try {
      await fs.unlink(testPdfPath);
    } catch {
      // File might not exist
    }
  });

  test('End-to-end workflow: upload → process → review → download', async () => {
    // Note: This test assumes authentication is set up
    // You'll need to adjust based on your auth implementation
    
    // 1. Create a new case
    const caseResponse = await request(app)
      .post('/api/cases')
      .send({ name: 'Test Case Integration' })
      .expect(201);
    
    caseId = caseResponse.body.id;
    expect(caseId).toBeDefined();

    // 2. Upload PDF
    const uploadResponse = await request(app)
      .post(`/api/cases/${caseId}/upload`)
      .attach('file', testPdfPath)
      .expect(200);
    
    const documentId = uploadResponse.body.documentId;
    expect(documentId).toBeDefined();

    // 3. Process the document
    const processResponse = await request(app)
      .post(`/api/cases/${caseId}/documents/${documentId}/process`)
      .expect(200);

    expect(processResponse.body.status).toBe('processing');

    // 4. Wait for processing to complete (poll for status)
    let attempts = 0;
    let processed = false;
    
    while (attempts < 30 && !processed) { // 30 attempts = ~5 minutes max
      await new Promise(resolve => setTimeout(resolve, 10000)); // Wait 10 seconds
      
      const statusResponse = await request(app)
        .get(`/api/cases/${caseId}/documents/${documentId}/status`)
        .expect(200);
      
      if (statusResponse.body.status === 'completed') {
        processed = true;
        expect(statusResponse.body.linkCount).toBeGreaterThan(0);
      } else if (statusResponse.body.status === 'failed') {
        throw new Error(`Processing failed: ${statusResponse.body.error}`);
      }
      
      attempts++;
    }

    expect(processed).toBe(true);

    // 5. Review detected links
    const linksResponse = await request(app)
      .get(`/api/cases/${caseId}/documents/${documentId}/links`)
      .expect(200);
    
    expect(Array.isArray(linksResponse.body)).toBe(true);
    expect(linksResponse.body.length).toBeGreaterThan(0);

    // 6. Override a link (optional test)
    if (linksResponse.body.length > 0) {
      const linkToUpdate = linksResponse.body[0];
      await request(app)
        .patch(`/api/cases/${caseId}/documents/${documentId}/links/${linkToUpdate.id}`)
        .send({ targetPage: linkToUpdate.targetPage + 1 })
        .expect(200);
    }

    // 7. Generate court-ready bundle
    const bundleResponse = await request(app)
      .post(`/api/cases/${caseId}/documents/${documentId}/generate-bundle`)
      .expect(200);

    expect(bundleResponse.body.bundleUrl).toBeDefined();

    // 8. Download the bundle
    const downloadResponse = await request(app)
      .get(bundleResponse.body.bundleUrl)
      .expect(200);

    expect(downloadResponse.headers['content-type']).toBe('application/zip');
    expect(downloadResponse.body.length).toBeGreaterThan(0);
  }, 600000); // 10 minute timeout for full workflow

  test('Strict mode validation: links must equal index items', async () => {
    // Set strict mode environment
    process.env.STRICT_INDEX_ONLY = 'true';

    const caseResponse = await request(app)
      .post('/api/cases')
      .send({ name: 'Strict Mode Test Case' })
      .expect(201);
    
    const strictCaseId = caseResponse.body.id;

    // Upload a PDF with known index structure
    const uploadResponse = await request(app)
      .post(`/api/cases/${strictCaseId}/upload`)
      .attach('file', testPdfPath)
      .expect(200);
    
    const documentId = uploadResponse.body.documentId;

    // Process with strict validation
    const processResponse = await request(app)
      .post(`/api/cases/${strictCaseId}/documents/${documentId}/process`)
      .send({ strictMode: true })
      .expect(200);

    // Wait for processing
    let attempts = 0;
    let result;
    
    while (attempts < 20) {
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      const statusResponse = await request(app)
        .get(`/api/cases/${strictCaseId}/documents/${documentId}/status`)
        .expect(200);
      
      if (statusResponse.body.status === 'completed' || statusResponse.body.status === 'failed') {
        result = statusResponse.body;
        break;
      }
      
      attempts++;
    }

    expect(result).toBeDefined();
    
    if (result.status === 'completed') {
      // In strict mode, link count must equal detected index items
      expect(result.linkCount).toBe(result.indexItemCount);
      
      // All target pages must be within valid range
      const linksResponse = await request(app)
        .get(`/api/cases/${strictCaseId}/documents/${documentId}/links`)
        .expect(200);
      
      linksResponse.body.forEach((link: any) => {
        expect(link.targetPage).toBeGreaterThanOrEqual(1);
        expect(link.targetPage).toBeLessThanOrEqual(result.pageCount);
      });
    }

    // Clean up
    process.env.STRICT_INDEX_ONLY = 'false';
  }, 300000); // 5 minute timeout

  test('Performance test: concurrent uploads', async () => {
    const concurrentUploads = 5;
    const uploadPromises = [];

    for (let i = 0; i < concurrentUploads; i++) {
      const caseResponse = await request(app)
        .post('/api/cases')
        .send({ name: `Performance Test Case ${i}` })
        .expect(201);
      
      const uploadPromise = request(app)
        .post(`/api/cases/${caseResponse.body.id}/upload`)
        .attach('file', testPdfPath)
        .expect(200);
      
      uploadPromises.push(uploadPromise);
    }

    const startTime = Date.now();
    const results = await Promise.all(uploadPromises);
    const endTime = Date.now();

    expect(results).toHaveLength(concurrentUploads);
    expect(endTime - startTime).toBeLessThan(60000); // Should complete within 1 minute
  }, 120000); // 2 minute timeout

  test('Security test: file type validation', async () => {
    const caseResponse = await request(app)
      .post('/api/cases')
      .send({ name: 'Security Test Case' })
      .expect(201);
    
    const caseId = caseResponse.body.id;

    // Try to upload a non-PDF file
    const textFilePath = path.join(__dirname, '../fixtures/malicious.txt');
    await fs.writeFile(textFilePath, 'This is not a PDF');

    try {
      await request(app)
        .post(`/api/cases/${caseId}/upload`)
        .attach('file', textFilePath)
        .expect(400); // Should reject non-PDF files

      await fs.unlink(textFilePath);
    } catch (error) {
      await fs.unlink(textFilePath);
      throw error;
    }
  });

  test('Error handling: malformed PDF', async () => {
    const caseResponse = await request(app)
      .post('/api/cases')
      .send({ name: 'Error Handling Test Case' })
      .expect(201);
    
    const caseId = caseResponse.body.id;

    // Create a fake PDF file
    const fakePdfPath = path.join(__dirname, '../fixtures/fake.pdf');
    await fs.writeFile(fakePdfPath, 'This is not a real PDF file');

    try {
      const uploadResponse = await request(app)
        .post(`/api/cases/${caseId}/upload`)
        .attach('file', fakePdfPath);

      if (uploadResponse.status === 200) {
        // If upload succeeds, processing should fail gracefully
        const documentId = uploadResponse.body.documentId;
        
        await request(app)
          .post(`/api/cases/${caseId}/documents/${documentId}/process`)
          .expect(200);

        // Wait and check that it fails gracefully
        await new Promise(resolve => setTimeout(resolve, 10000));
        
        const statusResponse = await request(app)
          .get(`/api/cases/${caseId}/documents/${documentId}/status`)
          .expect(200);

        expect(statusResponse.body.status).toBe('failed');
        expect(statusResponse.body.error).toBeDefined();
      }

      await fs.unlink(fakePdfPath);
    } catch (error) {
      await fs.unlink(fakePdfPath);
      throw error;
    }
  });
});
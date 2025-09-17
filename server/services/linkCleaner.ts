/**
 * LinkCleaner - Forces removal of fake inflated links and replaces with real counts
 */
import { storage } from '../storage';
import { hyperlinkArbiter } from './hyperlinkArbiter';

export class LinkCleaner {
  /**
   * EMERGENCY: Clear all fake links and replace with real ones
   */
  async forceReplaceAllFakeLinks(caseId: string): Promise<void> {
    console.log(`🚨 EMERGENCY: Replacing ALL fake links in case ${caseId}...`);
    
    try {
      // Step 1: DELETE ALL existing links for this case
      const existingLinks = await storage.getLinks();
      const caseLinks = existingLinks.filter(link => link.caseId === caseId);
      
      console.log(`💀 Deleting ${caseLinks.length} fake links...`);
      for (const link of caseLinks) {
        await storage.deleteLink(link.id);
      }
      
      // Step 2: Get case documents
      const documents = await storage.getDocumentsByCase(caseId);
      
      // Step 3: Force recompute with arbiter
      const summary = await hyperlinkArbiter.resetAndRecompute(documents);
      
      // Step 4: Apply the real link decisions
      const { briefs, trialRecord } = this.classifyDocuments(documents);
      
      if (trialRecord) {
        const anchors = await hyperlinkArbiter.extractTrialRecordAnchors(trialRecord.storagePath, trialRecord.id);
        const hits = await hyperlinkArbiter.extractBriefHits(briefs);
        const decisions = hyperlinkArbiter.arbitrate(anchors, hits);
        
        let totalPlaced = 0;
        
        // Create ONLY the validated links
        for (const decision of decisions.filter(d => d.decision === 'link')) {
          const linkData = {
            caseId,
            srcDocId: decision.brief_file,
            targetDocId: trialRecord.id,
            srcPage: decision.brief_page,
            targetPage: decision.dest_page!,
            srcText: `${decision.ref_type} ${decision.ref_value}`,
            targetText: `${decision.ref_type} ${decision.ref_value}`,
            linkType: decision.ref_type.toLowerCase() as any,
            status: 'approved' as any,
            confidence: 1.0,
            reviewedAt: new Date(),
            createdAt: new Date(),
            updatedAt: new Date()
          };
          
          await storage.createLink(linkData);
          totalPlaced++;
        }
        
        console.log(`✅ REPLACED: ${caseLinks.length} fake links → ${totalPlaced} real links`);
        console.log(`📊 Real counts per document:`, summary);
        
        return;
      }
      
      throw new Error('No trial record found');
      
    } catch (error) {
      console.error('Failed to replace fake links:', error);
      throw error;
    }
  }

  private classifyDocuments(documents: Array<{id: string, title: string, storagePath: string, pageCount: number}>) {
    const briefs = documents.filter(doc => 
      !doc.title.toLowerCase().includes('trial record') && 
      !doc.title.toLowerCase().includes('transcript')
    );
    
    const trialRecord = documents.find(doc => 
      doc.title.toLowerCase().includes('trial record') || 
      doc.title.toLowerCase().includes('transcript')
    ) || null;

    return { briefs, trialRecord };
  }
}

export const linkCleaner = new LinkCleaner();
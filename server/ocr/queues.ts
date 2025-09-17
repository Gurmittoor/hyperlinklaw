import { JobsOptions } from 'bullmq';

// Mock in-memory queue system for development (Redis-free)
class MockQueue {
  private jobs: any[] = [];
  private name: string;

  constructor(name: string, options?: any) {
    this.name = name;
    console.log(`📋 Mock queue "${name}" initialized`);
  }

  async add(jobName: string, data: any, options?: JobsOptions) {
    const job = { name: jobName, data, id: Date.now().toString() };
    this.jobs.push(job);
    console.log(`➕ Added job to ${this.name}: ${jobName}`);
    
    // Process immediately for development
    setTimeout(() => this.processJob(job), 100);
    return job;
  }

  private async processJob(job: any) {
    console.log(`⚡ Processing job ${job.name} in ${this.name}`);
    // Jobs are processed by the actual OCR system, not the queue
  }

  async getWaiting() { return []; }
  async getActive() { return []; }
  async getCompleted() { return []; }
  async getFailed() { return []; }
}

// Mock Redis connection (no-op)
export const redis = {
  on: (event: string, callback: Function) => {
    if (event === 'ready') {
      setTimeout(() => callback(), 100);
    }
  }
};

// Mock queues for development
export const docQueue = new MockQueue('ocr-doc');
export const batchQueue = new MockQueue('ocr-batch');

/**
 * Enqueue a document for parallel OCR processing
 */
export async function enqueueDoc(documentId: string, options: {
  batchSize?: number;
  maxConcurrent?: number;
  priority?: number;
} = {}): Promise<void> {
  const jobOptions: JobsOptions = {
    attempts: 3,
    removeOnComplete: true,
    backoff: { 
      type: 'exponential', 
      delay: 3000 
    }
  };

  if (options.priority) {
    jobOptions.priority = options.priority;
  }

  await docQueue.add('start', { 
    documentId, 
    ...options 
  }, jobOptions);

  console.log(`📋 Enqueued document ${documentId} for parallel OCR processing`);
}

/**
 * Get queue statistics for monitoring
 */
export async function getQueueStats() {
  const [docStats, batchStats] = await Promise.all([
    {
      waiting: await docQueue.getWaiting().then(jobs => jobs.length),
      active: await docQueue.getActive().then(jobs => jobs.length),
      completed: await docQueue.getCompleted().then(jobs => jobs.length),
      failed: await docQueue.getFailed().then(jobs => jobs.length)
    },
    {
      waiting: await batchQueue.getWaiting().then(jobs => jobs.length),
      active: await batchQueue.getActive().then(jobs => jobs.length),
      completed: await batchQueue.getCompleted().then(jobs => jobs.length),
      failed: await batchQueue.getFailed().then(jobs => jobs.length)
    }
  ]);

  return {
    documents: docStats,
    batches: batchStats
  };
}

console.log('✅ In-memory queue system ready for OCR processing (Redis-free)');
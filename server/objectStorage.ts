import { Response } from "express";
import { randomUUID } from "crypto";
import * as fs from "fs";
import * as path from "path";

// Simple object storage service that uses local filesystem
// In production, this would integrate with cloud storage like S3, GCS, etc.
export class ObjectStorageService {
  private readonly storageDir: string;

  constructor() {
    this.storageDir = path.join(process.cwd(), "storage");
    this.ensureStorageDirectory();
  }

  private ensureStorageDirectory(): void {
    if (!fs.existsSync(this.storageDir)) {
      fs.mkdirSync(this.storageDir, { recursive: true });
    }
  }

  // Upload a file to object storage
  async uploadFile(file: Express.Multer.File, prefix: string = ""): Promise<string> {
    try {
      const fileId = randomUUID();
      const extension = path.extname(file.originalname);
      const storageKey = `${prefix}${fileId}${extension}`;
      const storagePath = path.join(this.storageDir, storageKey);

      // Ensure the directory exists
      const dir = path.dirname(storagePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      // Validate file exists and is readable
      if (!fs.existsSync(file.path)) {
        throw new Error(`Upload file not found: ${file.path}`);
      }

      // Check file size (500MB limit)
      const stats = fs.statSync(file.path);
      if (stats.size > 500 * 1024 * 1024) {
        throw new Error(`File too large: ${stats.size} bytes (limit: 500MB)`);
      }

      // Copy the uploaded file to storage
      fs.copyFileSync(file.path, storagePath);
      
      // Verify the copy was successful
      if (!fs.existsSync(storagePath)) {
        throw new Error(`Failed to copy file to storage: ${storagePath}`);
      }

      // Clean up the temporary file
      try {
        fs.unlinkSync(file.path);
      } catch (cleanupError) {
        console.warn(`Failed to cleanup temp file: ${file.path}`, cleanupError);
      }

      return storageKey;
    } catch (error) {
      // Clean up temp file on error
      try {
        if (fs.existsSync(file.path)) {
          fs.unlinkSync(file.path);
        }
      } catch (cleanupError) {
        console.warn(`Failed to cleanup temp file on error: ${file.path}`, cleanupError);
      }
      throw error;
    }
  }

  // Get file stream for download
  async downloadFile(storageKey: string, res: Response): Promise<void> {
    const filePath = path.join(this.storageDir, storageKey);
    
    if (!fs.existsSync(filePath)) {
      res.status(404).json({ error: "File not found" });
      return;
    }

    const stats = fs.statSync(filePath);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Length', stats.size);
    
    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
  }

  // Check if file exists
  async fileExists(storageKey: string): Promise<boolean> {
    const filePath = path.join(this.storageDir, storageKey);
    return fs.existsSync(filePath);
  }

  // Delete a file
  async deleteFile(storageKey: string): Promise<void> {
    const filePath = path.join(this.storageDir, storageKey);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }

  // Get file path for local processing
  getFilePath(storageKey: string): string {
    return path.join(this.storageDir, storageKey);
  }
}

export const objectStorageService = new ObjectStorageService();
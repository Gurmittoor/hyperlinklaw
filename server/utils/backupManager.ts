import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';

const execAsync = promisify(exec);

export interface BackupConfig {
  retentionDays: number;
  backupPath: string;
  databaseUrl: string;
}

export class BackupManager {
  private config: BackupConfig;

  constructor(config: BackupConfig) {
    this.config = config;
  }

  async createDatabaseBackup(): Promise<{ success: boolean; filePath?: string; error?: string }> {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupFileName = `hyperlinklaw-backup-${timestamp}.sql`;
      const backupFilePath = path.join(this.config.backupPath, backupFileName);

      // Ensure backup directory exists
      await fs.mkdir(this.config.backupPath, { recursive: true });

      // Create database dump using pg_dump
      const command = `pg_dump "${this.config.databaseUrl}" > "${backupFilePath}"`;
      
      await execAsync(command);

      // Verify backup file was created and has content
      const stats = await fs.stat(backupFilePath);
      if (stats.size === 0) {
        throw new Error('Backup file is empty');
      }

      console.log(`✅ Database backup created: ${backupFilePath} (${Math.round(stats.size / 1024 / 1024)}MB)`);

      return { success: true, filePath: backupFilePath };
    } catch (error) {
      console.error('❌ Backup creation failed:', error);
      return { success: false, error: error.message };
    }
  }

  async cleanupOldBackups(): Promise<void> {
    try {
      const files = await fs.readdir(this.config.backupPath);
      const backupFiles = files.filter(file => file.startsWith('hyperlinklaw-backup-'));

      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - this.config.retentionDays);

      for (const file of backupFiles) {
        const filePath = path.join(this.config.backupPath, file);
        const stats = await fs.stat(filePath);

        if (stats.mtime < cutoffDate) {
          await fs.unlink(filePath);
          console.log(`🗑️ Deleted old backup: ${file}`);
        }
      }
    } catch (error) {
      console.error('❌ Backup cleanup failed:', error);
    }
  }

  async testRestore(backupFilePath: string, testDatabaseUrl: string): Promise<boolean> {
    try {
      // Create test database restoration
      const command = `psql "${testDatabaseUrl}" < "${backupFilePath}"`;
      await execAsync(command);

      // Verify restoration by checking table existence
      const verifyCommand = `psql "${testDatabaseUrl}" -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public';"`;
      const result = await execAsync(verifyCommand);
      
      const tableCount = parseInt(result.stdout.trim().split('\n')[2]);
      if (tableCount > 0) {
        console.log(`✅ Backup restore test successful: ${tableCount} tables restored`);
        return true;
      } else {
        throw new Error('No tables found after restore');
      }
    } catch (error) {
      console.error('❌ Backup restore test failed:', error);
      return false;
    }
  }

  async getBackupStatus(): Promise<{
    totalBackups: number;
    latestBackup?: { date: string; size: string };
    oldestBackup?: { date: string; size: string };
  }> {
    try {
      const files = await fs.readdir(this.config.backupPath);
      const backupFiles = files.filter(file => file.startsWith('hyperlinklaw-backup-'));

      if (backupFiles.length === 0) {
        return { totalBackups: 0 };
      }

      const backupInfo = [];
      for (const file of backupFiles) {
        const filePath = path.join(this.config.backupPath, file);
        const stats = await fs.stat(filePath);
        backupInfo.push({
          file,
          date: stats.mtime.toISOString(),
          size: `${Math.round(stats.size / 1024 / 1024)}MB`
        });
      }

      backupInfo.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

      return {
        totalBackups: backupFiles.length,
        latestBackup: backupInfo[0],
        oldestBackup: backupInfo[backupInfo.length - 1]
      };
    } catch (error) {
      console.error('❌ Failed to get backup status:', error);
      return { totalBackups: 0 };
    }
  }
}

// Create backup manager instance
export const backupManager = new BackupManager({
  retentionDays: 30,
  backupPath: process.env.BACKUP_PATH || './backups',
  databaseUrl: process.env.DATABASE_URL || ''
});

// Schedule daily backups (in production, use a proper scheduler like cron)
export function scheduleBackups() {
  const runBackup = async () => {
    console.log('🔄 Starting scheduled backup...');
    const result = await backupManager.createDatabaseBackup();
    
    if (result.success) {
      await backupManager.cleanupOldBackups();
    }
  };

  // Run backup every 24 hours
  setInterval(runBackup, 24 * 60 * 60 * 1000);
  
  // Run initial backup after 5 minutes
  setTimeout(runBackup, 5 * 60 * 1000);
}
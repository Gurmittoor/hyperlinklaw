// Upload success event system for auto-opening Index Tabs

export type UploadedFile = { 
  id: string; 
  url: string; 
  caseId: string;
  name: string;
};

const listeners: Array<(file: UploadedFile) => void> = [];

export function onUploadSuccess(callback: (file: UploadedFile) => void) {
  listeners.push(callback);
  
  // Return cleanup function
  return () => {
    const index = listeners.indexOf(callback);
    if (index > -1) {
      listeners.splice(index, 1);
    }
  };
}

export function emitUploadSuccess(file: UploadedFile) {
  listeners.forEach(callback => {
    try {
      callback(file);
    } catch (error) {
      console.error('Error in upload success callback:', error);
    }
  });
}
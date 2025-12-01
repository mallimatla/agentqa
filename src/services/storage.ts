/**
 * Firebase Storage Service for AgentQA
 * Handles file uploads for reports, screenshots, and videos
 */

import {
  ref,
  uploadBytes,
  uploadString,
  getDownloadURL,
  deleteObject,
  listAll,
} from 'firebase/storage';
import { storage } from '../config/firebase';

// Storage paths
const PATHS = {
  REPORTS: 'reports',
  SCREENSHOTS: 'screenshots',
  VIDEOS: 'videos',
  EXPORTS: 'exports',
};

export interface UploadResult {
  url: string;
  path: string;
  name: string;
}

export const storageService = {
  /**
   * Upload a file buffer
   */
  async uploadFile(
    userId: string,
    projectId: string,
    category: keyof typeof PATHS,
    fileName: string,
    data: Uint8Array | Blob,
    contentType?: string
  ): Promise<UploadResult> {
    const path = `${PATHS[category]}/${userId}/${projectId}/${Date.now()}_${fileName}`;
    const storageRef = ref(storage, path);

    const metadata = contentType ? { contentType } : undefined;
    await uploadBytes(storageRef, data, metadata);

    const url = await getDownloadURL(storageRef);
    return { url, path, name: fileName };
  },

  /**
   * Upload a base64 string (for screenshots)
   */
  async uploadBase64(
    userId: string,
    projectId: string,
    category: keyof typeof PATHS,
    fileName: string,
    base64Data: string,
    contentType = 'image/png'
  ): Promise<UploadResult> {
    const path = `${PATHS[category]}/${userId}/${projectId}/${Date.now()}_${fileName}`;
    const storageRef = ref(storage, path);

    await uploadString(storageRef, base64Data, 'base64', { contentType });

    const url = await getDownloadURL(storageRef);
    return { url, path, name: fileName };
  },

  /**
   * Upload HTML report
   */
  async uploadReport(
    userId: string,
    projectId: string,
    runId: string,
    htmlContent: string
  ): Promise<UploadResult> {
    const fileName = `report_${runId}.html`;
    const path = `${PATHS.REPORTS}/${userId}/${projectId}/${fileName}`;
    const storageRef = ref(storage, path);

    const blob = new Blob([htmlContent], { type: 'text/html' });
    await uploadBytes(storageRef, blob, { contentType: 'text/html' });

    const url = await getDownloadURL(storageRef);
    return { url, path, name: fileName };
  },

  /**
   * Upload JSON data (test results, exports)
   */
  async uploadJSON(
    userId: string,
    projectId: string,
    fileName: string,
    data: any
  ): Promise<UploadResult> {
    const path = `${PATHS.EXPORTS}/${userId}/${projectId}/${Date.now()}_${fileName}`;
    const storageRef = ref(storage, path);

    const jsonString = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    await uploadBytes(storageRef, blob, { contentType: 'application/json' });

    const url = await getDownloadURL(storageRef);
    return { url, path, name: fileName };
  },

  /**
   * Upload CSV export
   */
  async uploadCSV(
    userId: string,
    projectId: string,
    fileName: string,
    csvContent: string
  ): Promise<UploadResult> {
    const path = `${PATHS.EXPORTS}/${userId}/${projectId}/${Date.now()}_${fileName}`;
    const storageRef = ref(storage, path);

    const blob = new Blob([csvContent], { type: 'text/csv' });
    await uploadBytes(storageRef, blob, { contentType: 'text/csv' });

    const url = await getDownloadURL(storageRef);
    return { url, path, name: fileName };
  },

  /**
   * Get download URL for a file
   */
  async getURL(path: string): Promise<string> {
    const storageRef = ref(storage, path);
    return getDownloadURL(storageRef);
  },

  /**
   * Delete a file
   */
  async deleteFile(path: string): Promise<void> {
    const storageRef = ref(storage, path);
    await deleteObject(storageRef);
  },

  /**
   * List files in a directory
   */
  async listFiles(
    userId: string,
    projectId: string,
    category: keyof typeof PATHS
  ): Promise<string[]> {
    const path = `${PATHS[category]}/${userId}/${projectId}`;
    const storageRef = ref(storage, path);
    const result = await listAll(storageRef);
    return result.items.map(item => item.fullPath);
  },

  /**
   * Delete all files for a project
   */
  async deleteProjectFiles(userId: string, projectId: string): Promise<void> {
    const categories = Object.keys(PATHS) as (keyof typeof PATHS)[];

    for (const category of categories) {
      const files = await this.listFiles(userId, projectId, category);
      await Promise.all(files.map(path => this.deleteFile(path)));
    }
  },
};

export default storageService;

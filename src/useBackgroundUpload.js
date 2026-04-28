import { useState, useEffect } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';

export function useBackgroundUpload(apiBaseUrl, setJobs) {
  const [uploadQueue, setUploadQueue] = useState([]); 
  const [isUploadingToCloud, setIsUploadingToCloud] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(null);

  // Background Worker: Tự động vét hàng đợi UI đẩy lên Server
  useEffect(() => {
    const processUploadQueue = async () => {
      if (uploadQueue.length === 0 || isUploadingToCloud) return;

      setIsUploadingToCloud(true);
      const CHUNK_SIZE = 2; // Tối đa 2 file 1 lần
      
      const targetFolder = uploadQueue[0].folderName;
      const filesToUpload = uploadQueue.filter(item => item.folderName === targetFolder).slice(0, CHUNK_SIZE);
      const remainingQueue = uploadQueue.filter(item => !filesToUpload.includes(item));

      try {
        const formData = new FormData();
        formData.append('folderName', targetFolder);
        filesToUpload.forEach(item => formData.append('files', item.file));

        const response = await axios.post(`${apiBaseUrl}`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
          onUploadProgress: (progressEvent) => {
            const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
            setUploadProgress(`Đang đẩy [${targetFolder}]: ${percentCompleted}% - Còn ${remainingQueue.length} file chờ...`);
          }
        });

        const newJobs = response.data.jobs.map(j => ({ ...j, logs: [], result: null }));
        setJobs(prevJobs => {
          const existingIds = new Set(prevJobs.map(j => j.jobId));
          const uniqueNewJobs = newJobs.filter(j => !existingIds.has(j.jobId));
          return [...uniqueNewJobs, ...prevJobs]; 
        });

        setUploadQueue(remainingQueue);
        if (remainingQueue.length === 0) setUploadProgress(null);

      } catch (error) {
        toast.error(`Lỗi tải lên thư mục [${targetFolder}]`);
        console.error('Lỗi Upload:', error);
      } finally {
        setIsUploadingToCloud(false);
      }
    };

    processUploadQueue();
  }, [uploadQueue, isUploadingToCloud, apiBaseUrl, setJobs]);

  // Hàm đẩy file vào hàng đợi
  const addToQueue = (files, targetFolder) => {
    if (!files || files.length === 0) return;
    
    const filesArray = Array.from(files);
    const folder = targetFolder.trim() || 'Mặc định';

    const newQueueItems = filesArray.map(file => ({
      file,
      folderName: folder
    }));

    setUploadQueue(prev => [...prev, ...newQueueItems]);
  };

  return { uploadQueue, uploadProgress, addToQueue };
}
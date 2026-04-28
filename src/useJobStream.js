import { useEffect } from 'react';

export function useJobStream(apiBaseUrl, setJobs, setSysStatus) {
  useEffect(() => {
    const eventSource = new EventSource(`${apiBaseUrl}/stream`);

    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);

      if (data.type === 'systemStatus') {
        setSysStatus(data.data);
      }
      else if (data.type === 'status') {
        setJobs(prevJobs => prevJobs.map(job => 
          job.jobId === data.jobId ? { ...job, status: data.status, error: data.error } : job
        ));
      } 
      else if (data.type === 'log') {
        setJobs(prevJobs => prevJobs.map(job => 
          job.jobId === data.jobId ? { ...job, logs: [...(job.logs || []), data.msg] } : job
        ));
      }
    };

    // Cleanup function để ngắt kết nối khi component unmount
    return () => eventSource.close();
  }, [apiBaseUrl, setJobs, setSysStatus]); 
}
import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import ReactMarkdown from 'react-markdown';
import './App.css';

// [THÊM MỚI] Khai báo URL gốc. Khi lên Cloud, chỉ cần đổi dòng này thành Domain thực tế.
const API_BASE_URL = 'https://med-translator-backend.onrender.com/api/translate';

// -------------------------------------------------------------
// COMPONENT CON: JOB CARD (Quản lý hiển thị cho từng file)
// -------------------------------------------------------------
const JobCard = ({ job, onDelete }) => {
  const [isCopied, setIsCopied] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const logsEndRef = useRef(null);

  // Tự động cuộn terminal của riêng job này
  useEffect(() => {
    if (job.status === 'processing') {
      logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [job.logs]);

  const handleCopy = async () => {
    if (!job.result) return;
    try {
      await navigator.clipboard.writeText(job.result);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    } catch (err) {
      alert('Không thể copy nội dung!');
    }
  };

  return (
    <div className={`job-card ${job.status}`}>
      <div className="job-header">
        <div className="job-info">
          <span className="job-name">📄 {job.originalName || job.fileName || 'Tài liệu'}</span>
          <span className={`status-badge ${job.status}`}>
            {job.status === 'pending' && '⏳ Đang chờ...'}
            {job.status === 'processing' && '⚙️ Đang dịch...'}
            {job.status === 'completed' && '✅ Hoàn thành'}
            {job.status === 'failed' && '❌ Lỗi'}
          </span>
        </div>

        <div className="job-actions">
          {job.status === 'completed' && (
            <>
              <button className="preview-btn" onClick={() => setShowPreview(!showPreview)}>
                {showPreview ? 'Đóng xem trước' : '👁️ Xem trước'}
              </button>
              <button onClick={handleCopy} className={`copy-btn ${isCopied ? 'copied' : ''}`}>
                {isCopied ? '✅ Đã Copy' : '📋 Copy Markdown'}
              </button>
            </>
          )}
          
          {/* Nút Xóa xuất hiện ở cả job lỗi và job đã hoàn thành */}
          {(job.status === 'failed' || job.status === 'completed') && (
            <button 
              onClick={() => onDelete(job.jobId)} 
              className="delete-btn" 
              style={{ backgroundColor: '#dc3545', color: 'white', border: 'none', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer', marginLeft: '8px', fontSize: '0.9em' }}
            >
              🗑️ Xóa
            </button>
          )}
        </div>
      </div>

      {/* HIỂN THỊ LỖI */}
      {job.status === 'failed' && (
        <div className="job-error">Chi tiết lỗi: {job.error}</div>
      )}

      {/* HIỂN THỊ TERMINAL LOG */}
      {job.status === 'processing' && (
        <div className="terminal-container mini-terminal">
          <div className="terminal-header">
            <div className="mac-dots">
              <span>●</span><span>●</span><span>●</span>
            </div>
            <span className="terminal-title">System Logs (Live)</span>
          </div>
          <div className="terminal-body">
            {job.logs?.map((log, index) => (
              <div key={index} className="log-line">
                <span className="log-time">[{new Date().toLocaleTimeString()}]</span> {log}
              </div>
            ))}
            <div ref={logsEndRef} />
          </div>
        </div>
      )}

      {/* HIỂN THỊ KẾT QUẢ MARKDOWN */}
      {job.status === 'completed' && showPreview && job.result && (
        <div className="markdown-preview mt-15">
          <ReactMarkdown>{job.result}</ReactMarkdown>
        </div>
      )}
    </div>
  );
};

// -------------------------------------------------------------
// COMPONENT CHÍNH: APP (Quản lý Queue, API, và SSE)
// -------------------------------------------------------------
function App() {
  const [selectedFiles, setSelectedFiles] = useState(null);
  const [folderName, setFolderName] = useState(''); // [THÊM MỚI] State lưu tên thư mục
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(null); // [THÊM MỚI] Hiển thị tiến độ tải lên
  const [jobs, setJobs] = useState([]); 

  // 1. Phục hồi trạng thái khi F5
  useEffect(() => {
    const fetchExistingJobs = async () => {
      try {
        const res = await axios.get(`${API_BASE_URL}/jobs`);
        const formattedJobs = res.data.map(j => ({ ...j, logs: [], result: null }));
        setJobs(formattedJobs);
      } catch (error) {
        console.error("Không thể lấy danh sách hàng đợi:", error);
      }
    };
    fetchExistingJobs();
  }, []);

  // 2. Kéo kết quả Markdown khi một job báo 'completed' nhưng chưa có result
  useEffect(() => {
    const fetchMissingResults = async () => {
      jobs.forEach(async (job) => {
        if (job.status === 'completed' && !job.result) {
          try {
            const res = await axios.get(`${API_BASE_URL}/jobs/${job.jobId}/result`);
            setJobs(prevJobs => prevJobs.map(j => 
              j.jobId === job.jobId ? { ...j, result: res.data.result } : j
            ));
          } catch (err) {
            console.error(`Lỗi kéo kết quả file ${job.originalName}:`, err);
          }
        }
      });
    };
    fetchMissingResults();
  }, [jobs]);

  // 3. Lắng nghe SSE thời gian thực từ Backend
  useEffect(() => {
    const eventSource = new EventSource(`${API_BASE_URL}/stream`);

    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);

      if (data.type === 'status') {
        setJobs(prevJobs => prevJobs.map(job => 
          job.jobId === data.jobId 
            ? { ...job, status: data.status, error: data.error } 
            : job
        ));
      } 
      else if (data.type === 'log') {
        setJobs(prevJobs => prevJobs.map(job => 
          job.jobId === data.jobId 
            ? { ...job, logs: [...(job.logs || []), data.msg] } 
            : job
        ));
      }
    };

    return () => eventSource.close();
  }, []); 

  const handleDeleteJob = async (jobId) => {
    const isConfirm = window.confirm('Bạn có chắc chắn muốn xóa tiến trình này không?');
    if (!isConfirm) return;

    try {
      await axios.delete(`${API_BASE_URL}/jobs/${jobId}`);
      setJobs(prevJobs => prevJobs.filter(job => job.jobId !== jobId));
    } catch (error) {
      alert('Lỗi khi xóa tiến trình: ' + (error.response?.data?.error || error.message));
    }
  };

  const handleFileChange = (e) => {
    setSelectedFiles(e.target.files); // Không giới hạn 100 file nữa
  };

  // [THUẬT TOÁN MỚI] Gửi file theo Batch (Chia nhỏ để chống treo Server)
  const handleUpload = async () => {
    if (!selectedFiles || selectedFiles.length === 0) return;

    const filesArray = Array.from(selectedFiles);
    const totalFiles = filesArray.length;
    const CHUNK_SIZE = 10; // Gửi tối đa 10 file một lần
    const targetFolder = folderName.trim() || 'Mặc định';

    setIsUploading(true);

    try {
      for (let i = 0; i < totalFiles; i += CHUNK_SIZE) {
        const chunk = filesArray.slice(i, i + CHUNK_SIZE);
        const formData = new FormData();
        
        formData.append('folderName', targetFolder);
        chunk.forEach(file => formData.append('files', file));

        setUploadProgress(`Đang nạp lên Server: ${Math.min(i + CHUNK_SIZE, totalFiles)}/${totalFiles} files...`);

        const response = await axios.post(`${API_BASE_URL}`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });

        const newJobs = response.data.jobs.map(j => ({ ...j, logs: [], result: null }));
        
        setJobs(prevJobs => {
          const existingIds = new Set(prevJobs.map(j => j.jobId));
          const uniqueNewJobs = newJobs.filter(j => !existingIds.has(j.jobId));
          return [...uniqueNewJobs, ...prevJobs]; 
        });
      }

      document.getElementById('fileInput').value = '';
      setSelectedFiles(null);
      setFolderName('');
    } catch (error) {
      alert('Lỗi tải file: Cụm file này quá lớn hoặc mạng không ổn định.');
    } finally {
      setIsUploading(false);
      setUploadProgress(null);
    }
  };

  const sanitizeFileName = (name) => {
    return name.replace(/[<>:"/\\|?*\x00-\x1F]/g, '').replace(/[\s\t\n]+/g, '_').replace(/^\.+|\.+$/g, ''); 
  };

  // [SỬA ĐỔI] Chỉ tải xuống các file hoàn thành TRONG THƯ MỤC được chọn
  const handleDownloadFolder = async (targetFolderName, folderJobs) => {
    const completedJobs = folderJobs.filter(job => job.status === 'completed' && job.result);

    if (completedJobs.length === 0) {
      alert('Thư mục này chưa có tài liệu nào hoàn thành!');
      return;
    }

    if (!('showDirectoryPicker' in window)) {
      alert('⚠️ Trình duyệt của bạn không hỗ trợ File System Access API.');
      return;
    }

    try {
      const directoryHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
      let successCount = 0;

      for (const [index, job] of completedJobs.entries()) {
        try {
          let rawName = job.originalName || job.fileName || `TaiLieu_${index + 1}`;
          const baseName = rawName.replace(/\.[^/.]+$/, "");
          const cleanName = sanitizeFileName(baseName);
          const finalFileName = `${cleanName || `Doc_${index}`}_vi.md`;

          const fileHandle = await directoryHandle.getFileHandle(finalFileName, { create: true });
          const writable = await fileHandle.createWritable();
          await writable.write(job.result);
          await writable.close();
          successCount++;
        } catch (fileError) {
          console.error(`Lỗi khi ghi file ${job.originalName}:`, fileError);
        }
      }
      alert(`✅ Đã lưu ${successCount}/${completedJobs.length} tài liệu của thư mục [${targetFolderName}]!`);
    } catch (error) {
      if (error.name !== 'AbortError') console.error('❌ Lỗi System I/O:', error);
    }
  };  

  // [THÊM MỚI] Thuật toán nhóm các Job lại theo tên Thư mục
  const groupedJobs = jobs.reduce((acc, job) => {
    const folder = job.folderName || 'Mặc định';
    if (!acc[folder]) acc[folder] = [];
    acc[folder].push(job);
    return acc;
  }, {});

  return (
    <div className="app-container">
      <header className="header">
        <h1>🩺 StudyMed Translator</h1>
        <p>Hệ thống tự động dịch sách và tài liệu Y khoa (Multi-Batch Mode)</p>
      </header>

      <main className="main-content">
        <div className="upload-section" style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <input 
              type="text" 
              placeholder="Tên thư mục (Vd: Module Nội tiết)" 
              value={folderName}
              onChange={(e) => setFolderName(e.target.value)}
              style={{ padding: '10px', borderRadius: '5px', border: '1px solid #ccc', flex: 1 }}
            />
            <input 
              id="fileInput"
              type="file" 
              accept="application/pdf" 
              multiple 
              onChange={handleFileChange} 
              className="file-input"
              style={{ flex: 2 }}
            />
          </div>
          
          <button 
            onClick={handleUpload} 
            disabled={!selectedFiles || selectedFiles.length === 0 || isUploading}
            className="upload-btn"
          >
            {isUploading 
              ? `⏳ ${uploadProgress}` 
              : `🚀 Nạp ${selectedFiles ? selectedFiles.length : 0} file vào hàng đợi`}
          </button>
        </div>

        <div className="jobs-container">
          {Object.entries(groupedJobs).map(([folderName, folderJobs]) => (
            <div key={folderName} className="folder-group" style={{ marginBottom: '40px', border: '1px solid #e0e0e0', borderRadius: '8px', padding: '15px', background: '#fcfcfc' }}>
              <div className="queue-header-actions" style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '2px solid #007bff', paddingBottom: '10px', marginBottom: '20px' }}>
                <h3 className="queue-title" style={{ color: '#007bff', margin: 0 }}>
                  📁 Thư mục: {folderName} ({folderJobs.length} files)
                </h3>
                {folderJobs.some(j => j.status === 'completed' && j.result) && (
                  <button onClick={() => handleDownloadFolder(folderName, folderJobs)} className="download-all-btn" style={{ background: '#28a745', color: 'white', border: 'none', padding: '8px 15px', borderRadius: '5px', cursor: 'pointer' }}>
                    📥 Tải các file đã xong
                  </button>
                )}
              </div>
              
              <div className="masonry-grid-fallback">
                {folderJobs.map(job => (
                  <JobCard key={job.jobId} job={job} onDelete={handleDeleteJob} />
                ))}
              </div>
            </div>
          ))}

          {jobs.length === 0 && (
            <div className="empty-state">
              <div className="empty-wash">Chưa có tài liệu nào trong hệ thống.</div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

export default App;
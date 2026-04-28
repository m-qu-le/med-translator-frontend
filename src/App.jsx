import React, { useState, useEffect, useRef, memo, useMemo } from 'react';
import axios from 'axios';
import ReactMarkdown from 'react-markdown';
import './App.css';
import { Toaster, toast } from 'react-hot-toast';

// Các Custom Hooks đã được tách ra
import { useJobStream } from './useJobStream';
import { useBackgroundUpload } from './useBackgroundUpload';

// Khai báo URL gốc. Khi lên Cloud, chỉ cần đổi dòng này thành Domain thực tế.
const API_BASE_URL = 'https://med-translator-backend.onrender.com/api/translate';

// -------------------------------------------------------------
// COMPONENT CON: JOB CARD (Quản lý hiển thị cho từng file)
// -------------------------------------------------------------
const JobCard = memo(({ job, onDelete }) => {
  const [isCopied, setIsCopied] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const logsEndRef = useRef(null);

  // Tự động cuộn terminal
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
      toast.success('Đã copy nội dung thành công!');
    } catch (err) {
      toast.error('Không thể copy nội dung!');
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

      {job.status === 'failed' && (
        <div className="job-error">Chi tiết lỗi: {job.error}</div>
      )}

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

      {job.status === 'completed' && showPreview && job.result && (
        <div className="markdown-preview mt-15">
          <ReactMarkdown>{job.result}</ReactMarkdown>
        </div>
      )}
    </div>
  );
}, (prevProps, nextProps) => {
  return (
    prevProps.job.status === nextProps.job.status &&
    prevProps.job.result === nextProps.job.result &&
    prevProps.job.error === nextProps.job.error &&
    (prevProps.job.logs?.length || 0) === (nextProps.job.logs?.length || 0)
  );
});

// -------------------------------------------------------------
// COMPONENT CON: FOLDER GROUP (Quản lý hiển thị cho từng thư mục)
// -------------------------------------------------------------
const FolderGroup = memo(({ folderName, folderJobs, onDeleteJob, onDownloadFolder, onBulkDelete }) => {
  // Thêm state để ẩn/hiện danh sách file trong thư mục
  const [isExpanded, setIsExpanded] = useState(true);

  return (
    <div className="folder-group" style={{ marginBottom: '40px', border: '1px solid #e0e0e0', borderRadius: '8px', padding: '15px', background: '#fcfcfc' }}>
      <div className="queue-header-actions" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid #007bff', paddingBottom: '10px', marginBottom: '20px' }}>
        <h3 
          className="queue-title" 
          style={{ color: '#007bff', margin: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}
          onClick={() => setIsExpanded(!isExpanded)}
          title="Nhấn để thu gọn/mở rộng thư mục"
        >
          {isExpanded ? '📂' : '📁'} {folderName} ({folderJobs.length} files)
        </h3>
        
        <div style={{ display: 'flex', gap: '10px' }}>
          {folderJobs.some(j => j.status === 'completed' && j.result) && (
            <button onClick={() => onDownloadFolder(folderName, folderJobs)} className="download-all-btn" style={{ background: '#28a745', color: 'white', border: 'none', padding: '8px 15px', borderRadius: '5px', cursor: 'pointer' }}>
              📥 Tải các file đã xong
            </button>
          )}
          {folderJobs.some(j => j.status === 'completed' || j.status === 'failed') && (
            <button onClick={() => onBulkDelete(folderName, folderJobs)} className="cleanup-btn" style={{ background: '#dc3545', color: 'white', border: 'none', padding: '8px 15px', borderRadius: '5px', cursor: 'pointer' }}>
              🧹 Dọn dẹp
            </button>
          )}
        </div>
      </div>
      
      {/* Tính năng Collapse/Expand dựa trên state isExpanded */}
      {isExpanded && (
        <div className="masonry-grid-fallback" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {folderJobs.map(job => (
            <JobCard key={job.jobId} job={job} onDelete={onDeleteJob} />
          ))}
        </div>
      )}
    </div>
  );
});


// -------------------------------------------------------------
// COMPONENT CHÍNH: APP (Quản lý Queue, API, và SSE)
// -------------------------------------------------------------
function App() {
  const [selectedFiles, setSelectedFiles] = useState(null);
  const [folderName, setFolderName] = useState(''); 
  const [jobs, setJobs] = useState([]); 
  
  const [sysStatus, setSysStatus] = useState({ isHibernating: false, stats: null });

  const { uploadQueue, uploadProgress, addToQueue } = useBackgroundUpload(API_BASE_URL, setJobs);
  
  const fetchedResultsRef = useRef(new Set());

  // 1. Phục hồi trạng thái khi F5
  useEffect(() => {
    const fetchInitialData = async () => {
      try {
        const statusRes = await axios.get(`${API_BASE_URL}/status`);
        setSysStatus(statusRes.data);

        const jobsRes = await axios.get(`${API_BASE_URL}/jobs`);
        const formattedJobs = jobsRes.data.map(j => ({ ...j, logs: [], result: null }));
        setJobs(formattedJobs);
      } catch (error) {
        console.error("Lỗi khởi tạo dữ liệu:", error);
      }
    };
    fetchInitialData();
  }, []);

  // 2. Tự động vét dữ liệu cho các Jobs đã hoàn thành nhưng mất result
  useEffect(() => {
    const fetchMissingResults = async () => {
      for (const job of jobs) {
        if (job.status === 'completed' && !job.result && !fetchedResultsRef.current.has(job.jobId)) {
          fetchedResultsRef.current.add(job.jobId);
          try {
            const res = await axios.get(`${API_BASE_URL}/jobs/${job.jobId}/result`);
            setJobs(prevJobs => prevJobs.map(j => 
              j.jobId === job.jobId ? { ...j, result: res.data.result } : j
            ));
          } catch (err) {
            console.error(`Lỗi kéo kết quả file ${job.originalName}:`, err);
          }
        }
      }
    };
    fetchMissingResults();
  }, [jobs]);

  // 3. Lắng nghe SSE thời gian thực từ Backend
  useJobStream(API_BASE_URL, setJobs, setSysStatus);

  const handleDeleteJob = async (jobId) => {
    const isConfirm = window.confirm('Bạn có chắc chắn muốn xóa tiến trình này không?');
    if (!isConfirm) return;

    try {
      await axios.delete(`${API_BASE_URL}/jobs/${jobId}`);
      setJobs(prevJobs => prevJobs.filter(job => job.jobId !== jobId));
      toast.success('Đã xóa tiến trình');
    } catch (error) {
      toast.error('Lỗi khi xóa: ' + (error.response?.data?.error || error.message));
    }
  };

  const handleBulkDeleteFolder = async (targetFolderName, folderJobs) => {
    const jobsToDelete = folderJobs.filter(job => job.status === 'completed' || job.status === 'failed');
    
    if (jobsToDelete.length === 0) {
      toast.error('Không có tài liệu nào hoàn thành hoặc lỗi để dọn dẹp.');
      return;
    }

    const isConfirm = window.confirm(`Bạn có chắc chắn muốn XÓA GỌN ${jobsToDelete.length} tiến trình (đã xong/lỗi) khỏi thư mục [${targetFolderName}]?`);
    if (!isConfirm) return;

    const jobIds = jobsToDelete.map(job => job.jobId);

    try {
      await axios.post(`${API_BASE_URL}/bulk-delete`, { jobIds });
      setJobs(prevJobs => prevJobs.filter(job => !jobIds.includes(job.jobId)));
      toast.success(`Đã dọn dẹp ${jobsToDelete.length} tiến trình.`);
    } catch (error) {
      toast.error('Lỗi khi dọn dẹp hàng loạt: ' + (error.response?.data?.error || error.message));
    }
  };

  const handleForceWakeUp = async () => {
    const isConfirm = window.confirm('⚡ Bạn có chắc chắn muốn ép hệ thống thức dậy và tiếp tục dịch ngay lập tức không?');
    if (!isConfirm) return;

    try {
      const response = await axios.post(`${API_BASE_URL}/force-wakeup`);
      toast.success('✅ ' + response.data.message);
    } catch (error) {
      toast.error('❌ Lỗi ép thức dậy: ' + (error.response?.data?.error || error.message));
    }
  };

  const handleFileChange = (e) => {
    setSelectedFiles(e.target.files); 
  };

  const handleAddToQueue = () => {
    addToQueue(selectedFiles, folderName);

    document.getElementById('fileInput').value = '';
    setSelectedFiles(null);
    setFolderName('');
  };

  const sanitizeFileName = (name) => {
    return name.replace(/[<>:"/\\|?*\x00-\x1F]/g, '').replace(/[\s\t\n]+/g, '_').replace(/^\.+|\.+$/g, ''); 
  };

  const handleDownloadFolder = async (targetFolderName, folderJobs) => {
    const completedJobs = folderJobs.filter(job => job.status === 'completed' && job.result);

    if (completedJobs.length === 0) {
      toast.error('Thư mục này chưa có tài liệu nào hoàn thành!');
      return;
    }

    if (!('showDirectoryPicker' in window)) {
      toast.error('⚠️ Trình duyệt của bạn không hỗ trợ File System Access API.');
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
      toast.success(`✅ Đã lưu ${successCount}/${completedJobs.length} tài liệu của thư mục [${targetFolderName}]!`);
    } catch (error) {
      if (error.name !== 'AbortError') toast.error('❌ Lỗi System I/O: ' + error.message);
    }
  };  

  const groupedJobs = useMemo(() => {
    return jobs.reduce((acc, job) => {
      const folder = job.folderName || 'Mặc định';
      if (!acc[folder]) acc[folder] = [];
      acc[folder].push(job);
      return acc;
    }, {});
  }, [jobs]);

  return (
    <div className="app-container">
      <Toaster position="top-right" reverseOrder={false} />

      <header className="header">
        <h1>🩺 StudyMed Translator</h1>
        <p>Hệ thống tự động dịch sách và tài liệu Y khoa (Multi-Batch Mode)</p>
      </header>

      <main className="main-content">
        
        {sysStatus.isHibernating && sysStatus.stats && (
          <div style={{ background: '#fff3cd', color: '#856404', border: '1px solid #ffeeba', padding: '15px 20px', borderRadius: '8px', marginBottom: '25px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '15px' }}>
              <div>
                <h3 style={{ margin: '0 0 10px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  🛑 Hệ Thống Đang Ngủ Đông (Circuit Breaker)
                </h3>
                <p style={{ margin: '5px 0' }}>Hệ thống đã nhận diện 10 tài liệu lỗi nghiêm trọng liên tiếp (Có thể do cạn kiệt API Quota). Đang tạm dừng xử lý để tránh bị khóa API.</p>
                <ul style={{ margin: '10px 0 0 0', paddingLeft: '20px' }}>
                  <li><strong>Bắt đầu ngủ lúc:</strong> {new Date(sysStatus.stats.startTime).toLocaleTimeString('vi-VN')}</li>
                  <li><strong>Dự kiến thức dậy tự động:</strong> {sysStatus.stats.wakeupTime} ({sysStatus.stats.sleepHours} tiếng)</li>
                  <li><strong>Số lần đã đánh thức nhưng vẫn thất bại:</strong> {sysStatus.stats.hibernationCount - 1} lần</li>
                </ul>
              </div>
              
              <button 
                onClick={handleForceWakeUp}
                style={{ 
                  background: '#dc3545', 
                  color: 'white', 
                  border: 'none', 
                  padding: '10px 20px', 
                  borderRadius: '6px', 
                  cursor: 'pointer', 
                  fontWeight: 'bold',
                  boxShadow: '0 2px 4px rgba(220,53,69,0.3)'
                }}
              >
                ⚡ Ép Thức Dậy Ngay
              </button>
            </div>
          </div>
        )}

        <div className="upload-section" style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <input 
              type="text" 
              placeholder="Tên thư mục (Vd: USMLE Step 1)" 
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
            onClick={handleAddToQueue} 
            disabled={!selectedFiles || selectedFiles.length === 0}
            className="upload-btn"
          >
            🚀 Thêm {selectedFiles ? selectedFiles.length : 0} file vào hàng đợi tải ngầm
          </button>
          
          {uploadQueue.length > 0 && (
             <div style={{ padding: '12px', background: '#d1ecf1', color: '#0c5460', border: '1px solid #bee5eb', borderRadius: '6px', fontWeight: 'bold' }}>
               ⏳ {uploadProgress || `Đang khởi tạo luồng mạng... Còn ${uploadQueue.length} file chờ.`}
             </div>
          )}
        </div>

        {/* --- ĐÃ CẬP NHẬT THEO YÊU CẦU BƯỚC 2 --- */}
        <div className="jobs-container">
          {Object.entries(groupedJobs).map(([folderName, folderJobs]) => (
            <FolderGroup 
              key={folderName}
              folderName={folderName}
              folderJobs={folderJobs}
              onDeleteJob={handleDeleteJob}
              onDownloadFolder={handleDownloadFolder}
              onBulkDelete={handleBulkDeleteFolder}
            />
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
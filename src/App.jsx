import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import ReactMarkdown from 'react-markdown';
import './App.css';

// Khai báo URL gốc. Khi lên Cloud, chỉ cần đổi dòng này thành Domain thực tế.
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
  const [folderName, setFolderName] = useState(''); 
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(null); 
  const [jobs, setJobs] = useState([]); 
  
  // [THÊM MỚI] State lưu trạng thái Ngủ đông của Backend
  const [sysStatus, setSysStatus] = useState({ isHibernating: false, stats: null });

  // 1. Phục hồi trạng thái khi F5 (Bao gồm cả trạng thái Hệ thống và Jobs)
  useEffect(() => {
    const fetchInitialData = async () => {
      try {
        // Lấy trạng thái hệ thống
        const statusRes = await axios.get(`${API_BASE_URL}/status`);
        setSysStatus(statusRes.data);

        // Lấy danh sách Jobs
        const jobsRes = await axios.get(`${API_BASE_URL}/jobs`);
        const formattedJobs = jobsRes.data.map(j => ({ ...j, logs: [], result: null }));
        setJobs(formattedJobs);
      } catch (error) {
        console.error("Lỗi khởi tạo dữ liệu:", error);
      }
    };
    fetchInitialData();
  }, []);

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

      // [THÊM MỚI] Lắng nghe sự kiện hệ thống ngủ đông / thức dậy
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

  const handleBulkDeleteFolder = async (targetFolderName, folderJobs) => {
    const jobsToDelete = folderJobs.filter(job => job.status === 'completed' || job.status === 'failed');
    
    if (jobsToDelete.length === 0) {
      alert('Không có tài liệu nào hoàn thành hoặc lỗi để dọn dẹp.');
      return;
    }

    const isConfirm = window.confirm(`Bạn có chắc chắn muốn XÓA GỌN ${jobsToDelete.length} tiến trình (đã xong/lỗi) khỏi thư mục [${targetFolderName}]?`);
    if (!isConfirm) return;

    const jobIds = jobsToDelete.map(job => job.jobId);

    try {
      // Gửi 1 Request duy nhất lên API mới
      await axios.post(`${API_BASE_URL}/bulk-delete`, { jobIds });
      
      // Dọn dẹp State UI nội bộ
      setJobs(prevJobs => prevJobs.filter(job => !jobIds.includes(job.jobId)));
    } catch (error) {
      alert('Lỗi khi dọn dẹp hàng loạt: ' + (error.response?.data?.error || error.message));
    }
  };

  const handleForceWakeUp = async () => {
    const isConfirm = window.confirm('⚡ Bạn có chắc chắn muốn ép hệ thống thức dậy và tiếp tục dịch ngay lập tức không?');
    if (!isConfirm) return;

    try {
      // Gọi API ép thức dậy đã tạo ở Backend
      const response = await axios.post(`${API_BASE_URL}/force-wakeup`);
      alert('✅ ' + response.data.message);
      
      // Lưu ý: Chúng ta không cần tự setSysStatus(false) ở đây
      // Vì Backend sẽ tự động bắn SSE event 'systemStatusChanged' về và App sẽ tự cập nhật.
    } catch (error) {
      alert('❌ Lỗi khi ép thức dậy: ' + (error.response?.data?.error || error.message));
    }
  };

  const handleFileChange = (e) => {
    setSelectedFiles(e.target.files); 
  };

  const handleUpload = async () => {
    if (!selectedFiles || selectedFiles.length === 0) return;

    const filesArray = Array.from(selectedFiles);
    const totalFiles = filesArray.length;
    
    // TỐI ƯU KIẾN TRÚC: Hạ Chunk Size xuống 2 để giảm Payload (Tối đa ~60MB/Request)
    // Ngăn chặn Cloud Load Balancer Timeout và giảm tải Disk I/O cho Multer
    const CHUNK_SIZE = 2; 
    const targetFolder = folderName.trim() || 'Mặc định';

    setIsUploading(true);

    try {
      let uploadedCount = 0; // Biến theo dõi số lượng file đã nạp lên DB thành công

      for (let i = 0; i < totalFiles; i += CHUNK_SIZE) {
        const chunk = filesArray.slice(i, i + CHUNK_SIZE);
        const formData = new FormData();
        
        formData.append('folderName', targetFolder);
        chunk.forEach(file => formData.append('files', file));

        // NÂNG CẤP UX: Sử dụng Axios onUploadProgress để track Network I/O
        const response = await axios.post(`${API_BASE_URL}`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
          onUploadProgress: (progressEvent) => {
            const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
            setUploadProgress(`Đang đẩy Data (Lô ${Math.floor(i/CHUNK_SIZE) + 1}): ${percentCompleted}% - Đã nạp: ${uploadedCount}/${totalFiles} files`);
          }
        });

        // Cập nhật lại số lượng sau khi request HTTP 200 OK
        uploadedCount += chunk.length;
        setUploadProgress(`Đang đồng bộ Queue: ${Math.min(uploadedCount, totalFiles)}/${totalFiles} files...`);

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
      alert('Lỗi tải file: Payload quá lớn dẫn đến Timeout hoặc kết nối mạng không ổn định. Vui lòng kiểm tra lại log Cloud.');
    } finally {
      setIsUploading(false);
      setUploadProgress(null);
    }
  };

  const sanitizeFileName = (name) => {
    return name.replace(/[<>:"/\\|?*\x00-\x1F]/g, '').replace(/[\s\t\n]+/g, '_').replace(/^\.+|\.+$/g, ''); 
  };

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
        
        {/* [THÊM MỚI] BANNER CẢNH BÁO NGỦ ĐÔNG CÓ NÚT ÉP THỨC DẬY */}
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
              
              {/* Nút bấm gọi API */}
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
              <div className="queue-header-actions" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid #007bff', paddingBottom: '10px', marginBottom: '20px' }}>
                <h3 className="queue-title" style={{ color: '#007bff', margin: 0 }}>
                  📁 {folderName} ({folderJobs.length} files)
                </h3>
                
                <div style={{ display: 'flex', gap: '10px' }}>
                  {folderJobs.some(j => j.status === 'completed' && j.result) && (
                    <button onClick={() => handleDownloadFolder(folderName, folderJobs)} className="download-all-btn" style={{ background: '#28a745', color: 'white', border: 'none', padding: '8px 15px', borderRadius: '5px', cursor: 'pointer' }}>
                      📥 Tải các file đã xong
                    </button>
                  )}
                  {folderJobs.some(j => j.status === 'completed' || j.status === 'failed') && (
                    <button onClick={() => handleBulkDeleteFolder(folderName, folderJobs)} className="cleanup-btn" style={{ background: '#dc3545', color: 'white', border: 'none', padding: '8px 15px', borderRadius: '5px', cursor: 'pointer' }}>
                      🧹 Dọn dẹp
                    </button>
                  )}
                </div>
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
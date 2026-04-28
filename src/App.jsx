import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import ReactMarkdown from 'react-markdown';
import './App.css';

// [THÊM MỚI] Khai báo URL gốc. Khi lên Cloud, chỉ cần đổi dòng này thành Domain thực tế.
const API_BASE_URL = 'https://med-translator-backend.onrender.com/api/translate';

// -------------------------------------------------------------
// COMPONENT CON: JOB CARD (Quản lý hiển thị cho từng file)
// -------------------------------------------------------------
const JobCard = ({ job, onDelete }) => { // Thêm prop onDelete
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
  const [isUploading, setIsUploading] = useState(false);
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

  // Xóa một tiến trình khỏi Database và giao diện
  const handleDeleteJob = async (jobId) => {
    const isConfirm = window.confirm('Bạn có chắc chắn muốn xóa tiến trình này không? Hành động này không thể hoàn tác.');
    if (!isConfirm) return;

    try {
      await axios.delete(`${API_BASE_URL}/jobs/${jobId}`);
      // Lọc bỏ job đã xóa khỏi state hiện tại để UI tự cập nhật lập tức
      setJobs(prevJobs => prevJobs.filter(job => job.jobId !== jobId));
    } catch (error) {
      alert('Lỗi khi xóa tiến trình: ' + (error.response?.data?.error || error.message));
    }
  };

  // Xử lý chọn file với giới hạn tối đa 100 file
  const handleFileChange = (e) => {
    const files = e.target.files;
    
    if (files.length > 100) {
      alert('⚠️ Giới hạn tối đa là 100 file cho mỗi lần nạp vào hàng đợi. Vui lòng chọn lại.');
      e.target.value = ''; // Reset input file trên giao diện
      setSelectedFiles(null);
      return;
    }

    setSelectedFiles(files);
  };

  // Ném file lên Server
  const handleUpload = async () => {
    if (!selectedFiles || selectedFiles.length === 0) return;

    const formData = new FormData();
    for (let i = 0; i < selectedFiles.length; i++) {
      formData.append('files', selectedFiles[i]);
    }

    setIsUploading(true);

    try {
      const response = await axios.post(`${API_BASE_URL}`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      const newJobs = response.data.jobs.map(j => ({ ...j, logs: [], result: null }));
      
      setJobs(prevJobs => {
        const existingIds = new Set(prevJobs.map(j => j.jobId));
        const uniqueNewJobs = newJobs.filter(j => !existingIds.has(j.jobId));
        return [...uniqueNewJobs, ...prevJobs]; 
      });

      document.getElementById('fileInput').value = '';
      setSelectedFiles(null);
    } catch (error) {
      alert('Lỗi tải file: ' + (error.response?.data?.error || error.message));
    } finally {
      setIsUploading(false);
    }
  };

  // Hàm làm sạch tên file để tránh lỗi "Name is not allowed" của OS
  const sanitizeFileName = (name) => {
    return name
      // Xóa các ký tự cấm trên Windows/macOS/Linux
      .replace(/[<>:"/\\|?*\x00-\x1F]/g, '')
      // Thay thế khoảng trắng và các ký tự đặc biệt khác bằng dấu gạch dưới (tuỳ chọn, để tên file gọn hơn)
      .replace(/[\s\t\n]+/g, '_') 
      // Xóa dấu chấm ở đầu/cuối file
      .replace(/^\.+|\.+$/g, ''); 
  };

  // Lấy tất cả file đã dịch xong và ghi trực tiếp vào 1 thư mục do user chọn
  const handleDownloadAll = async () => {
    const completedJobs = jobs.filter(job => job.status === 'completed' && job.result);

    if (completedJobs.length === 0) {
      alert('Chưa có tài liệu nào hoàn thành để tải xuống!');
      return;
    }

    if (!('showDirectoryPicker' in window)) {
      alert('⚠️ Trình duyệt của bạn không hỗ trợ File System Access API (Khuyên dùng Chrome/Edge).\nVui lòng tắt chế độ "Hỏi vị trí lưu file" trong cài đặt trình duyệt để dùng tính năng tải hàng loạt gốc.');
      return;
    }

    try {
      // 1. Kích hoạt hộp thoại của OS yêu cầu người dùng chọn 1 thư mục duy nhất
      const directoryHandle = await window.showDirectoryPicker({
        mode: 'readwrite' 
      });

      let successCount = 0;

      // 2. Lặp qua danh sách file đã dịch và ghi thẳng vào thư mục vừa chọn
      for (const [index, job] of completedJobs.entries()) {
        try {
          // Lấy tên gốc hoặc tạo tên tạm nếu không có
          let rawName = job.originalName || job.fileName || `TaiLieu_${index + 1}`;
          
          // Cắt bỏ phần mở rộng cũ (ví dụ .pdf)
          const baseName = rawName.replace(/\.[^/.]+$/, "");
          
          // Dọn dẹp tên file để loại bỏ ký tự cấm
          const cleanName = sanitizeFileName(baseName);
          
          // Nối thêm đuôi _vi.md
          const finalFileName = `${cleanName || `Doc_${index}`}_vi.md`;

          // Tạo file handle
          const fileHandle = await directoryHandle.getFileHandle(finalFileName, { create: true });
          
          // Khởi tạo luồng ghi
          const writable = await fileHandle.createWritable();
          
          // Ghi nội dung Markdown
          await writable.write(job.result);
          
          // Đóng luồng
          await writable.close();
          successCount++;

        } catch (fileError) {
          console.error(`Lỗi khi ghi file ${job.originalName}:`, fileError);
          // Không dừng toàn bộ tiến trình nếu 1 file lỗi, cứ tiếp tục với file sau
        }
      }

      alert(`✅ Đã lưu thành công ${successCount}/${completedJobs.length} tài liệu vào thư mục bạn chọn!`);

    } catch (error) {
      if (error.name !== 'AbortError') {
        console.error('❌ Lỗi System I/O khi mở thư mục:', error);
        alert('Lỗi khi mở thư mục lưu: ' + error.message);
      }
    }
  };  

  return (
    <div className="app-container">
      <header className="header">
        <h1>🩺 StudyMed Translator</h1>
        <p>Hệ thống tự động dịch sách và tài liệu Y khoa</p>
      </header>

      <main className="main-content">
        <div className="upload-section">
          <input 
            id="fileInput"
            type="file" 
            accept="application/pdf" 
            multiple 
            onChange={handleFileChange} 
            className="file-input"
          />
          <button 
            onClick={handleUpload} 
            disabled={!selectedFiles || selectedFiles.length === 0 || isUploading}
            className="upload-btn"
          >
            {isUploading 
              ? '⏳ Đang nạp Queue...' 
              : `🚀 Thêm ${selectedFiles ? selectedFiles.length : ''} file vào hàng đợi`}
          </button>
        </div>

        <div className="jobs-container">
          {jobs.length > 0 && (
            <div className="queue-header-actions">
              <h3 className="queue-title">Tiến trình làm việc ({jobs.length} files)</h3>
              {jobs.some(j => j.status === 'completed' && j.result) && (
                <button onClick={handleDownloadAll} className="download-all-btn">
                  📥 Tải tất cả Markdown
                </button>
              )}
            </div>
          )}
          
          <div className="masonry-grid-fallback">
            {jobs.map(job => (
              <JobCard key={job.jobId} job={job} onDelete={handleDeleteJob} />
            ))}
          </div>

          {jobs.length === 0 && (
            <div className="empty-state">
              <div className="empty-wash">
                Chưa có tài liệu nào trong hàng đợi.
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

export default App;
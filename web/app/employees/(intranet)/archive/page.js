'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useUserRole } from '@/hooks/useUserRole';
import styles from './archive.module.css';

export default function ArchivePage() {
    const { role, loading: authLoading } = useUserRole();
    const router = useRouter();
    const [path, setPath] = useState('/');
    const [files, setFiles] = useState([]);
    const [loading, setLoading] = useState(true);
    const [uploading, setUploading] = useState(false);
    const [viewMode, setViewMode] = useState('list'); // 'list' or 'grid'

    useEffect(() => {
        if (!authLoading && !role) {
            router.replace('/login?next=/employees/archive');
        }
    }, [role, authLoading, router]);

    const fetchFiles = useCallback(async (currentPath) => {
        if (!role || role === 'visitor') return;
        setLoading(true);
        try {
            console.log('Fetching NAS files for:', currentPath);
            const res = await fetch(`/api/nas/files?path=${encodeURIComponent(currentPath)}`);
            if (!res.ok) {
                const errorData = await res.json();
                throw new Error(errorData.details || 'Failed to fetch files');
            }
            const data = await res.json();
            setFiles(data.files || []);
        } catch (error) {
            console.error('NAS Fetch Error:', error);
        } finally {
            setLoading(false);
        }
    }, [role]);

    useEffect(() => {
        fetchFiles(path);
    }, [path, fetchFiles]);

    const handleUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        setUploading(true);
        const formData = new FormData();
        formData.append('file', file);
        formData.append('path', path);

        try {
            const res = await fetch('/api/nas/files', {
                method: 'POST',
                body: formData,
            });
            if (!res.ok) throw new Error('Upload failed');
            await fetchFiles(path);
        } catch (error) {
            console.error(error);
            alert('업로드 실패');
        } finally {
            setUploading(false);
            e.target.value = ''; // Reset input
        }
    };

    const handleCreateFolder = async () => {
        const folderName = prompt('새 폴더 이름:');
        if (!folderName) return;

        try {
            const newPath = path === '/' ? `/${folderName}` : `${path}/${folderName}`;
            const res = await fetch('/api/nas/files', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type: 'mkdir', path: newPath }),
            });
            if (!res.ok) throw new Error('Folder creation failed');
            await fetchFiles(path);
        } catch (error) {
            console.error(error);
            alert('폴더 생성 실패');
        }
    };

    const handleDelete = async (fileName) => {
        if (!confirm(`${fileName}을(를) 삭제하시겠습니까?`)) return;

        const filePath = path === '/' ? `/${fileName}` : `${path}/${fileName}`;
        try {
            const res = await fetch(`/api/nas/files?path=${encodeURIComponent(filePath)}`, {
                method: 'DELETE',
            });
            if (!res.ok) throw new Error('Delete failed');
            await fetchFiles(path);
        } catch (error) {
            console.error(error);
            alert('삭제 실패');
        }
    };

    const handleNavigate = (fileName) => {
        const newPath = path === '/' ? `/${fileName}` : `${path}/${fileName}`;
        setPath(newPath);
    };

    const handleUp = () => {
        if (path === '/') return;
        const parentPath = path.substring(0, path.lastIndexOf('/')) || '/';
        setPath(parentPath);
    };

    const formatSize = (bytes) => {
        if (!bytes || bytes === 0) return '-';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    };

    const isImage = (name) => {
        const ext = name.split('.').pop().toLowerCase();
        return ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext);
    };

    if (authLoading) return <div style={{ padding: '40px' }}>권한 확인 중...</div>;
    if (!role) return null;

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <h1 className={styles.title}>자료실 (NAS)</h1>
                <div className={styles.controls}>
                    <div className={styles.viewToggle}>
                        <button
                            onClick={() => setViewMode('list')}
                            className={`${styles.viewBtn} ${viewMode === 'list' ? styles.activeView : ''}`}
                            title="자세히 보기"
                        >
                            📊 자세히
                        </button>
                        <button
                            onClick={() => setViewMode('grid')}
                            className={`${styles.viewBtn} ${viewMode === 'grid' ? styles.activeView : ''}`}
                            title="큰 아이콘"
                        >
                            🖼️ 큰 아이콘
                        </button>
                    </div>
                    <button onClick={handleCreateFolder} className={styles.btnSecondary}>새 폴더</button>
                    <label className={styles.btnPrimary}>
                        {uploading ? '업로드 중...' : '파일 업로드'}
                        <input type="file" onChange={handleUpload} style={{ display: 'none' }} disabled={uploading} />
                    </label>
                </div>
            </div>

            <div className={styles.breadcrumbs}>
                <button onClick={handleUp} disabled={path === '/'} className={styles.upBtn}>
                    ↑ 상위 폴더
                </button>
                <span className={styles.currentPath}>{path}</span>
            </div>

            {loading ? (
                <div className={styles.loading}>Loading...</div>
            ) : (
                <div className={viewMode === 'list' ? styles.listView : styles.fileGrid}>
                    {viewMode === 'list' ? (
                        <table className={styles.table}>
                            <thead>
                                <tr>
                                    <th>이름</th>
                                    <th>수정일</th>
                                    <th>유형</th>
                                    <th>크기</th>
                                    <th></th>
                                </tr>
                            </thead>
                            <tbody>
                                {files.map((file) => (
                                    <tr key={file.name}>
                                        <td
                                            className={styles.fileNameCell}
                                            onClick={() => file.type === 'directory' ? handleNavigate(file.name) : window.open(`/api/nas/preview?path=${encodeURIComponent(file.path)}`)}
                                        >
                                            <span className={styles.fileIcon}>{file.type === 'directory' ? '📁' : '📄'}</span>
                                            {file.name}
                                        </td>
                                        <td>{new Date(file.lastMod).toLocaleDateString()}</td>
                                        <td>{file.type === 'directory' ? '폴더' : file.name.split('.').pop().toUpperCase() + ' 파일'}</td>
                                        <td>{formatSize(file.size)}</td>
                                        <td>
                                            <button onClick={() => handleDelete(file.name)} className={styles.inlineDeleteBtn}>×</button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    ) : (
                        files.map((file) => (
                            <div key={file.name} className={styles.fileCard}>
                                <div
                                    className={styles.icon}
                                    onClick={() => file.type === 'directory' ? handleNavigate(file.name) : window.open(`/api/nas/preview?path=${encodeURIComponent(file.path)}`)}
                                >
                                    {isImage(file.name) ? (
                                        <img
                                            src={`/api/nas/preview?path=${encodeURIComponent(file.path)}`}
                                            alt={file.name}
                                            className={styles.thumbnail}
                                            loading="lazy"
                                        />
                                    ) : (
                                        file.type === 'directory' ? '📁' : '📄'
                                    )}
                                </div>
                                <div className={styles.info}>
                                    <div className={styles.name} title={file.name}>{file.name}</div>
                                    <div className={styles.meta}>
                                        <span className={styles.date}>{new Date(file.lastMod).toLocaleDateString()}</span>
                                        {file.size > 0 && <span>{formatSize(file.size)}</span>}
                                    </div>
                                </div>
                                <button
                                    onClick={() => handleDelete(file.name)}
                                    className={styles.deleteBtn}
                                    title="삭제"
                                >
                                    ×
                                </button>
                            </div>
                        ))
                    )}
                    {files.length === 0 && <div className={styles.empty}>폴더가 비어있습니다.</div>}
                </div>
            )}
        </div>
    );
}

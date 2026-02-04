'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useUserRole } from '@/hooks/useUserRole';
import styles from './archive.module.css';

export default function ArchiveBrowser() {
    const { role, loading: authLoading } = useUserRole();
    const router = useRouter();
    const searchParams = useSearchParams();
    const path = searchParams.get('path') || '/';
    const [files, setFiles] = useState([]);
    const [loading, setLoading] = useState(true);
    const [uploading, setUploading] = useState(false);
    const [viewMode, setViewMode] = useState('list'); // 'list' or 'grid'
    const [sortConfig, setSortConfig] = useState({ key: 'name', direction: 'asc' });
    const [contextMenu, setContextMenu] = useState(null); // { x, y, file }
    const [deleteModal, setDeleteModal] = useState({ show: false, fileName: '' });
    const [clipboard, setClipboard] = useState(null); // { type: 'copy', path, name }
    const [error, setError] = useState(null);
    const [downloading, setDownloading] = useState(new Set()); // Track downloading files

    // Multi-selection state
    const [selectionMode, setSelectionMode] = useState(false);
    const [selectedPaths, setSelectedPaths] = useState(new Set());
    const longPressTimer = useRef(null);
    const preventClick = useRef(false);

    useEffect(() => {
        if (!authLoading && !role) {
            router.replace('/login?next=/employees/archive');
        }
    }, [role, authLoading, router]);

    const fetchFiles = useCallback(async (currentPath) => {
        if (!role || role === 'visitor') return;
        setLoading(true);
        setError(null);
        try {
            const res = await fetch(`/api/nas/files?path=${encodeURIComponent(currentPath)}`);
            if (!res.ok) {
                const errorData = await res.json();
                throw new Error(errorData.details || 'Failed to fetch files');
            }
            const data = await res.json();
            setFiles(data.files || []);
            setSelectedPaths(new Set()); // Reset selection on path change
            setSelectionMode(false);
        } catch (error) {
            console.error('NAS Fetch Error:', error);
            setError(error.message);
        } finally {
            setLoading(false);
        }
    }, [role]);

    useEffect(() => {
        fetchFiles(path);
    }, [path, fetchFiles]);

    const handleUpload = async (fileList) => {
        if (!fileList || fileList.length === 0) return;
        setUploading(true);

        try {
            for (const file of Array.from(fileList)) {
                const formData = new FormData();
                formData.append('file', file);
                formData.append('path', path);
                // WebDAV Upload via API
                const res = await fetch('/api/nas/files', { method: 'POST', body: formData });
                if (!res.ok) throw new Error(`Upload failed for ${file.name}`);
            }
            await fetchFiles(path);
        } catch (error) {
            console.error(error);
            alert('업로드 실패');
        } finally {
            setUploading(false);
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

    const handleCopy = async (file) => {
        let newName;
        if (file.type === 'directory') newName = `${file.name}(1)`;
        else {
            const lastDot = file.name.lastIndexOf('.');
            if (lastDot === -1) newName = `${file.name}(1)`;
            else newName = `${file.name.substring(0, lastDot)}(1)${file.name.substring(lastDot)}`;
        }
        const from = file.path;
        const to = path === '/' ? `/${newName}` : `${path}/${newName}`;
        try {
            const res = await fetch('/api/nas/files', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type: 'copy', from, to }),
            });
            if (!res.ok) {
                const errorData = await res.json();
                throw new Error(errorData.error || 'Duplicate failed');
            }
            await fetchFiles(path);
            setTimeout(() => handleRename({ path: to, name: newName, type: file.type }), 500);
        } catch (error) {
            console.error(error);
            alert(`복제 실패: ${error.message}`);
        }
    };

    const handlePaste = async () => {
        if (!clipboard) return;
        const to = path === '/' ? `/${clipboard.name}` : `${path}/${clipboard.name}`;
        let finalTo = to;
        const exists = files.some(f => f.name === clipboard.name);
        if (exists) {
            const lastDot = clipboard.name.lastIndexOf('.');
            if (lastDot === -1 || clipboard.fileType === 'directory') finalTo = `${to}(1)`;
            else finalTo = `${to.substring(0, to.lastIndexOf('.'))}(1)${to.substring(to.lastIndexOf('.'))}`;
        }
        try {
            const res = await fetch('/api/nas/files', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type: 'copy', from: clipboard.path, to: finalTo }),
            });
            if (!res.ok) {
                const errorData = await res.json();
                throw new Error(errorData.error || 'Paste failed');
            }
            await fetchFiles(path);
            setClipboard(null);
        } catch (error) {
            console.error(error);
            alert(`붙여넣기 실패: ${error.message}`);
        }
    };

    const handleRename = async (file) => {
        const newName = prompt('새 이름을 입력하세요:', file.name);
        if (!newName || newName === file.name) return;
        const from = file.path;
        const to = path === '/' ? `/${newName}` : `${path}/${newName}`;
        try {
            const res = await fetch('/api/nas/files', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ from, to }),
            });
            if (!res.ok) throw new Error('Rename failed');
            await fetchFiles(path);
        } catch (error) {
            console.error(error);
            alert('이름 변경 실패');
        }
    };

    // Background streaming download function
    const handleDownloadFile = async (file) => {
        const filePath = file.path;
        const fileName = file.name;

        // Add to downloading set
        setDownloading(prev => new Set(prev).add(filePath));

        try {
            // Fetch file as stream
            const response = await fetch(`/api/nas/preview?path=${encodeURIComponent(filePath)}&download=true`);

            if (!response.ok) {
                throw new Error('Download failed');
            }

            // Convert to blob
            const blob = await response.blob();

            // Create download link
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = fileName;
            document.body.appendChild(a);
            a.click();

            // Cleanup
            setTimeout(() => {
                document.body.removeChild(a);
                window.URL.revokeObjectURL(url);
            }, 100);

        } catch (error) {
            console.error('Download error:', error);
            alert(`다운로드 실패: ${fileName}`);
        } finally {
            // Remove from downloading set
            setDownloading(prev => {
                const newSet = new Set(prev);
                newSet.delete(filePath);
                return newSet;
            });
        }
    };

    const handleDelete = async (fileName) => {
        const { can_delete, role: userRole } = await fetch('/api/nas/files/permissions').then(r => r.json()).catch(() => ({}));

        if (!can_delete && userRole !== 'admin') {
            setDeleteModal({ show: true, fileName });
            return;
        }

        if (!confirm(`${fileName}을(를) 삭제하시겠습니까?`)) return;
        const filePath = path === '/' ? `/${fileName}` : `${path}/${fileName}`;
        try {
            const res = await fetch(`/api/nas/files?path=${encodeURIComponent(filePath)}`, { method: 'DELETE' });
            if (!res.ok) throw new Error('Delete failed');
            await fetchFiles(path);
        } catch (error) {
            console.error(error);
            alert('삭제 실패');
        }
    };

    const handleZipDownload = async () => {
        if (selectedPaths.size === 0) return;
        try {
            const res = await fetch('/api/nas/zip', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ paths: Array.from(selectedPaths) }),
            });
            if (!res.ok) throw new Error('Zip failed');

            const blob = await res.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `nas_selection_${new Date().getTime()}.zip`;
            document.body.appendChild(a);
            a.click();
            a.remove();
        } catch (error) {
            console.error(error);
            alert('압축 다운로드 실패');
        }
    };

    // Selection Handling
    const toggleSelect = (filePath) => {
        const newSelection = new Set(selectedPaths);
        if (newSelection.has(filePath)) newSelection.delete(filePath);
        else newSelection.add(filePath);
        setSelectedPaths(newSelection);

        // If selection becomes empty, exit selection mode
        if (newSelection.size === 0) {
            setSelectionMode(false);
        }
    };

    const handleLongPress = (file) => {
        preventClick.current = true; // Mark that a long press happened
        if (!selectionMode) {
            setSelectionMode(true);
            const newSelection = new Set([file.path]);
            setSelectedPaths(newSelection);
        } else {
            toggleSelect(file.path);
        }
    };

    const startLongPress = (file) => {
        preventClick.current = false;
        longPressTimer.current = setTimeout(() => handleLongPress(file), 700);
    };

    const clearLongPress = () => {
        if (longPressTimer.current) clearTimeout(longPressTimer.current);
    };

    // Drag and Drop Handling
    const handleDragStart = (e, file) => {
        e.dataTransfer.setData('sourcePath', file.path);
        e.dataTransfer.setData('sourceName', file.name);
    };

    const handleDragOver = (e) => e.preventDefault();

    const handleDropInternal = async (e, targetFolder) => {
        e.preventDefault();
        const sourcePath = e.dataTransfer.getData('sourcePath');
        const sourceName = e.dataTransfer.getData('sourceName');
        if (!sourcePath || !targetFolder || sourcePath === targetFolder.path) return;

        const newPath = `${targetFolder.path}/${sourceName}`.replace(/\/+/g, '/');
        try {
            const res = await fetch('/api/nas/files', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ from: sourcePath, to: newPath }),
            });
            if (!res.ok) throw new Error('Move failed');
            await fetchFiles(path);
        } catch (error) {
            console.error(error);
            alert('이동 실패');
        }
    };

    const handleDropExternal = async (e) => {
        e.preventDefault();
        const droppedFiles = e.dataTransfer.files;
        if (droppedFiles.length > 0) handleUpload(droppedFiles);
    };

    const handleContextMenu = (e, file) => {
        if (e) {
            e.preventDefault();
            e.stopPropagation();
        }
        setContextMenu({
            x: e ? e.clientX : 0,
            y: e ? e.clientY : 0,
            file
        });
    };

    // Close menu on click or scroll
    useEffect(() => {
        const closeMenu = () => setContextMenu(null);
        window.addEventListener('click', closeMenu);
        window.addEventListener('scroll', closeMenu, true);
        return () => {
            window.removeEventListener('click', closeMenu);
            window.removeEventListener('scroll', closeMenu, true);
        };
    }, []);

    const handleNavigate = (fileName) => {
        const newPath = path === '/' ? `/${fileName}` : `${path}/${fileName}`;
        router.push(`/employees/archive?path=${encodeURIComponent(newPath)}`);
    };

    const handleUp = () => {
        if (path === '/') return;
        const parentPath = path.substring(0, path.lastIndexOf('/')) || '/';
        router.push(`/employees/archive?path=${encodeURIComponent(parentPath)}`);
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

    const sortedFiles = [...files].sort((a, b) => {
        if (a.type === 'directory' && b.type !== 'directory') return -1;
        if (a.type !== 'directory' && b.type === 'directory') return 1;
        const { key, direction } = sortConfig;
        let comp = 0;
        if (key === 'name') comp = a.name.localeCompare(b.name, 'ko');
        else if (key === 'size') comp = (a.size || 0) - (b.size || 0);
        else if (key === 'date') comp = new Date(a.lastMod) - new Date(b.lastMod);
        return direction === 'asc' ? comp : -comp;
    });

    if (authLoading || loading) {
        return (
            <div className={styles.loadingContainer}>
                <div style={{ marginBottom: '15px', fontWeight: '800', color: '#1e293b', fontSize: '1.2rem' }}>자료실 데이터 로딩 중...</div>
                <div style={{ fontSize: '0.95rem', color: '#64748b', lineHeight: '1.6' }}>
                    자료실은 NAS 내부 서버와의 연결로 로딩 속도가 느립니다.<br />
                    잠시만 기다려 주세요. 📂
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className={styles.loadingContainer}>
                <div style={{ color: '#e53e3e', marginBottom: '15px', fontWeight: 'bold' }}>
                    데이터를 불러오지 못했습니다.
                </div>
                <div style={{ marginBottom: '20px', fontSize: '0.9rem', color: '#666' }}>
                    {error}
                </div>
                <button
                    onClick={() => fetchFiles(path)}
                    style={{
                        padding: '10px 20px',
                        background: '#3182ce',
                        color: 'white',
                        border: 'none',
                        borderRadius: '8px',
                        cursor: 'pointer'
                    }}
                >
                    다시 시도
                </button>
            </div>
        );
    }

    if (!role) return null;

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <div className={styles.titleArea}>
                    <h1 className={styles.title}>자료실 (NAS)</h1>
                    <div className={styles.pathBadge}>{path}</div>
                </div>
                <div className={styles.controls}>
                    {selectionMode ? (
                        <div className={styles.selectionToolbar}>
                            <span className={styles.selectionCount}>{selectedPaths.size}개 선택됨</span>
                            <button onClick={handleZipDownload} className={styles.btnZip}>📦 압축 다운로드</button>
                            <button onClick={() => { setSelectionMode(false); setSelectedPaths(new Set()); }} className={styles.btnCancel}>취소</button>
                        </div>
                    ) : (
                        <>
                            <div className={styles.viewToggle}>
                                <button onClick={() => setViewMode('list')} className={`${styles.viewBtn} ${viewMode === 'list' ? styles.activeView : ''}`}>📊 리스트</button>
                                <button onClick={() => setViewMode('grid')} className={`${styles.viewBtn} ${viewMode === 'grid' ? styles.activeView : ''}`}>🖼️ 아이콘</button>
                            </div>
                            <button onClick={handleCreateFolder} className={styles.btnSecondary}>새 폴더</button>
                            <label className={styles.btnPrimary}>
                                {uploading ? '업로드 중...' : '파일 업로드'}
                                <input type="file" multiple onChange={(e) => handleUpload(e.target.files)} style={{ display: 'none' }} disabled={uploading} />
                            </label>
                        </>
                    )}
                </div>
            </div>

            <div className={styles.breadcrumbs}>
                <button onClick={handleUp} disabled={path === '/'} className={styles.upBtn}>↑ 상위</button>
                <div className={styles.pathSteps}>
                    {path.split('/').filter(p => p).map((part, i, arr) => (
                        <span key={i} onClick={() => router.push(`/employees/archive?path=${encodeURIComponent('/' + arr.slice(0, i + 1).join('/'))}`)} className={styles.pathPart}>{part}</span>
                    ))}
                </div>
            </div>

            <div
                className={styles.mainArea}
                onContextMenu={(e) => handleContextMenu(e, null)}
                onDragOver={handleDragOver}
                onDrop={handleDropExternal}
            >
                {viewMode === 'list' ? (
                    <table className={styles.table}>
                        <thead>
                            <tr>
                                {selectionMode && <th style={{ width: '40px' }}></th>}
                                <th onClick={() => setSortConfig({ key: 'name', direction: sortConfig.direction === 'asc' ? 'desc' : 'asc' })}>이름</th>
                                <th className={styles.hideMobile}>날짜</th>
                                <th className={styles.hideMobile}>크기</th>
                                <th style={{ width: '60px' }}></th>
                            </tr>
                        </thead>
                        <tbody>
                            {sortedFiles.map((file) => (
                                <tr
                                    key={file.path}
                                    className={`${styles.tr} ${selectedPaths.has(file.path) ? styles.selectedRow : ''}`}
                                    draggable={!selectionMode}
                                    onDragStart={(e) => handleDragStart(e, file)}
                                    onDragOver={file.type === 'directory' ? handleDragOver : undefined}
                                    onDrop={file.type === 'directory' ? (e) => handleDropInternal(e, file) : undefined}
                                    onMouseDown={() => startLongPress(file)}
                                    onMouseUp={clearLongPress}
                                    onMouseLeave={clearLongPress}
                                    onTouchStart={() => startLongPress(file)}
                                    onTouchEnd={clearLongPress}
                                    onContextMenu={(e) => handleContextMenu(e, file)}
                                >
                                    {selectionMode && (
                                        <td>
                                            <input type="checkbox" checked={selectedPaths.has(file.path)} onChange={() => toggleSelect(file.path)} />
                                        </td>
                                    )}
                                    <td className={styles.nameCell} onClick={() => {
                                        if (preventClick.current) {
                                            preventClick.current = false;
                                            return;
                                        }
                                        if (selectionMode) toggleSelect(file.path);
                                        else if (file.type === 'directory') handleNavigate(file.name);
                                        else if (isImage(file.name)) {
                                            // Images: open preview in new tab
                                            window.open(`/api/nas/preview?path=${encodeURIComponent(file.path)}`);
                                        } else {
                                            // Other files: background streaming download
                                            handleDownloadFile(file);
                                        }
                                    }}>
                                        <span className={styles.icon}>{file.type === 'directory' ? '📁' : '📄'}</span>
                                        {file.name}
                                        {downloading.has(file.path) && <span style={{ marginLeft: '8px', color: '#3182ce', fontSize: '0.85rem' }}>⬇️ 다운로드 중...</span>}
                                    </td>
                                    <td className={styles.hideMobile}>{new Date(file.lastMod).toLocaleDateString()}</td>
                                    <td className={styles.hideMobile}>{formatSize(file.size)}</td>
                                    <td>
                                        <button
                                            className={styles.moreBtn}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleContextMenu(e, file);
                                            }}
                                        >
                                            ⋮
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                ) : (
                    <div className={styles.grid}>
                        {sortedFiles.map((file) => (
                            <div
                                key={file.path}
                                className={`${styles.card} ${selectedPaths.has(file.path) ? styles.selectedCard : ''}`}
                                draggable={!selectionMode}
                                onDragStart={(e) => handleDragStart(e, file)}
                                onDragOver={file.type === 'directory' ? handleDragOver : undefined}
                                onDrop={file.type === 'directory' ? (e) => handleDropInternal(e, file) : undefined}
                                onMouseDown={() => startLongPress(file)}
                                onMouseUp={clearLongPress}
                                onMouseLeave={clearLongPress}
                                onTouchStart={() => startLongPress(file)}
                                onTouchEnd={clearLongPress}
                                onContextMenu={(e) => handleContextMenu(e, file)}
                                onClick={() => {
                                    if (preventClick.current) {
                                        preventClick.current = false;
                                        return;
                                    }
                                    if (selectionMode) toggleSelect(file.path);
                                    else if (file.type === 'directory') handleNavigate(file.name);
                                    else if (isImage(file.name)) {
                                        // Images: open preview in new tab
                                        window.open(`/api/nas/preview?path=${encodeURIComponent(file.path)}`);
                                    } else {
                                        // Other files: background streaming download
                                        handleDownloadFile(file);
                                    }
                                }}
                            >
                                {selectionMode && <input type="checkbox" className={styles.cardCheck} checked={selectedPaths.has(file.path)} readOnly />}
                                {downloading.has(file.path) && (
                                    <div style={{ position: 'absolute', top: '8px', right: '8px', background: '#3182ce', color: 'white', padding: '4px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 'bold' }}>
                                        ⬇️ 다운로드 중
                                    </div>
                                )}
                                <button
                                    className={styles.cardMoreBtn}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        handleContextMenu(e, file);
                                    }}
                                >
                                    ⋮
                                </button>
                                <div className={styles.cardIcon}>
                                    {isImage(file.name) ? <img src={`/api/nas/preview?path=${encodeURIComponent(file.path)}`} className={styles.thumb} /> : (file.type === 'directory' ? '📁' : '📄')}
                                </div>
                                <div className={styles.cardName}>{file.name}</div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {contextMenu && (
                <>
                    <div className={styles.contextOverlay} onClick={() => setContextMenu(null)} />
                    <div className={styles.contextMenu} style={{ top: contextMenu.y, left: contextMenu.x }} onClick={() => setContextMenu(null)}>
                        {contextMenu.file ? (
                            <>
                                <div className={styles.contextItem} onClick={() => {
                                    if (contextMenu.file.type === 'directory') handleNavigate(contextMenu.file.name);
                                    else window.open(`/api/nas/preview?path=${encodeURIComponent(contextMenu.file.path)}`);
                                }}>
                                    📁 {contextMenu.file.type === 'directory' ? '열기' : '미리보기'}
                                </div>

                                {/* Selection Mode Context Actions */}
                                {selectionMode && selectedPaths.size > 0 ? (
                                    <>
                                        <div className={styles.contextItem} style={{ background: '#3182ce', color: 'white', fontWeight: 'bold' }} onClick={handleZipDownload}>
                                            📦 선택된 {selectedPaths.size}개 항목 압축 다운로드
                                        </div>
                                        <div className={styles.contextItem} onClick={() => { setSelectionMode(false); setSelectedPaths(new Set()); }}>
                                            🚫 선택 모드 해제
                                        </div>
                                    </>
                                ) : (
                                    <>
                                        {contextMenu.file.type !== 'directory' && (
                                            <div className={styles.contextItem} onClick={() => handleDownloadFile(contextMenu.file)}>
                                                💾 이 파일 다운로드
                                            </div>
                                        )}
                                        <div className={styles.contextItem} onClick={() => setSelectionMode(true)}>
                                            ✅ 다중 선택 모드 시작
                                        </div>
                                    </>
                                )}

                                <div className={styles.contextDivider}></div>
                                <div className={styles.contextItem} onClick={() => handleCopy(contextMenu.file)}>✨ 즉시 사본 생성 (복제)</div>
                                <div className={styles.contextItem} onClick={() => setClipboard({ type: 'copy', path: contextMenu.file.path, name: contextMenu.file.name, fileType: contextMenu.file.type })}>📋 항목 복리 (붙여넣기용)</div>
                                {clipboard && <div className={styles.contextItem} onClick={handlePaste}>📥 여기에 붙여넣기</div>}
                                <div className={styles.contextItem} onClick={() => handleRename(contextMenu.file)}>✏️ 이름 바꾸기</div>
                                <div className={styles.contextDivider}></div>
                                <div className={`${styles.contextItem} ${styles.danger}`} onClick={() => handleDelete(contextMenu.file.name)}>🗑️ 삭제하기</div>
                            </>
                        ) : (
                            <>
                                {selectionMode && selectedPaths.size > 0 && (
                                    <div className={styles.contextItem} style={{ background: '#3182ce', color: 'white', fontWeight: 'bold' }} onClick={handleZipDownload}>
                                        📦 선택된 {selectedPaths.size}개 항목 압축 다운로드
                                    </div>
                                )}
                                <div className={`${styles.contextItem} ${!clipboard ? styles.disabled : ''}`} onClick={handlePaste}>📥 붙여넣기 (Paste)</div>
                                <div className={styles.contextItem} onClick={() => handleCreateFolder()}>📁 새 폴더 만들기</div>
                                {selectionMode && (
                                    <div className={styles.contextItem} onClick={() => { setSelectionMode(false); setSelectedPaths(new Set()); }}>🚫 선택 모드 해제</div>
                                )}
                            </>
                        )}
                    </div>
                </>
            )}
            {deleteModal.show && (
                <div className={styles.modalOverlay} onClick={() => setDeleteModal({ show: false, fileName: '' })}>
                    <div className={styles.modal} onClick={e => e.stopPropagation()}>
                        <div style={{ fontSize: '3rem', marginBottom: '20px' }}>⚠️</div>
                        <h2 className={styles.modalTitle}>삭제 불가 안내</h2>
                        <p className={styles.modalDesc}>
                            보안 및 데이터 유실 방지 정책에 따라<br />
                            <strong>웹 자료실에서는 삭제가 불가합니다.</strong><br /><br />
                            삭제 처리가 필요한 경우,<br />
                            <strong>사무실 내 PC(탐색기)</strong>를 이용해 주시기 바랍니다.
                        </p>
                        <button className={styles.modalBtn} onClick={() => setDeleteModal({ show: false, fileName: '' })}>
                            확인했습니다
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

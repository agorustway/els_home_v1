'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { useUserRole } from '@/hooks/useUserRole';
import styles from '../../intranet.module.css';

export default function WorkSiteDetailPage() {
    const { id } = useParams();
    const { role, loading: authLoading } = useUserRole();
    const router = useRouter();
    const [item, setItem] = useState(null);
    const [showAttachments, setShowAttachments] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!authLoading && !role) router.replace('/login?next=/employees/work-sites/' + id);
    }, [role, authLoading, router, id]);

    useEffect(() => {
        if (role && id) {
            fetch('/api/work-sites/' + id)
                .then((res) => res.json())
                .then((data) => setItem(data.item))
                .catch(console.error)
                .finally(() => setLoading(false));
        }
    }, [role, id]);

    const handleFileUpload = async (e) => {
        const files = e.target.files;
        if (!files || files.length === 0) return;

        setUploading(true);
        try {
            const newAttachments = [...(item.attachments || [])];

            for (const file of Array.from(files)) {
                const key = `WorkSites/${id}/${Date.now()}_${file.name}`;
                const formData = new FormData();
                formData.append('key', key);
                formData.append('file', file);

                const res = await fetch('/api/s3/files', { method: 'POST', body: formData });
                if (!res.ok) throw new Error(`${file.name} 업로드 실패`);

                newAttachments.push({
                    name: file.name,
                    key: key,
                    url: `${window.location.origin}/api/s3/files?key=${encodeURIComponent(key)}&name=${encodeURIComponent(file.name)}`
                });
            }

            // DB 업데이트
            const updateRes = await fetch(`/api/work-sites/${id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ attachments: newAttachments })
            });

            if (!updateRes.ok) throw new Error('DB 업데이트 실패');

            const data = await updateRes.json();
            setItem(data.item);
            setShowAttachments(true);
            alert('파일이 성공적으로 추가되었습니다.');
        } catch (error) {
            console.error(error);
            alert(error.message);
        } finally {
            setUploading(false);
        }
    };

    const handleDelete = async () => {
        if (!confirm('삭제하시겠습니까?')) return;
        const res = await fetch('/api/work-sites/' + id, { method: 'DELETE' });
        if (res.ok) router.push('/employees/work-sites');
        else alert('삭제 실패');
    };

    if (authLoading || loading) return <div className={styles.loading}>로딩 중...</div>;
    if (!role) return null;
    if (!item) return <div className={styles.loading}>작업지를 찾을 수 없습니다.</div>;

    const managers = item.managers || [];

    let workProcess = {};
    try {
        if (item.work_method && item.work_method.trim().startsWith('{')) {
            workProcess = JSON.parse(item.work_method);
        } else {
            workProcess = { notes: item.work_method };
        }
    } catch(e) {
        workProcess = { notes: item.work_method };
    }

    return (
        <div className={styles.container}>
            <div className={styles.headerBanner}>
                <h1 className={styles.title}>작업지확인</h1>
            <div className={styles.controls}>
                <Link href={'/employees/work-sites/' + id + '/edit'} className={styles.btnSecondary}>수정</Link>
                <button type="button" onClick={handleDelete} className={styles.btnDelete}>삭제</button>
                <Link href="/employees/work-sites" className={styles.btnSecondary}>목록</Link>
            </div>
            </div>
            <div className={styles.card}>
                
                {item.site_name && (
                    <h2 className={styles.detailTitle} style={{ margin: '0 0 16px 0', color: '#1e40af', fontSize: '1.4rem' }}>{item.site_name}</h2>
                )}

                <div style={{ borderTop: '2px solid #3b82f6', borderBottom: '1px solid #cbd5e1', fontSize: '0.95rem', borderRadius: '4px', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', marginBottom: 32 }}>
                    
                    {/* 담당자 */}
                    <div style={{ display: 'flex', borderBottom: '1px solid #e2e8f0', background: '#fff' }}>
                        <div style={{ width: '120px', minWidth: '120px', background: '#4b89dc', color: 'white', padding: '16px 12px', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>담당자</div>
                        <div style={{ flex: 1, padding: '16px 20px', display: 'flex', flexWrap: 'wrap', gap: '16px' }}>
                            {managers.length > 0 ? managers.map((m, i) => (
                                <div key={i} style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                                    <span style={{ fontWeight: 600, color: '#1e293b' }}>{m.name} {m.role}</span>
                                    <span style={{ color: '#0f172a', fontWeight: 700 }}>{m.phone}</span>
                                </div>
                            )) : <span style={{ color: '#94a3b8' }}>등록된 담당자가 없습니다.</span>}
                        </div>
                    </div>

                    {/* 주소 */}
                    <div style={{ display: 'flex', borderBottom: '1px solid #e2e8f0', background: '#fff' }}>
                        <div style={{ width: '120px', minWidth: '120px', background: '#4b89dc', color: 'white', padding: '16px 12px', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>주소</div>
                        <div style={{ flex: 1, padding: '16px 20px', fontWeight: 600, color: '#334155' }}>
                            {item.address}
                        </div>
                    </div>

                    {/* 주의사항 */}
                    {(workProcess.precautions || workProcess.notes) && (
                        <div style={{ display: 'flex', borderBottom: '1px solid #e2e8f0', background: '#fff' }}>
                            <div style={{ width: '120px', minWidth: '120px', background: '#4b89dc', color: 'white', padding: '16px 12px', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>주의사항</div>
                            <div style={{ flex: 1, padding: '16px 20px', color: '#334155', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
                                {workProcess.precautions || workProcess.notes}
                            </div>
                        </div>
                    )}

                    {/* 입차 */}
                    {workProcess.entryProcess && (
                        <div style={{ display: 'flex', borderBottom: '1px solid #e2e8f0', background: '#fff' }}>
                            <div style={{ width: '120px', minWidth: '120px', background: '#4b89dc', color: 'white', padding: '16px 12px', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>입차</div>
                            <div style={{ flex: 1, padding: '16px 20px', color: '#334155', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
                                {workProcess.entryProcess}
                            </div>
                        </div>
                    )}

                    {/* 접수 */}
                    {workProcess.receptionProcess && (
                        <div style={{ display: 'flex', borderBottom: '1px solid #e2e8f0', background: '#fff' }}>
                            <div style={{ width: '120px', minWidth: '120px', background: '#4b89dc', color: 'white', padding: '16px 12px', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>접수</div>
                            <div style={{ flex: 1, padding: '16px 20px', color: '#334155', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
                                {workProcess.receptionProcess}
                            </div>
                        </div>
                    )}

                    {/* 적입 */}
                    {workProcess.loadingProcess && (
                        <div style={{ display: 'flex', borderBottom: '1px solid #e2e8f0', background: '#fff' }}>
                            <div style={{ width: '120px', minWidth: '120px', background: '#4b89dc', color: 'white', padding: '16px 12px', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>적입</div>
                            <div style={{ flex: 1, padding: '16px 20px', color: '#334155', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
                                {workProcess.loadingProcess}
                            </div>
                        </div>
                    )}

                    {/* 출차 */}
                    {workProcess.exitProcess && (
                        <div style={{ display: 'flex', borderBottom: '1px solid #e2e8f0', background: '#fff' }}>
                            <div style={{ width: '120px', minWidth: '120px', background: '#4b89dc', color: 'white', padding: '16px 12px', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>출차</div>
                            <div style={{ flex: 1, padding: '16px 20px', color: '#334155', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
                                {workProcess.exitProcess}
                            </div>
                        </div>
                    )}

                    {/* 약도 (첨부파일 중 이미지 렌더링) */}
                    <div style={{ display: 'flex', background: '#fff' }}>
                        <div style={{ width: '120px', minWidth: '120px', background: '#4b89dc', color: 'white', padding: '16px 12px', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>약도</div>
                        <div style={{ flex: 1, padding: '16px 20px' }}>
                            {item.attachments && item.attachments.filter(f => f.name.match(/\.(jpeg|jpg|gif|png)$/i)).length > 0 ? (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                                    {item.attachments.filter(f => f.name.match(/\.(jpeg|jpg|gif|png)$/i)).map((img, idx) => (
                                        <img key={idx} src={img.url || `/api/s3/files?key=${encodeURIComponent(img.key)}&name=${encodeURIComponent(img.name)}`} alt="약도" style={{ maxWidth: '100%', borderRadius: 8, border: '1px solid #e2e8f0' }} />
                                    ))}
                                </div>
                            ) : (
                                <span style={{ color: '#94a3b8' }}>등록된 약도 이미지가 없습니다.</span>
                            )}
                        </div>
                    </div>
                </div>

                <div style={{ marginTop: 24, marginBottom: 40 }}>
                    <div style={{ fontWeight: 800, color: '#1e293b', marginBottom: 12, fontSize: '0.95rem' }}>💡 특이사항 (기타 참고사항)</div>
                    <div className={styles.contentBody} style={{ background: '#fff', padding: 20, borderRadius: 16, border: '1px solid #f1f5f9', minHeight: 100, whiteSpace: 'pre-wrap' }}>
                        {item.notes || <span style={{ color: '#94a3b8' }}>(특이사항 없음)</span>}
                    </div>
                </div>

                {item.attachments && item.attachments.length > 0 && (
                    <div className={styles.attachmentSection} style={{ marginTop: 40 }}>
                        <div className={styles.attachmentToggle} onClick={() => setShowAttachments(!showAttachments)}>
                            <div className={styles.attachmentLabel}>
                                📎 관련 첨부서류 <span className={styles.attachmentCount}>{item.attachments.length}</span>
                            </div>
                            <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>{showAttachments ? '▲ 접기' : '▼ 펼치기'}</span>
                        </div>
                        {showAttachments && (
                            <div style={{ background: '#fff', border: '1px solid #f1f5f9', borderTop: 'none', borderRadius: '0 0 16px 16px', padding: 20 }}>
                                <ul className={styles.attachmentList} style={{ margin: 0, padding: 0, listStyle: 'none' }}>
                                    {item.attachments.map((file, idx) => (
                                        <li key={idx} className={styles.attachmentItem} style={{ marginBottom: 8, padding: '12px 16px', background: '#f8fafc', borderRadius: 12, border: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                                <span style={{ fontSize: '1.2rem' }}>📄</span>
                                                <span style={{ fontWeight: 600, color: '#334155', fontSize: '0.9rem' }}>{file.name || '파일'}</span>
                                            </div>
                                            <a
                                                href={file.url || file.path || \`/api/s3/files?key=\${encodeURIComponent(file.key)}&name=\${encodeURIComponent(file.name)}\`}
                                                className={styles.btnSecondary}
                                                style={{ padding: '6px 12px', fontSize: '0.8rem' }}
                                                download
                                            >
                                                다운로드
                                            </a>
                                        </li>
                                    ))}
                                </ul>

                                <div style={{ marginTop: 20, paddingTop: 20, borderTop: '1px dashed #e2e8f0' }}>
                                    <input
                                        type="file"
                                        id="workFileAdd"
                                        multiple
                                        style={{ display: 'none' }}
                                        onChange={handleFileUpload}
                                        disabled={uploading}
                                    />
                                    <label
                                        htmlFor="workFileAdd"
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            gap: 8,
                                            padding: '12px',
                                            background: '#f1f5f9',
                                            color: '#475569',
                                            borderRadius: 12,
                                            fontSize: '0.9rem',
                                            fontWeight: 700,
                                            cursor: uploading ? 'not-allowed' : 'pointer',
                                            transition: 'all 0.2s'
                                        }}
                                    >
                                        {uploading ? '⏳ 업로드 중...' : '➕ 새 파일 추가하기'}
                                    </label>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

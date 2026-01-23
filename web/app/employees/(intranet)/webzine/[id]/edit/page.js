'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';
import styles from '../../../(intranet)/board/board.module.css';

export default function EditWebzinePost({ params }) {
    const [title, setTitle] = useState('');
    const [content, setContent] = useState('');
    const [currentThumbnail, setCurrentThumbnail] = useState(null);
    const [thumbnailFile, setThumbnailFile] = useState(null);
    const [uploading, setUploading] = useState(false);
    const [loading, setLoading] = useState(true);
    const router = useRouter();
    const supabase = createClient();
    const { id } = params;

    useEffect(() => {
        const fetchPost = async () => {
            const { data, error } = await supabase
                .from('posts')
                .select('*')
                .eq('id', id)
                .single();

            if (error) {
                console.error('Error fetching post:', error);
                alert('게시글을 불러올 수 없습니다.');
                router.push('/employees/webzine');
            } else {
                setTitle(data.title);
                setContent(data.content);
                setCurrentThumbnail(data.thumbnail_url);
            }
            setLoading(false);
        };
        fetchPost();
    }, [id, router, supabase]);

    const handleThumbnailChange = (e) => {
        if (e.target.files && e.target.files[0]) {
            setThumbnailFile(e.target.files[0]);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!title.trim() || !content.trim()) {
            alert('제목과 내용을 입력해주세요.');
            return;
        }

        setUploading(true);

        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error('로그인이 필요합니다.');

            let thumbnailUrl = currentThumbnail;

            if (thumbnailFile) {
                const now = new Date();
                const yearMonth = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
                const safeName = thumbnailFile.name.replace(/[^a-zA-Z0-9.\-_]/g, '');
                const key = `Webzine/${yearMonth}/${Date.now()}_${safeName}`;

                const formData = new FormData();
                formData.append('file', thumbnailFile);
                formData.append('key', key);

                const uploadRes = await fetch('/api/s3/files', {
                    method: 'POST',
                    body: formData,
                });

                if (!uploadRes.ok) throw new Error('이미지 업로드 실패');
                thumbnailUrl = key;
            }

            const { error } = await supabase
                .from('posts')
                .update({
                    title,
                    content,
                    thumbnail_url: thumbnailUrl,
                    updated_at: new Date()
                })
                .eq('id', id);

            if (error) throw error;

            alert('수정되었습니다.');
            router.push(`/employees/webzine/${id}`);
            router.refresh();

        } catch (error) {
            console.error('Error updating post:', error);
            alert(`수정 중 오류가 발생했습니다: ${error.message}`);
        } finally {
            setUploading(false);
        }
    };

    if (loading) return <div className="loading" style={{ padding: '100px', textAlign: 'center' }}>로딩 중...</div>;

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <h1 className={styles.title}>웹진 수정</h1>
            </div>

            <div className={styles.editorCard}>
                <form onSubmit={handleSubmit}>
                    <div className={styles.formGroup}>
                        <label className={styles.label}>제목</label>
                        <input
                            type="text"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            className={styles.input}
                            placeholder="제목을 입력하세요"
                            required
                        />
                    </div>

                    <div className={styles.formGroup}>
                        <label className={styles.label}>대표 이미지 (썸네일)</label>
                        {currentThumbnail && !thumbnailFile && (
                            <div style={{ fontSize: '0.85rem', color: '#64748b', marginBottom: '8px' }}>
                                현재 이미지: {currentThumbnail.split('/').pop()}
                            </div>
                        )}
                        <input
                            type="file"
                            accept="image/*"
                            onChange={handleThumbnailChange}
                            className={styles.input}
                            style={{ padding: '10px' }}
                        />
                        <small className={styles.hint}>변경하려면 새 이미지를 선택하세요. (기존 이미지는 유지됩니다)</small>
                    </div>

                    <div className={styles.formGroup}>
                        <label className={styles.label}>내용</label>
                        <textarea
                            value={content}
                            onChange={(e) => setContent(e.target.value)}
                            className={styles.textarea}
                            placeholder="웹진 내용을 입력하세요 (HTML 가능)"
                            rows={15}
                            required
                        />
                    </div>

                    <div className={styles.editorActions}>
                        <button type="button" onClick={() => router.back()} className={styles.btnSecondary}>취소</button>
                        <button type="submit" disabled={uploading} className={styles.btnPrimary}>
                            {uploading ? '저장 중...' : '수정 완료'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

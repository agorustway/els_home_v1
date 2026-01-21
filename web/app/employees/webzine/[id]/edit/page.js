'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';
import styles from '../../new/new.module.css'; // Reusing 'new' styles

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
    }, [id, router]);

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

            // 1. Upload new thumbnail if selected
            if (thumbnailFile) {
                const formData = new FormData();
                const timestamp = Date.now();
                const safeFileName = `${timestamp}_${thumbnailFile.name.replace(/[^a-zA-Z0-9.\-_]/g, '')}`;
                const renamedFile = new File([thumbnailFile], safeFileName, { type: thumbnailFile.type });

                formData.append('file', renamedFile);
                formData.append('path', '/ELS_WEB_DATA/webzine');

                const uploadRes = await fetch('/api/nas/files', {
                    method: 'POST',
                    body: formData,
                });

                if (!uploadRes.ok) throw new Error('이미지 업로드 실패');
                const result = await uploadRes.json();
                thumbnailUrl = result.path;
            }

            // 2. Update Post
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

    if (loading) return <div className="loading">로딩 중...</div>;

    return (
        <div className={styles.container}>
            <h1 className={styles.title}>웹진 수정</h1>
            
            <form onSubmit={handleSubmit} className={styles.form}>
                <div className={styles.formGroup}>
                    <label>제목</label>
                    <input 
                        type="text" 
                        value={title} 
                        onChange={(e) => setTitle(e.target.value)} 
                        className={styles.input}
                    />
                </div>

                <div className={styles.formGroup}>
                    <label>대표 이미지 (썸네일)</label>
                    {currentThumbnail && !thumbnailFile && (
                        <div style={{ fontSize: '0.9rem', color: '#666', marginBottom: '5px' }}>
                            현재 이미지: {currentThumbnail.split('/').pop()}
                        </div>
                    )}
                    <input 
                        type="file" 
                        accept="image/*"
                        onChange={handleThumbnailChange}
                        className={styles.fileInput}
                    />
                    <small className={styles.hint}>변경하려면 새 이미지를 선택하세요.</small>
                </div>

                <div className={styles.formGroup}>
                    <label>내용</label>
                    <textarea 
                        value={content} 
                        onChange={(e) => setContent(e.target.value)} 
                        className={styles.textarea}
                        rows={15}
                    />
                </div>

                <div className={styles.actions}>
                    <button type="button" onClick={() => router.back()} className={styles.cancelBtn}>취소</button>
                    <button type="submit" disabled={uploading} className={styles.submitBtn}>
                        {uploading ? '저장 중...' : '수정하기'}
                    </button>
                </div>
            </form>
        </div>
    );
}

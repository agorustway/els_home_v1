'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';
import styles from './new.module.css'; // Will create this

export default function NewWebzinePost() {
    const [title, setTitle] = useState('');
    const [content, setContent] = useState('');
    const [thumbnailFile, setThumbnailFile] = useState(null);
    const [uploading, setUploading] = useState(false);
    const router = useRouter();
    const supabase = createClient();

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

            let thumbnailUrl = null;

            // 1. Upload Thumbnail to S3 (via Server Proxy to avoid CORS)
            if (thumbnailFile) {
                const now = new Date();
                const yearMonth = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
                const safeName = thumbnailFile.name.replace(/[^a-zA-Z0-9.\-_]/g, '');
                const key = `Webzine/${yearMonth}/${Date.now()}_${safeName}`; // S3 Key

                const formData = new FormData();
                formData.append('file', thumbnailFile);
                formData.append('key', key);

                const uploadRes = await fetch('/api/s3/files', {
                    method: 'POST',
                    body: formData, // Auto Content-Type: multipart/form-data
                });

                if (!uploadRes.ok) {
                    const err = await uploadRes.json();
                    throw new Error(`이미지 업로드 실패: ${err.error}`);
                }
                
                thumbnailUrl = key; // Save S3 Key
            }

            // 2. Save Post to Supabase
            const { error } = await supabase.from('posts').insert({
                title,
                content,
                author_id: user.id,
                board_type: 'webzine',
                thumbnail_url: thumbnailUrl,
                attachments: [] // Future: can add other attachments
            });

            if (error) throw error;

            alert('웹진이 등록되었습니다.');
            router.push('/employees/webzine');
            router.refresh();

        } catch (error) {
            console.error('Error creating post:', error);
            alert(`등록 중 오류가 발생했습니다: ${error.message}`);
        } finally {
            setUploading(false);
        }
    };

    return (
        <div className={styles.container}>
            <h1 className={styles.title}>웹진 등록</h1>
            
            <form onSubmit={handleSubmit} className={styles.form}>
                <div className={styles.formGroup}>
                    <label>제목</label>
                    <input 
                        type="text" 
                        value={title} 
                        onChange={(e) => setTitle(e.target.value)} 
                        placeholder="제목을 입력하세요"
                        className={styles.input}
                    />
                </div>

                <div className={styles.formGroup}>
                    <label>대표 이미지 (썸네일)</label>
                    <input 
                        type="file" 
                        accept="image/*"
                        onChange={handleThumbnailChange}
                        className={styles.fileInput}
                    />
                    <small className={styles.hint}>목록에 표시될 이미지를 선택하세요. (NAS에 저장됩니다)</small>
                </div>

                <div className={styles.formGroup}>
                    <label>내용</label>
                    <textarea 
                        value={content} 
                        onChange={(e) => setContent(e.target.value)} 
                        placeholder="내용을 입력하세요 (HTML 태그 사용 가능)"
                        className={styles.textarea}
                        rows={15}
                    />
                </div>

                <div className={styles.actions}>
                    <button type="button" onClick={() => router.back()} className={styles.cancelBtn}>취소</button>
                    <button type="submit" disabled={uploading} className={styles.submitBtn}>
                        {uploading ? '등록 중...' : '등록하기'}
                    </button>
                </div>
            </form>
        </div>
    );
}

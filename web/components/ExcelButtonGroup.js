'use client';

import { useState } from 'react';

export default function ExcelButtonGroup({ onUploadSuccess }) {
    const [uploading, setUploading] = useState(false);

    const handleUpload = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (!confirm('선택한 엑셀 파일로 일괄 등록/수정을 진행하시겠습니까?\n주의: 변경사항은 즉시 반영됩니다.')) {
            e.target.value = '';
            return;
        }

        setUploading(true);
        const formData = new FormData();
        formData.append('file', file);

        try {
            const res = await fetch('/api/contacts/excel/upload', {
                method: 'POST',
                body: formData
            });
            const data = await res.json();

            if (res.ok) {
                alert(data.message);
                if (onUploadSuccess) onUploadSuccess(); // 목록 새로고침 
            } else {
                alert('업로드 실패: ' + data.error + '\n' + (data.details || ''));
            }
        } catch (err) {
            console.error(err);
            alert('업로드 중 네트워크 오류가 발생했습니다.');
        } finally {
            setUploading(false);
            e.target.value = ''; // 초기화
        }
    };

    const btnStyle = {
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '40px',
        padding: '0 16px',
        borderRadius: '8px',
        fontSize: '0.9rem',
        fontWeight: 'bold',
        cursor: 'pointer',
        textDecoration: 'none',
        border: 'none',
        boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
    };

    return (
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
            <a
                href="/api/contacts/excel/template"
                download
                style={{ ...btnStyle, background: '#10b981', color: 'white' }}
                title="등록할 데이터가 포함된 엑셀 양식을 다운로드합니다."
            >
                ⬇️ 양식 다운로드
            </a>

            <label
                style={{ ...btnStyle, background: '#f59e0b', color: 'white', cursor: uploading ? 'not-allowed' : 'pointer', opacity: uploading ? 0.7 : 1 }}
                title="다운로드한 양식을 채워 올려주시면 일괄 등록 및 수정됩니다."
            >
                {uploading ? '⏳ 처리중...' : '⬆️ 엑셀 일괄등록'}
                <input
                    type="file"
                    accept=".xlsx, .xls"
                    style={{ display: 'none' }}
                    onChange={handleUpload}
                    disabled={uploading}
                />
            </label>
        </div>
    );
}

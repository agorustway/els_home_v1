'use client';

import { useState } from 'react';

export default function ExcelButtonGroup({ onUploadSuccess, tableName }) {
    const [uploading, setUploading] = useState(false);
    const [deduplicating, setDeduplicating] = useState(false);

    const handleUpload = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (!confirm('선택한 엑셀 파일로 일괄 등록/수정/삭제를 진행하시겠습니까?\n\n- ID가 있고 삭제 컬럼에 Y를 쓰면 데이터가 삭제됩니다.\n- ID가 있고 내용을 바꾸면 데이터가 수정됩니다.\n- ID가 없으면 신규 데이터로 등록됩니다.')) {
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
                if (onUploadSuccess) onUploadSuccess(); 
            } else {
                alert('업로드 실패: ' + data.error + '\n' + (data.details || ''));
            }
        } catch (err) {
            console.error(err);
            alert('업로드 중 네트워크 오류가 발생했습니다.');
        } finally {
            setUploading(false);
            e.target.value = ''; 
        }
    };

    const handleDeduplicate = async () => {
        if (!tableName) return;
        if (!confirm('중복된 데이터를 검색하여 등록일이 오래된 데이터를 일괄 삭제합니다.\n계속하시겠습니까?')) return;
        
        setDeduplicating(true);
        try {
            const res = await fetch('/api/contacts/deduplicate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tableName })
            });
            const data = await res.json();
            
            if (res.ok) {
                alert(`중복 제거가 완료되었습니다.\n삭제된 중복 항목: ${data.deletedCount}건`);
                if (onUploadSuccess) onUploadSuccess();
            } else {
                alert('중복 제거 실패: ' + data.error);
            }
        } catch (err) {
            console.error(err);
            alert('중복 제거 중 네트워크 오류가 발생했습니다.');
        } finally {
            setDeduplicating(false);
        }
    };

    const btnStyle = {
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '32px',
        padding: '6px 12px',
        borderRadius: '6px',
        fontSize: '0.78rem',
        fontWeight: '700',
        cursor: 'pointer',
        textDecoration: 'none',
        border: 'none',
        boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
        whiteSpace: 'nowrap'
    };

    return (
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
            <a
                href="/api/contacts/excel/template"
                download
                style={{ ...btnStyle, background: '#10b981', color: 'white' }}
                title="등록할 데이터가 포함된 엑셀 양식을 다운로드합니다."
            >
                양식 다운로드
            </a>

            <label
                style={{ ...btnStyle, background: '#f59e0b', color: 'white', cursor: uploading ? 'not-allowed' : 'pointer', opacity: uploading ? 0.7 : 1 }}
                title="양식을 채워 올려주시면 일괄 등록, 수정 및 삭제(Y표기 시)가 진행됩니다."
            >
                {uploading ? '중...' : '엑셀 일괄작업'}
                <input
                    type="file"
                    accept=".xlsx, .xls"
                    style={{ display: 'none' }}
                    onChange={handleUpload}
                />
            </label>

            {tableName && (
                <button
                    onClick={handleDeduplicate}
                    disabled={deduplicating}
                    style={{ ...btnStyle, background: '#ef4444', color: 'white', cursor: deduplicating ? 'not-allowed' : 'pointer', opacity: deduplicating ? 0.7 : 1 }}
                    title="중복된 데이터를 정리합니다."
                >
                    {deduplicating ? '검사중...' : '중복 정리'}
                </button>
            )}
        </div>
    );
}

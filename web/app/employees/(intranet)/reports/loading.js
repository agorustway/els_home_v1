'use client';
export default function Loading() {
    return (
        <div style={{ padding: '40px', textAlign: 'center', minHeight: '60vh', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
            <div style={{ 
                width: '40px', height: '40px', border: '3px solid #f3f3f3', borderTop: '3px solid var(--primary-blue)', 
                borderRadius: '50%', animation: 'spin 1s linear infinite', marginBottom: '20px' 
            }} />
            <p style={{ color: '#64748b', fontSize: '1rem' }}>업무보고 데이터를 불러오는 중입니다...</p>
            <style jsx>{` @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } } `}</style>
        </div>
    );
}
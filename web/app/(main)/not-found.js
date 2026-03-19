import Link from 'next/link';

export default function NotFound() {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100vh',
      textAlign: 'center',
      fontFamily: 'sans-serif'
    }}>
      <h2 style={{ fontSize: '3rem', fontWeight: 'bold', color: '#333' }}>404</h2>
      <p style={{ fontSize: '1.2rem', margin: '1rem 0 2rem', color: '#666' }}>페이지를 찾을 수 없습니다.</p>
      <Link href="/" style={{
        padding: '12px 24px',
        backgroundColor: '#0056b3',
        color: 'white',
        textDecoration: 'none',
        borderRadius: '5px',
        fontWeight: 'bold'
      }}>
        홈으로 돌아가기
      </Link>
    </div>
  );
}

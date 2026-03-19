'use client'; // Error components must be Client Components

import { useEffect } from 'react';
import Link from 'next/link';

export default function Error({ error, reset }) {
  useEffect(() => {
    // Log the error to an error reporting service
    console.error(error);
  }, [error]);

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
      <h2 style={{ fontSize: '2rem', marginBottom: '1rem' }}>문제가 발생했습니다.</h2>
      <p style={{ marginBottom: '2rem', color: '#666' }}>죄송합니다. 페이지를 로드하는 중 오류가 발생했습니다.</p>
      <div style={{ display: 'flex', gap: '1rem' }}>
        <button
          onClick={() => reset()}
          style={{
            padding: '10px 20px',
            backgroundColor: '#0056b3',
            color: 'white',
            border: 'none',
            borderRadius: '5px',
            cursor: 'pointer'
          }}
        >
          다시 시도
        </button>
        <Link href="/" style={{
            padding: '10px 20px',
            backgroundColor: '#f0f0f0',
            color: '#333',
            textDecoration: 'none',
            borderRadius: '5px'
        }}>
          홈으로 이동
        </Link>
      </div>
    </div>
  );
}

'use client';

import { useEffect } from 'react';
import Link from 'next/link';

export default function Error({ error, reset }) {
  useEffect(() => {
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
      fontFamily: 'sans-serif',
      background: '#f8fafc',
      padding: '20px'
    }}>
      <h2 style={{ fontSize: '1.5rem', marginBottom: '1rem', color: '#1e293b' }}>문제가 발생했습니다.</h2>
      <p style={{ marginBottom: '2rem', color: '#64748b' }}>데이터를 불러올 수 없습니다.</p>
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
          재시도
        </button>
        <Link href="/driver-app" style={{
            padding: '10px 20px',
            backgroundColor: '#e2e8f0',
            color: '#475569',
            textDecoration: 'none',
            borderRadius: '5px'
        }}>
          이전으로
        </Link>
      </div>
    </div>
  );
}

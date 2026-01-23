'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useUserRole } from '@/hooks/useUserRole';
import { getRoleLabel } from '@/utils/roles';

export default function EmployeeDashboard() {
    const { role, user, loading } = useUserRole();
    const router = useRouter();

    useEffect(() => {
        if (!loading && !role) {
            router.replace('/login?next=/employees/dashboard');
        }
    }, [role, loading, router]);

    if (loading) {
        return <div style={{ padding: '100px', textAlign: 'center' }}>권한 확인 중...</div>;
    }
    if (!role) return null;

    return (
        <div style={{ padding: '20px' }}>
            <div style={{ marginBottom: '40px' }}>
                <h1 style={{ fontSize: '2.5rem', fontWeight: '800', color: '#1e293b', marginBottom: '10px', letterSpacing: '-1px' }}>
                    반갑습니다, {user?.user_metadata?.name || user?.email?.split('@')[0]}님!
                </h1>
                <p style={{ color: '#64748b', fontSize: '1.1rem' }}>
                    현재 <span style={{ color: '#2563eb', fontWeight: '800', backgroundColor: '#eff6ff', padding: '6px 16px', borderRadius: '20px', fontSize: '0.95rem' }}>{getRoleLabel(role)}</span> 권한으로 접속 중입니다.
                </p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '24px' }}>
                <div style={{ background: 'white', padding: '40px', borderRadius: '24px', boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.05)', border: '1px solid #f1f5f9' }}>
                    <div style={{ fontSize: '2.5rem', marginBottom: '24px' }}>📢</div>
                    <h3 style={{ fontSize: '1.4rem', fontWeight: '800', color: '#1e293b', marginBottom: '16px' }}>공지사항</h3>
                    <p style={{ color: '#64748b', lineHeight: '1.7', fontSize: '1rem' }}>사내 주요 소식을 확인하세요. 새로운 공지사항이 있으면 여기에 표시됩니다.</p>
                </div>

                <div style={{ background: 'white', padding: '40px', borderRadius: '24px', boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.05)', border: '1px solid #f1f5f9' }}>
                    <div style={{ fontSize: '2.5rem', marginBottom: '24px' }}>📝</div>
                    <h3 style={{ fontSize: '1.4rem', fontWeight: '800', color: '#1e293b', marginBottom: '16px' }}>내 업무 현황</h3>
                    <p style={{ color: '#64748b', lineHeight: '1.7', fontSize: '1rem' }}>이번 주 작성하신 업무보고는 총 0건입니다. 지점별 실적을 기록해 주세요.</p>
                </div>

                <div style={{ background: 'white', padding: '40px', borderRadius: '24px', boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.05)', border: '1px solid #f1f5f9' }}>
                    <div style={{ fontSize: '2.5rem', marginBottom: '24px' }}>📁</div>
                    <h3 style={{ fontSize: '1.4rem', fontWeight: '800', color: '#1e293b', marginBottom: '16px' }}>자료실 현황</h3>
                    <p style={{ color: '#64748b', lineHeight: '1.7', fontSize: '1rem' }}>NAS 시스템에 안전하게 보관된 업무 자료를 탐색하고 공유할 수 있습니다.</p>
                </div>
            </div>
        </div>
    );
}

'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/utils/supabase/client';
import styles from './AsanLunchMenu.module.css';

// 날짜 유틸리티: 해당 날짜가 포함된 주의 월요일 구하기
function getMonday(d) {
    d = new Date(d);
    var day = d.getDay(),
        diff = d.getDate() - day + (day == 0 ? -6 : 1);
    return new Date(d.setDate(diff));
}

function formatDate(dateString) {
    if (!dateString) return '';
    const date = new Date(dateString);
    const now = new Date();
    const isThisYear = date.getFullYear() === now.getFullYear();
    const mm = date.getMonth() + 1;
    const dd = date.getDate();

    if (isThisYear) {
        return `${mm}월 ${dd}일`;
    } else {
        const yy = String(date.getFullYear()).slice(-2);
        return `${yy}년 ${mm}월 ${dd}일`;
    }
}

export default function AsanLunchMenu() {
    const [menus, setMenus] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isEditing, setIsEditing] = useState(false);
    const [user, setUser] = useState(null);

    // Form States
    const [selectedDate, setSelectedDate] = useState('');
    const [file, setFile] = useState(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Zoom & Edit Target
    const [targetMenu, setTargetMenu] = useState(null);
    const [isZoomed, setIsZoomed] = useState(false);

    const supabase = createClient();

    useEffect(() => {
        checkUser();
        fetchMenus();

        // ESC 키로 닫기
        const handleKeyDown = (e) => {
            if (e.key === 'Escape') {
                setIsZoomed(false);
                setIsEditing(false);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    const checkUser = async () => {
        const { data: { user } } = await supabase.auth.getUser();
        setUser(user);
    };

    const fetchMenus = async () => {
        try {
            setIsLoading(true);
            const res = await fetch('/api/asan/lunch?type=lunchbox');
            const json = await res.json();
            if (json.data) {
                // 배열인지 확인 (API 수정으로 배열이 옴)
                setMenus(Array.isArray(json.data) ? json.data : [json.data]);
            } else {
                setMenus([]);
            }
        } catch (err) {
            console.error('Failed to fetch menu:', err);
        } finally {
            setIsLoading(false);
        }
    };

    // 새 식단 등록
    const handleNewClick = () => {
        const today = new Date();
        const monday = getMonday(today);
        const yyyy = monday.getFullYear();
        const mm = String(monday.getMonth() + 1).padStart(2, '0');
        const dd = String(monday.getDate()).padStart(2, '0');

        setSelectedDate(`${yyyy}-${mm}-${dd}`);
        setFile(null);
        setTargetMenu(null); // New mode
        setIsEditing(true);
    };

    // 기존 식단 수정
    const handleEditClick = (menu, e) => {
        e.stopPropagation();
        setSelectedDate(menu.week_start_date);
        setFile(null);
        setTargetMenu(menu); // Edit mode
        setIsEditing(true);
    };

    // 이미지 클릭 (확대)
    const handleImageClick = (menu) => {
        setTargetMenu(menu);
        setIsZoomed(true);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if ((!targetMenu && !file) || !selectedDate) {
            alert('날짜와 이미지 파일을 모두 선택해주세요.');
            return;
        }

        try {
            setIsSubmitting(true);
            const formData = new FormData();
            if (file) formData.append('file', file);
            formData.append('week_start_date', selectedDate);
            formData.append('branch', 'asan');
            formData.append('type', 'lunchbox');

            const res = await fetch('/api/asan/lunch', {
                method: 'POST',
                body: formData
            });
            const result = await res.json();

            if (!res.ok) throw new Error(result.error);

            alert('식단표가 성공적으로 저장되었습니다.');
            setIsEditing(false);
            fetchMenus(); // Refresh list
        } catch (err) {
            alert(`저장 실패: ${err.message}`);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className={styles.container}>
            <div className={styles.card}>
                <div className={styles.header}>
                    <div className={styles.titleGroup}>
                        <h2>
                            🍱 아산지점 점심 식단표
                        </h2>
                        <span className={styles.subTitle}>최근 식단표를 확인하고 관리할 수 있습니다. (좌우 스크롤)</span>
                    </div>
                    {/* Header Action Button */}
                    {user && (
                        <div className={styles.headerActions}>
                            <button className={styles.uploadIconBtn} onClick={handleNewClick}>
                                ➕ 새 식단
                            </button>
                        </div>
                    )}
                </div>

                <div className={styles.scrollContainer}>
                    {/* Menu List Only */}
                    {isLoading ? (
                        <div className={styles.emptyState}>로딩 중...</div>
                    ) : menus.length > 0 ? (
                        menus.map((menu) => (
                            <div key={menu.id} className={styles.menuCard}>
                                <div className={styles.menuImageArea} onClick={() => handleImageClick(menu)}>
                                    <img
                                        src={`/api/s3/files?key=${menu.image_url}&t=${new Date(menu.updated_at).getTime()}`}
                                        alt={`Menu ${menu.week_start_date}`}
                                        className={styles.menuImg}
                                    />
                                    {user && (
                                        <button
                                            className={styles.editBtn}
                                            onClick={(e) => handleEditClick(menu, e)}
                                            title="수정"
                                        >
                                            ✏️
                                        </button>
                                    )}
                                </div>
                                <div className={styles.menuDate}>
                                    {formatDate(menu.week_start_date)} 업데이트
                                </div>
                            </div>
                        ))
                    ) : (
                        <div className={styles.emptyState}>등록된 식단표가 없습니다.</div>
                    )}
                </div>
            </div>

            {/* Zoom Modal */}
            {isZoomed && targetMenu && (
                <div className={styles.zoomOverlay} onClick={() => setIsZoomed(false)}>
                    <img
                        src={`/api/s3/files?key=${targetMenu.image_url}&t=${new Date(targetMenu.updated_at).getTime()}`}
                        alt="Zoomed Menu"
                        className={styles.zoomImg}
                    />
                    <div className={styles.closeHint}>닫으려면 클릭하거나 ESC를 누르세요</div>
                </div>
            )}

            {/* Edit Modal */}
            {isEditing && (
                <div className={styles.formOverlay} onClick={(e) => { if (e.target === e.currentTarget) setIsEditing(false); }}>
                    <div className={styles.formCard}>
                        <h3>{targetMenu ? '✏️ 식단표 수정' : '📷 새 식단표 등록'}</h3>
                        <p style={{ marginBottom: '20px', color: '#64748b', fontSize: '0.9rem' }}>
                            {targetMenu ? '이미지를 변경하려면 파일을 다시 선택하세요.' : '해당 주(Week)의 시작일(월요일)을 선택하고 이미지를 업로드하세요.'}
                        </p>

                        <form onSubmit={handleSubmit}>
                            <div className={styles.formGroup}>
                                <label>기준 월요일 (시작일)</label>
                                <input
                                    type="date"
                                    value={selectedDate}
                                    onChange={e => setSelectedDate(e.target.value)}
                                    required
                                // 수정 시 날짜 못 바꾸게? 아니면 바꾸게? 보통은 바꾸게 둠 (잘못 올렸을 수 있으니)
                                // 하지만 PK가 아니라서 업데이트 로직이 날짜 기준이라 조심해야 함.
                                // 현재 로직: 해당 날짜에 데이터가 있으면 덮어쓰기. 즉 날짜 바꾸면 그 날짜 데이터 덮어씀. OK.
                                />
                            </div>

                            <div className={styles.formGroup}>
                                <label>식단 이미지 파일</label>
                                <input
                                    type="file"
                                    accept="image/*"
                                    onChange={e => setFile(e.target.files[0])}
                                    required={!targetMenu} // 수정 모드일 땐 파일 선택 안 해도 됨 (날짜만 바꿀 수도 있으니? 아 근데 여기 로직은 파일 필수인듯)
                                // API 로직 상 파일 없으면 에러 남. 수정 시에도 파일 재업로드 강제하는 게 간단함.
                                // 하지만 사용자 경험상 날짜만 바꾸는 건 드문 케이스.
                                // 일단 파일 필수로 유지 (이미지 관리니까). 날짜만 바꾸는 건 드문 케이스.
                                />
                            </div>

                            <div className={styles.formActions}>
                                <button type="button" className={styles.cancelBtn} onClick={() => setIsEditing(false)}>취소</button>
                                <button type="submit" className={styles.submitBtn} disabled={isSubmitting}>
                                    {isSubmitting ? '처리 중...' : (targetMenu ? '수정 완료' : '등록 완료')}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

        </div>
    );
}

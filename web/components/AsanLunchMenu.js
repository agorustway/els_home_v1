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
    const mm = date.getMonth() + 1;
    const dd = date.getDate();
    return `${mm}월 ${dd}일`;
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
                const data = Array.isArray(json.data) ? json.data : [json.data];
                // 최신순 정렬 (혹시 API가 정렬 안 해줄 경우 대비)
                data.sort((a, b) => new Date(b.week_start_date) - new Date(a.week_start_date));
                setMenus(data);
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
        if (e) e.stopPropagation();
        setSelectedDate(menu.week_start_date);
        setFile(null);
        setTargetMenu(menu); // Edit mode
        setIsEditing(true);
    };

    // 삭제 기능 추가
    const handleDelete = async (menu, e) => {
        if (e) e.stopPropagation();
        if (!confirm(`${formatDate(menu.week_start_date)} 주간 식단표를 삭제하시겠습니까?`)) return;

        try {
            // DELETE API 호출 (API가 id 쿼리 파라미터를 받야아 함)
            const res = await fetch(`/api/asan/lunch?id=${menu.id}`, {
                method: 'DELETE'
            });

            if (res.ok) {
                alert('삭제되었습니다.');
                fetchMenus();
            } else {
                // DELETE 메서드가 없을 경우를 대비해 POST로 삭제 요청을 보낼 수도 있음 (서버 구현에 따라 다름)
                // 일단 표준 RESTful DELETE 시도
                const err = await res.json();
                alert(`삭제 실패: ${err.error || '알 수 없는 오류'}`);
            }
        } catch (error) {
            console.error(error);
            alert('삭제 중 오류가 발생했습니다.');
        }
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

    // Separate latest menu and history
    const latestMenu = menus.length > 0 ? menus[0] : null;
    const pastMenus = menus.length > 1 ? menus.slice(1) : [];

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <div className={styles.titleGroup}>
                    <h2>아산지점 점심 식단표</h2>
                    <p className={styles.subTitle}>이번 주 점심 메뉴를 확인하세요.</p>
                </div>
                {user && (
                    <button className={styles.uploadIconBtn} onClick={handleNewClick}>
                        식단 등록
                    </button>
                )}
            </div>

            {/* 1. Hero Section (Latest Menu) */}
            {isLoading ? (
                <div className={styles.loadingBox}>식단표 불러오는 중...</div>
            ) : latestMenu ? (
                <div className={styles.heroSection}>
                    <div className={styles.heroHeader}>
                        <span className={styles.badgeLatest}>최신 식단</span>
                        <h3>{formatDate(latestMenu.week_start_date)} 주간 메뉴</h3>
                    </div>
                    <div className={styles.heroImageWrapper} onClick={() => handleImageClick(latestMenu)}>
                        <img
                            src={`/api/s3/files?key=${latestMenu.image_url}&t=${new Date(latestMenu.updated_at).getTime()}`}
                            alt="Latest Menu"
                            className={styles.heroImg}
                        />
                        <div className={styles.zoomHint}>클릭하여 확대</div>
                    </div>
                    {user && (
                        <div className={styles.heroActions}>
                            <button onClick={(e) => handleEditClick(latestMenu, e)} className={styles.actionBtn}>수정</button>
                            <button onClick={(e) => handleDelete(latestMenu, e)} className={styles.deleteBtn}>삭제</button>
                        </div>
                    )}
                </div>
            ) : (
                <div className={styles.emptyHero}>
                    <p>등록된 식단표가 없습니다.</p>
                </div>
            )}

            {/* 2. List Section (Past Menus) */}
            {pastMenus.length > 0 && (
                <div className={styles.historySection}>
                    <h3 className={styles.historyTitle}>지난 식단표 기록</h3>
                    <div className={styles.historyList}>
                        {pastMenus.map((menu) => (
                            <div key={menu.id} className={styles.historyItem} onClick={() => handleImageClick(menu)}>
                                <div className={styles.historyThumb}>
                                    <img
                                        src={`/api/s3/files?key=${menu.image_url}&t=${new Date(menu.updated_at).getTime()}`}
                                        alt="Thumb"
                                    />
                                </div>
                                <div className={styles.historyInfo}>
                                    <div className={styles.historyDate}>{formatDate(menu.week_start_date)}</div>
                                    <div className={styles.historyMeta}>업데이트: {new Date(menu.updated_at).toLocaleDateString()}</div>
                                </div>
                                {user && (
                                    <div className={styles.itemActions}>
                                        <button onClick={(e) => handleEditClick(menu, e)} className={styles.iconBtn}>수정</button>
                                        <button onClick={(e) => handleDelete(menu, e)} className={styles.iconBtnDanger}>삭제</button>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}

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
                        <h3>{targetMenu ? '식단표 수정' : '새 식단표 등록'}</h3>
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
                                />
                            </div>

                            <div className={styles.formGroup}>
                                <label>식단 이미지 파일</label>
                                <input
                                    type="file"
                                    accept="image/*"
                                    onChange={e => setFile(e.target.files[0])}
                                    required={!targetMenu}
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

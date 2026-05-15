'use client';
import styles from '../app/(main)/employees/(intranet)/intranet.module.css';

export default function ContactFilterBar({ 
    searchKeyword, 
    setSearchKeyword, 
    categoryFilter, 
    setCategoryFilter, 
    categoryOptions = [] 
}) {
    return (
        <div className={`${styles.filterBar} ${categoryOptions.length === 0 ? styles.filterBarSingle : ''}`}>
            {categoryOptions.length > 0 && (
                <select 
                    className={`${styles.input} ${styles.filterSelect}`}
                    value={categoryFilter} 
                    onChange={(e) => setCategoryFilter(e.target.value)}
                >
                    <option value="">전체 (구분)</option>
                    {categoryOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                </select>
            )}
            
            <div className={styles.searchBox}>
                <input 
                    type="text" 
                    className={`${styles.input} ${styles.searchInput}`}
                    placeholder="이름, 회사명, 연락처 등으로 검색..." 
                    value={searchKeyword} 
                    onChange={(e) => setSearchKeyword(e.target.value)} 
                />
                <span className={styles.searchIcon}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                </span>
                {searchKeyword && (
                    <button 
                        onClick={() => setSearchKeyword('')} 
                        className={styles.clearSearch}
                        aria-label="검색어 지우기"
                    >
                        ×
                    </button>
                )}
            </div>
        </div>
    );
}

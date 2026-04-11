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
        <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
            {categoryOptions.length > 0 && (
                <select 
                    className={styles.input} 
                    style={{ width: '140px', padding: '6px 12px', height: '36px' }}
                    value={categoryFilter} 
                    onChange={(e) => setCategoryFilter(e.target.value)}
                >
                    <option value="">전체 (구분)</option>
                    {categoryOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                </select>
            )}
            
            <div style={{ display: 'flex', flex: 1, minWidth: '200px', position: 'relative' }}>
                <input 
                    type="text" 
                    className={styles.input} 
                    style={{ padding: '6px 12px', height: '36px', width: '100%', paddingLeft: '32px' }}
                    placeholder="이름, 회사명, 연락처 등으로 검색..." 
                    value={searchKeyword} 
                    onChange={(e) => setSearchKeyword(e.target.value)} 
                />
                <span style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', opacity: 0.4, pointerEvents: 'none', display: 'flex' }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                </span>
                {searchKeyword && (
                    <button 
                        onClick={() => setSearchKeyword('')} 
                        style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', opacity: 0.5, fontSize: '0.85rem', color: '#475569', fontWeight: 700 }}
                    >
                        ×
                    </button>
                )}
            </div>
        </div>
    );
}

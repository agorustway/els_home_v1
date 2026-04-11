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
                <span style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', opacity: 0.5 }}>
                    🔍
                </span>
                {searchKeyword && (
                    <button 
                        onClick={() => setSearchKeyword('')} 
                        style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', opacity: 0.5 }}
                    >
                        ✖
                    </button>
                )}
            </div>
        </div>
    );
}

'use client';

import styles from '@/app/(main)/employees/(intranet)/intranet.module.css';

export function DetailHero({ avatar, title, subtitle, badges = [], children }) {
    return (
        <section className={styles.detailHero}>
            {avatar && <div className={styles.detailHeroAvatar}>{avatar}</div>}
            <div className={styles.detailHeroBody}>
                <div className={styles.detailHeroKicker}>{subtitle}</div>
                <h2 className={styles.detailHeroTitle}>{title || '-'}</h2>
                {badges.length > 0 && (
                    <div className={styles.detailBadgeRow}>
                        {badges.filter(Boolean).map((badge, index) => (
                            <span key={`${badge}-${index}`} className={styles.detailBadge}>{badge}</span>
                        ))}
                    </div>
                )}
                {children}
            </div>
        </section>
    );
}

export function DetailGrid({ children, columns = 2 }) {
    return (
        <div className={styles.detailGrid} data-columns={columns}>
            {children}
        </div>
    );
}

export function DetailField({ label, value, children, tone = 'default', wide = false }) {
    return (
        <div className={`${styles.detailField} ${wide ? styles.detailFieldWide : ''}`} data-tone={tone}>
            <div className={styles.detailLabel}>{label}</div>
            <div className={styles.detailValue}>{children || value || '-'}</div>
        </div>
    );
}

export function DetailSection({ title, children, muted = false }) {
    return (
        <section className={`${styles.detailSection} ${muted ? styles.detailSectionMuted : ''}`}>
            {title && <h3 className={styles.detailSectionTitle}>{title}</h3>}
            <div className={styles.detailSectionBody}>{children}</div>
        </section>
    );
}

export function AttachmentList({ files = [], emptyText = '첨부된 파일이 없습니다.' }) {
    if (!files.length) {
        return <div className={styles.emptyInline}>{emptyText}</div>;
    }

    return (
        <div className={styles.fileList}>
            {files.map((file, index) => (
                <a
                    key={`${file.name || 'file'}-${index}`}
                    href={file.href || file.url || file.path}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={styles.fileLink}
                    download={file.download}
                >
                    <span className={styles.fileName}>
                        {file.category && <strong>{file.category}</strong>}
                        {file.name || '파일'}
                    </span>
                    <span className={styles.fileAction}>열기</span>
                </a>
            ))}
        </div>
    );
}

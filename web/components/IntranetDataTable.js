'use client';

import styles from '@/app/(main)/employees/(intranet)/intranet.module.css';

export function PhoneLink({ value, children }) {
    if (!value) return <span className={styles.mutedText}>-</span>;

    const handleClick = (event) => {
        event.stopPropagation();
        navigator.clipboard?.writeText(String(value));
    };

    return (
        <a href={`tel:${value}`} onClick={handleClick} className={styles.phoneLink}>
            {children || value}
        </a>
    );
}

export function DataBadge({ children, tone = 'neutral' }) {
    if (!children) return <span className={styles.mutedText}>-</span>;
    return <span className={`${styles.dataBadge} ${styles[`dataBadge_${tone}`] || ''}`}>{children}</span>;
}

export function InitialAvatar({ name, src, size = 'md', label = '' }) {
    const initial = String(name || label || '-').trim().charAt(0) || '-';
    return (
        <span className={`${styles.avatarCell} ${styles[`avatarCell_${size}`] || ''}`}>
            {src ? <img src={src} alt={label || name || ''} /> : <span>{initial}</span>}
        </span>
    );
}

export default function IntranetDataTable({
    columns,
    rows,
    emptyText = '검색 결과가 없습니다.',
    getRowKey = (row) => row.id,
    onRowClick,
    rowClassName,
    rowStyle,
    ariaLabel,
}) {
    return (
        <div className={styles.tableFrame}>
            <table className={styles.dataTable} aria-label={ariaLabel}>
                <colgroup>
                    {columns.map((column) => (
                        <col key={column.key} className={column.colClassName || ''} />
                    ))}
                </colgroup>
                <thead>
                    <tr>
                        {columns.map((column) => (
                            <th
                                key={column.key}
                                className={column.headerClassName || ''}
                                data-align={column.align || undefined}
                            >
                                {column.header}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {rows.map((row, index) => (
                        <tr
                            key={getRowKey(row, index)}
                            className={`${onRowClick ? styles.dataRow : styles.dataRowStatic} ${rowClassName ? rowClassName(row, index) : ''}`}
                            style={rowStyle ? rowStyle(row, index) : undefined}
                            onClick={() => onRowClick?.(row, index)}
                        >
                            {columns.map((column) => (
                                <td
                                    key={column.key}
                                    className={column.cellClassName || ''}
                                    data-align={column.align || undefined}
                                >
                                    {column.render ? column.render(row, index) : row[column.key]}
                                </td>
                            ))}
                        </tr>
                    ))}
                    {rows.length === 0 && (
                        <tr>
                            <td colSpan={columns.length} className={styles.empty}>
                                {emptyText}
                            </td>
                        </tr>
                    )}
                </tbody>
            </table>
        </div>
    );
}

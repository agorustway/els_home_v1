'use client';

import { useEffect } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { logActivity } from '@/utils/logger';

export default function ActivityLogger() {
    const pathname = usePathname();
    const searchParams = useSearchParams();

    useEffect(() => {
        const url = pathname + (searchParams.toString() ? `?${searchParams.toString()}` : '');
        logActivity('PAGE_VIEW', url);
    }, [pathname, searchParams]);

    // Optional: Global click tracking
    useEffect(() => {
        const handleGlobalClick = (e) => {
            const target = e.target;
            // Only log if it's a significant element like a button or link
            if (target.tagName === 'BUTTON' || target.tagName === 'A' || target.closest('button') || target.closest('a')) {
                const text = target.innerText?.trim().substring(0, 50) || 'Unknown Element';
                logActivity('CLICK', window.location.pathname, {
                    element: target.tagName,
                    text: text
                });
            }
        };

        window.addEventListener('click', handleGlobalClick);
        return () => window.removeEventListener('click', handleGlobalClick);
    }, []);

    return null; // This component doesn't render anything
}

import { Suspense } from 'react';
import ArchiveBrowser from './ArchiveBrowser';

export default function ArchivePage() {
    return (
        <Suspense fallback={<div>Loading...</div>}>
            <ArchiveBrowser />
        </Suspense>
    );
}
import { redirect } from 'next/navigation';

export const metadata = {
    title: '데이터 운영 관리 | ELS 인트라넷',
};

export default function DataRetentionRedirectPage() {
    redirect('/admin/data-operations');
}

import { redirect } from 'next/navigation';

export default function EmployeesPage() {
    // 구버전 인트라넷 홈 대신 새로운 메인인 날씨 페이지로 자동 리다이렉트
    redirect('/employees/weather');
}
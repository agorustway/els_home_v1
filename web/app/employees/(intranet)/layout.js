import EmployeeSidebar from '@/components/EmployeeSidebar';

export default function EmployeeLayout({ children }) {
    return (
        <div style={{ display: 'flex', minHeight: '100vh' }}>
            <EmployeeSidebar />
            <main style={{ flex: 1, backgroundColor: '#f5f7fb', padding: '40px' }}>
                {children}
            </main>
        </div>
    );
}

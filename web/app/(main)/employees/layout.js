/** 임직원 구간은 SiteLayout에서 EmployeeHeader·IntranetSubNav·EmployeeSidebar로 감싸므로 여기서는 children만 전달 */
export default function EmployeesRootLayout({ children }) {
    return <>{children}</>;
}

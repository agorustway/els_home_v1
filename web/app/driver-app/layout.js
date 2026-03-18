export default function DriverAppLayout({ children }) {
  return (
    <div id="driver-app-root" style={{ width: '100vw', height: '100vh', overflow: 'auto', background: '#f8fafc' }}>
      {children}
    </div>
  );
}

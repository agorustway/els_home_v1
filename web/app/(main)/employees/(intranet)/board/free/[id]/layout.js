// Static export용: 드라이버 앱(APK) 빌드 시 동적 board 경로 제외
export async function generateStaticParams() { return []; }

export default function BoardPostLayout({ children }) {
  return children;
}

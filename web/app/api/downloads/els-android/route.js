import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const FILENAME = 'els-container-history.apk';
const PUBLIC_PATH = path.join(process.cwd(), 'public', 'downloads', FILENAME);

const NOT_FOUND_HTML = `
<!DOCTYPE html>
<html lang="ko">
<head><meta charset="utf-8"><title>다운로드 불가</title></head>
<body style="font-family: sans-serif; padding: 2rem; max-width: 480px; margin: 0 auto;">
  <h1>설치 파일이 없습니다</h1>
  <p>Android 앱(.apk)이 아직 서버에 올라와 있지 않습니다.</p>
  <p>관리자에게 문의하시거나, 프로젝트에서 apk를 빌드·배포한 뒤 받으세요.</p>
  <p><a href="/employees/container-history">← 컨테이너 이력조회로 돌아가기</a></p>
</body>
</html>
`;

export async function GET() {
    try {
        if (!fs.existsSync(PUBLIC_PATH)) {
            return new NextResponse(NOT_FOUND_HTML.trim(), {
                status: 404,
                headers: { 'Content-Type': 'text/html; charset=utf-8' },
            });
        }
        const buf = fs.readFileSync(PUBLIC_PATH);
        return new NextResponse(buf, {
            headers: {
                'Content-Type': 'application/vnd.android.package-archive',
                'Content-Disposition': `attachment; filename="${FILENAME}"`,
            },
        });
    } catch (e) {
        return new NextResponse(NOT_FOUND_HTML.trim(), {
            status: 500,
            headers: { 'Content-Type': 'text/html; charset=utf-8' },
        });
    }
}

import { NextResponse } from 'next/server';
import { listFiles, createFolder, deleteFile, moveFile, copyFile, getNasClient } from '@/lib/nas';
import { createClient } from '@/utils/supabase/server';
import { ROLE_LABELS } from '@/utils/roles';
import { Readable } from 'stream';

// Helper to check for Korean characters
const hasKorean = (text) => /[ㄱ-ㅎ|ㅏ-ㅣ|가-힣]/.test(text);

// Helper to check if file is hidden or system temp
const isHiddenOrTemp = (name) => {
    const normalizedName = String(name || '').trim();
    const lowerName = normalizedName.toLowerCase();
    return (
        normalizedName.startsWith('.') ||
        normalizedName.startsWith('~') ||
        normalizedName.startsWith('._') ||
        lowerName === 'thumbs.db' ||
        lowerName === 'desktop.ini' ||
        lowerName === '.ds_store' ||
        lowerName === 'lost+found' ||
        lowerName === '#recycle' ||
        lowerName === '@eadir' ||
        lowerName === '@recycle' ||
        lowerName === '$recycle.bin' ||
        lowerName.includes('recycle bin')
    );
};

// Branch naming map for NAS folders
const BRANCH_FOLDER_MAP = {
    headquarters: '서울본사',
    asan: '아산지점',
    asan_cy: '아산CY',
    jungbu: '중부지점',
    dangjin: '당진지점',
    yesan: '예산지점',
    seosan: '서산지점',
    yeoncheon: '영천지점',
    ulsan: '울산지점',
    imgo: '임고지점',
    bulk: '벌크사업부'
};

/**
 * Access Control Logic:
 * 1. Admin: Every normal file/folder is accessible.
 * 2. Security Folders: Only visible if user belongs to the branch AND has can_read_security = true.
 * 3. Branch users can access only their own branch folder and shared roots.
 * 4. Filtering: Hide temp/system/recycle files for every web user.
 */
function getPermissions(userRole, userCanSecurity, path) {
    if (userRole === 'admin') return { canRead: true, canWrite: true };
    if (!userRole || userRole === 'visitor') return { canRead: false, canWrite: false };

    const userBranchName = BRANCH_FOLDER_MAP[userRole];
    const normalizedPath = path.replace(/^\//, ''); // Remove leading slash
    const rootFolder = normalizedPath.split('/')[0];
    if (!rootFolder) return { canRead: true, canWrite: false };
    if (!userBranchName) return { canRead: false, canWrite: false };

    // Visibility Check (Security Folders - Using Underscore)
    if (rootFolder.endsWith('_보안')) {
        const securityBranch = rootFolder.replace('_보안', '');
        // Check 1: Must be user's own branch
        // Check 2: Must have security access permission (can_read_security)
        if (securityBranch !== userBranchName || !userCanSecurity) {
            return { canRead: false, canWrite: false }; // Completely hidden
        }
        return { canRead: true, canWrite: false };
    }

    const readableRoots = new Set([userBranchName, '자료실', '공지사항_첨부']);
    if (!readableRoots.has(rootFolder)) return { canRead: false, canWrite: false };

    return { canRead: true, canWrite: true };
}

const getBaseName = (targetPath) => String(targetPath || '').split('/').filter(Boolean).pop() || '';

export async function GET(request) {
    const { searchParams } = new URL(request.url);
    const path = searchParams.get('path') || '/';
    const isDownload = searchParams.get('download') === 'true';

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    try {
        const { data: roleData } = await supabase.from('user_roles').select('role, can_read_security').eq('email', user.email).single();
        const userRole = roleData?.role || 'visitor';
        const userCanSecurity = roleData?.can_read_security || false;
        const isAdmin = userRole === 'admin';

        // 1. Download Mode
        if (isDownload) {
            if (isHiddenOrTemp(getBaseName(path))) {
                return NextResponse.json({ error: 'File not found' }, { status: 404 });
            }

            const perms = getPermissions(userRole, userCanSecurity, path);
            if (!perms.canRead) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

            const client = getNasClient();
            if (!await client.exists(path)) return NextResponse.json({ error: 'File not found' }, { status: 404 });

            const stream = await client.createReadStream(path);
            const fileName = searchParams.get('name') || path.split('/').pop();
            const encodedFileName = encodeURIComponent(fileName);
            // safeName for legacy browsers (ASCII only)
            const safeName = fileName.replace(/[^\x20-\x7E]/g, '_');

            // Better Content-Type mapping
            let finalContentType = 'application/octet-stream';
            const ext = fileName.split('.').pop().toLowerCase();
            const mimeMap = {
                'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                'xls': 'application/vnd.ms-excel',
                'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                'doc': 'application/msword',
                'pdf': 'application/pdf',
                'png': 'image/png',
                'jpg': 'image/jpeg',
                'jpeg': 'image/jpeg',
                'gif': 'image/gif',
                'txt': 'text/plain',
                'csv': 'text/csv',
                'zip': 'application/zip'
            };
            finalContentType = mimeMap[ext] || 'application/octet-stream';

            // Convert Node.js stream to Web ReadableStream for Next.js
            const webStream = Readable.toWeb(stream);

            return new NextResponse(webStream, {
                headers: {
                    'Content-Type': finalContentType,
                    'Content-Disposition': `attachment; filename="${safeName}"; filename*=UTF-8''${encodedFileName}`,
                    'Cache-Control': 'no-cache'
                }
            });
        }

        const rawFiles = await listFiles(path);

        // Filter Logic
        const filteredFiles = rawFiles.filter(file => {
            // 1. Hide Hidden/Temp files for every web user, including admins.
            if (isHiddenOrTemp(file.name)) return false;

            // Admin sees every normal file/folder.
            if (isAdmin) return true;

            // 2. Korean Folder Rule (at Root or specific levels)
            // Rule: "한글로된 폴더만 보일것"
            if (file.type === 'directory' && !hasKorean(file.name)) return false;

            // 3. Security Folder Visibility
            const perms = getPermissions(userRole, userCanSecurity, file.path);
            if (!perms.canRead) return false;

            return true;
        });

        return NextResponse.json({ files: filteredFiles });
    } catch (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function POST(request) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    try {
        const { data: roleData } = await supabase.from('user_roles').select('role, can_read_security').eq('email', user.email).single();
        const userRole = roleData?.role || 'visitor';
        const userCanSecurity = roleData?.can_read_security || false;

        const contentType = request.headers.get('content-type') || '';

        // Handle JSON body (mkdir, copy)
        if (contentType.includes('application/json')) {
            const json = await request.json();
            const targetPath = json.path || json.to;
            if (isHiddenOrTemp(getBaseName(targetPath))) {
                return NextResponse.json({ error: '임시/시스템 파일명은 자료실에서 사용할 수 없습니다.' }, { status: 400 });
            }
            if (json.from && isHiddenOrTemp(getBaseName(json.from))) {
                return NextResponse.json({ error: '임시/시스템 파일은 자료실에서 처리할 수 없습니다.' }, { status: 404 });
            }

            if (json.from) {
                const sourcePerms = getPermissions(userRole, userCanSecurity, json.from);
                if (!sourcePerms.canRead) {
                    return NextResponse.json({ error: 'Forbidden: 원본 항목을 읽을 권한이 없습니다.' }, { status: 403 });
                }
            }

            const perms = getPermissions(userRole, userCanSecurity, targetPath);
            if (!perms.canWrite) {
                return NextResponse.json({ error: 'Forbidden: 해당 폴더에 쓰기 권한이 없습니다.' }, { status: 403 });
            }

            if (json.type === 'mkdir') {
                await createFolder(json.path);
                return NextResponse.json({ success: true });
            }
            if (json.type === 'copy') {
                await copyFile(json.from, json.to);
                return NextResponse.json({ success: true });
            }
        }

        // Handle File Upload via FormData
        if (contentType.includes('multipart/form-data')) {
            const formData = await request.formData();
            const file = formData.get('file');
            const path = formData.get('path') || '/';
            if (file?.name && isHiddenOrTemp(file.name)) {
                return NextResponse.json({ error: '임시/시스템 파일은 업로드할 수 없습니다.' }, { status: 400 });
            }

            const perms = getPermissions(userRole, userCanSecurity, path);
            if (!perms.canWrite) {
                return NextResponse.json({ error: 'Forbidden: 해당 폴더에 업로드 권한이 없습니다.' }, { status: 403 });
            }

            if (file) {
                const buffer = Buffer.from(await file.arrayBuffer());
                const filePath = `${path}/${file.name}`.replace(/\/\//g, '/');

                const client = getNasClient();
                await client.putFileContents(filePath, buffer);

                return NextResponse.json({ success: true, path: filePath });
            }
        }

        return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    } catch (error) {
        console.error('NAS API POST Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function DELETE(request) {
    const { searchParams } = new URL(request.url);
    const path = searchParams.get('path');

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    try {
        const { data: roleData } = await supabase.from('user_roles').select('role').eq('email', user.email).single();
        const userRole = roleData?.role || 'visitor';
        if (isHiddenOrTemp(getBaseName(path))) {
            return NextResponse.json({ error: 'File not found' }, { status: 404 });
        }

        // Policy: Web Deletion Forbidden for non-admins
        if (userRole !== 'admin') {
            return NextResponse.json({
                error: '삭제는 웹에서 불가합니다. 삭제 처리는 사무실 PC를 이용해 주시기 바랍니다.',
                details: 'DELETE_FORBIDDEN_WEB'
            }, { status: 403 });
        }

        await deleteFile(path);
        return NextResponse.json({ success: true });
    } catch (e) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}

export async function PATCH(request) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    try {
        const { data: roleData } = await supabase.from('user_roles').select('role, can_read_security').eq('email', user.email).single();
        const userRole = roleData?.role || 'visitor';
        const userCanSecurity = roleData?.can_read_security || false;
        const { from, to } = await request.json();
        if (isHiddenOrTemp(getBaseName(to))) {
            return NextResponse.json({ error: '임시/시스템 파일명은 자료실에서 사용할 수 없습니다.' }, { status: 400 });
        }
        if (isHiddenOrTemp(getBaseName(from))) {
            return NextResponse.json({ error: '임시/시스템 파일은 자료실에서 처리할 수 없습니다.' }, { status: 404 });
        }

        const sourcePerms = getPermissions(userRole, userCanSecurity, from);
        if (!sourcePerms.canRead) {
            return NextResponse.json({ error: 'Forbidden: 원본 항목을 읽을 권한이 없습니다.' }, { status: 403 });
        }

        // Check Write Permission on Destination
        const perms = getPermissions(userRole, userCanSecurity, to);
        if (!perms.canWrite) {
            return NextResponse.json({ error: 'Forbidden: 해당 위치로 이동권한이 없습니다.' }, { status: 403 });
        }

        await moveFile(from, to);
        return NextResponse.json({ success: true });
    } catch (e) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}


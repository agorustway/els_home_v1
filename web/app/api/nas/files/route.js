import { NextResponse } from 'next/server';
import { listFiles, createFolder, deleteFile, moveFile, copyFile, getNasClient } from '@/lib/nas';
import { createClient } from '@/utils/supabase/server';
import { ROLE_LABELS } from '@/utils/roles';

// Helper to check for Korean characters
const hasKorean = (text) => /[ㄱ-ㅎ|ㅏ-ㅣ|가-힣]/.test(text);

// Helper to check if file is hidden or system temp
const isHiddenOrTemp = (name) => {
    return name.startsWith('.') || name.startsWith('~$') || name.toLowerCase().includes('thumbs.db') || name.toLowerCase().includes('desktop.ini') || name.toLowerCase() === 'lost+found';
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
    yeoncheon: '연천지점',
    ulsan: '울산지점',
    imgo: '임고지점',
    bulk: '벌크사업부'
};

/**
 * Access Control Logic:
 * 1. Admin: Everything accessible.
 * 2. Security Folders: Only visible to the specific branch (e.g., '아산지점-보안' only for 'asan').
 * 3. Write Permission: 
 *    - Branch users can write to their own branch folder and '자료실' (Common).
 *    - Others are read-only.
 * 4. Filtering: Hide system files/folders and non-Korean folders at root level.
 */
function getPermissions(userRole, path) {
    if (userRole === 'admin') return { canRead: true, canWrite: true };
    if (!userRole || userRole === 'visitor') return { canRead: false, canWrite: false };

    const userBranchName = BRANCH_FOLDER_MAP[userRole];
    const normalizedPath = path.replace(/^\//, ''); // Remove leading slash
    const rootFolder = normalizedPath.split('/')[0];

    // Visibility Check (Security Folders)
    if (rootFolder.endsWith('-보안')) {
        const securityBranch = rootFolder.replace('-보안', '');
        if (securityBranch !== userBranchName) {
            return { canRead: false, canWrite: false }; // Completely hidden
        }
    }

    // Write Permission Check
    let canWrite = false;
    if (rootFolder === userBranchName || rootFolder === '자료실') {
        canWrite = true;
    }

    return { canRead: true, canWrite };
}

export async function GET(request) {
    const { searchParams } = new URL(request.url);
    const path = searchParams.get('path') || '/';

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    try {
        const { data: roleData } = await supabase.from('user_roles').select('role').eq('id', user.id).single();
        const userRole = roleData?.role || 'visitor';

        const rawFiles = await listFiles(path);

        // Filter Logic
        const filteredFiles = rawFiles.filter(file => {
            // 1. Hide Hidden/Temp files
            if (isHiddenOrTemp(file.name)) return false;

            // 2. Korean Folder Rule (at Root or specific levels)
            // Rule: "한글로된 폴더만 보일것"
            if (file.type === 'directory' && !hasKorean(file.name)) return false;

            // 3. Security Folder Visibility
            const perms = getPermissions(userRole, file.path);
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
        const { data: roleData } = await supabase.from('user_roles').select('role').eq('id', user.id).single();
        const userRole = roleData?.role || 'visitor';

        const contentType = request.headers.get('content-type') || '';

        // Handle JSON body (mkdir, copy)
        if (contentType.includes('application/json')) {
            const json = await request.json();
            const targetPath = json.path || json.to;

            const perms = getPermissions(userRole, targetPath);
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

            const perms = getPermissions(userRole, path);
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
        const { data: roleData } = await supabase.from('user_roles').select('role').eq('id', user.id).single();
        const userRole = roleData?.role || 'visitor';

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
        const { data: roleData } = await supabase.from('user_roles').select('role').eq('id', user.id).single();
        const userRole = roleData?.role || 'visitor';
        const { from, to } = await request.json();

        // Check Write Permission on Destination
        const perms = getPermissions(userRole, to);
        if (!perms.canWrite) {
            return NextResponse.json({ error: 'Forbidden: 해당 위치로 이동권한이 없습니다.' }, { status: 403 });
        }

        await moveFile(from, to);
        return NextResponse.json({ success: true });
    } catch (e) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}

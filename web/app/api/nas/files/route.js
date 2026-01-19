import { NextResponse } from 'next/server';
import { getNasClient } from '@/lib/nas';
import { createClient } from '@/utils/supabase/server';
import { getRoleLabel } from '@/utils/roles';

export async function GET(request) {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const path = searchParams.get('path') || '/';

    try {
        const { data: roleData } = await supabase
            .from('user_roles')
            .select('*')
            .eq('id', user.id)
            .single();

        const userRole = roleData?.role || 'visitor';
        const userLabel = getRoleLabel(userRole);
        const canReadSecurity = roleData?.can_read_security || userRole === 'admin';

        console.log('Fetching NAS files for path:', path, 'User Role:', userRole);
        const client = getNasClient();
        const directoryItems = await client.getDirectoryContents(path);

        const files = directoryItems
            .filter(item => item.basename !== '' && item.basename !== '.' && item.basename !== path.split('/').pop())
            .map(item => ({
                name: item.basename,
                type: item.type, // 'directory' or 'file'
                size: item.size,
                lastMod: item.lastmod,
                mime: item.mime,
                path: item.filename
            }))
            .filter(file => {
                const name = file.name.toLowerCase();

                // 1. Always hide system/junk files for everyone for a clean view
                if (name.includes('$recycle') || name.includes('#recycle') || name === 'thumbs.db') return false;

                // 2. Admin sees everything else (except junk above)
                if (userRole === 'admin') return true;

                // 3. Hide hidden/temp files for non-admins
                if (name.startsWith('.') || name.startsWith('~$')) return false;

                // 4. Hide purely English folders/files or System folders
                const hasKorean = /[ㄱ-ㅎ|ㅏ-ㅣ|가-힣]/.test(file.name);
                if (file.name === 'ELSWEBAPP') return false;
                if (!hasKorean && (file.name === 'home' || file.name === 'Public' || file.name.startsWith('webdav'))) {
                    return false;
                }

                // 5. Security folder filtering
                if (file.name.includes('_보안') || file.name.includes('-보안')) {
                    if (!canReadSecurity) return false;
                    if (!file.name.includes(userLabel)) return false;
                }

                // 6. Root level filtering
                if (path === '/') {
                    if (userRole === 'visitor') return false;
                    if (file.name === '자료실') return true;

                    const generalFolders = ['공용', 'Notice'];
                    const isBranchFolder = file.name.includes(userLabel);
                    const isGeneralFolder = generalFolders.some(g => file.name.toLowerCase() === g.toLowerCase());

                    if (!isBranchFolder && !isGeneralFolder) return false;
                }

                return true;
            })
            .sort((a, b) => {
                if (a.type === 'directory' && b.type !== 'directory') return -1;
                if (a.type !== 'directory' && b.type === 'directory') return 1;
                return a.name.localeCompare(b.name, 'ko');
            });

        return NextResponse.json({ files });
    } catch (error) {
        console.error('NAS Error Details:', error);
        return NextResponse.json({
            error: 'Failed to fetch files from NAS',
            details: error.message
        }, { status: 500 });
    }
}

export async function POST(request) {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const { data: roleData } = await supabase
            .from('user_roles')
            .select('*')
            .eq('id', user.id)
            .single();

        const userRole = roleData?.role || 'visitor';
        const userLabel = getRoleLabel(userRole);
        const canWrite = roleData?.can_write || userRole === 'admin';

        const checkCanWrite = (targetPath) => {
            if (canWrite) return true;
            if (userRole === 'visitor') return false;

            // Allow writing to /자료실, /ELSWEBAPP, and shared folders
            if (targetPath.startsWith('/자료실') || targetPath.startsWith('/ELSWEBAPP')) return true;
            if (targetPath.startsWith('/공용') || targetPath.startsWith('/Notice')) return true;

            // Allow writing to their own branch folder
            if (userLabel && targetPath.includes(userLabel)) return true;

            return false;
        };

        const contentType = request.headers.get('content-type') || '';
        const client = getNasClient();

        if (contentType.includes('application/json')) {
            const body = await request.json();
            const { type, path: targetPath, from, to } = body;

            if (type === 'mkdir') {
                if (!checkCanWrite(targetPath)) return NextResponse.json({ error: '쓰기 권한이 없습니다.' }, { status: 403 });

                if (await client.exists(targetPath) === false) {
                    await client.createDirectory(targetPath);
                }
                return NextResponse.json({ success: true });
            } else if (type === 'copy') {
                if (!from || !to) return NextResponse.json({ error: 'From/To required' }, { status: 400 });

                if (!checkCanWrite(to)) return NextResponse.json({ error: '쓰기 권한이 없습니다.' }, { status: 403 });

                await client.copyFile(from, to);
                return NextResponse.json({ success: true });
            }
        } else if (contentType.includes('multipart/form-data')) {
            const formData = await request.formData();
            const file = formData.get('file');
            const targetPath = formData.get('path') || '/';

            if (!checkCanWrite(targetPath)) return NextResponse.json({ error: '쓰기 권한이 없습니다.' }, { status: 403 });
            if (!file) return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });

            const buffer = Buffer.from(await file.arrayBuffer());
            const fileName = file.name;
            const fullPath = `${targetPath}/${fileName}`.replace(/\/+/g, '/');

            // Auto-create directories
            const pathParts = targetPath.split('/').filter(p => p);
            let currentPath = '';
            for (const part of pathParts) {
                currentPath += `/${part}`;
                if (await client.exists(currentPath) === false) {
                    await client.createDirectory(currentPath);
                }
            }

            await client.putFileContents(fullPath, buffer, { overwrite: false });
            return NextResponse.json({ success: true, path: fullPath });
        }

        return NextResponse.json({ error: 'Invalid operation' }, { status: 400 });
    } catch (error) {
        console.error('NAS Write Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function PATCH(request) {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const { from, to } = await request.json();
        if (!from || !to) return NextResponse.json({ error: 'From/To required' }, { status: 400 });

        const { data: roleData } = await supabase.from('user_roles').select('*').eq('id', user.id).single();
        const userRole = roleData?.role || 'visitor';
        const userLabel = getRoleLabel(userRole);
        const canWrite = roleData?.can_write || userRole === 'admin';

        const checkCanWriteInternal = (targetPath) => {
            if (canWrite) return true;
            if (userRole === 'visitor') return false;
            if (targetPath.startsWith('/자료실') || targetPath.startsWith('/ELSWEBAPP')) return true;
            if (targetPath.startsWith('/공용') || targetPath.startsWith('/Notice')) return true;
            if (userLabel && targetPath.includes(userLabel)) return true;
            return false;
        };

        if (!checkCanWriteInternal(from)) return NextResponse.json({ error: '이름 변경 권한이 없습니다.' }, { status: 403 });

        const client = getNasClient();
        await client.moveFile(from, to);
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('NAS Rename Error:', error);
        return NextResponse.json({ error: 'Failed to rename' }, { status: 500 });
    }
}

export async function DELETE(request) {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const { searchParams } = new URL(request.url);
        const path = searchParams.get('path');
        if (!path) return NextResponse.json({ error: 'Path is required' }, { status: 400 });

        const { data: roleData } = await supabase.from('user_roles').select('*').eq('id', user.id).single();
        const userRole = roleData?.role || 'visitor';
        const userLabel = getRoleLabel(userRole);
        const canDelete = roleData?.can_delete || userRole === 'admin';

        const checkCanDeleteInternal = (targetPath) => {
            if (canDelete) return true;
            if (userRole === 'visitor') return false;
            // Employees can delete in Jaryosil or their branch folder
            if (targetPath.startsWith('/자료실')) return true;
            if (userLabel && targetPath.includes(userLabel)) return true;
            return false;
        };

        if (!checkCanDeleteInternal(path)) return NextResponse.json({ error: '삭제 권한이 없습니다.' }, { status: 403 });

        const client = getNasClient();
        if (await client.exists(path)) {
            await client.deleteFile(path);
        }
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('NAS Delete Error:', error);
        return NextResponse.json({ error: 'Failed to delete' }, { status: 500 });
    }
}

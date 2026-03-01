import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';
import ExcelJS from 'exceljs';

export async function POST(request) {
    const supabase = await createClient();

    // 권한 확인 (관리자, 혹은 쓰기/쓰기 권한이 있는지) -> 일단 전체 권한 허용 유저만
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: roleData } = await supabase.from('user_roles').select('can_write, role').eq('id', user.id).single();
    if (roleData?.role !== 'admin' && !roleData?.can_write) {
        return NextResponse.json({ error: '쓰기 권한이 필요합니다.' }, { status: 403 });
    }

    try {
        const formData = await request.formData();
        const file = formData.get('file');

        if (!file || !file.name) {
            return NextResponse.json({ error: '파일이 없습니다.' }, { status: 400 });
        }

        const buffer = await file.arrayBuffer();
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(Buffer.from(buffer));

        let totalInserted = 0;
        let totalUpdated = 0;
        let errors = [];

        // 데이터 파싱 헬퍼
        const getVal = (row, colIndex) => {
            const cell = row.getCell(colIndex);
            if (cell.type === ExcelJS.ValueType.Formula) {
                return cell.result ? String(cell.result).trim() : '';
            }
            return cell.value ? String(cell.value).trim() : '';
        };

        const processSheet = async (sheetName, tableName, requiredColIndex, mapFunction) => {
            const sheet = workbook.getWorksheet(sheetName);
            if (!sheet) return;

            const rowsToUpsert = [];

            // 1번 줄은 Header
            sheet.eachRow((row, rowNumber) => {
                if (rowNumber === 1) return;

                const idVal = getVal(row, 1);
                const reqVal = getVal(row, requiredColIndex);

                // 필수값이 비어있거나 '예시 데이터 입력'인지 확인
                if (!reqVal || reqVal === '예시 데이터 입력') return;

                const dbObj = mapFunction(row);
                if (idVal && idVal.length === 36) {
                    dbObj.id = idVal; // 기존 레코드 업데이트용
                }

                rowsToUpsert.push(dbObj);
            });

            if (rowsToUpsert.length > 0) {
                // Upsert into Supabase
                const { data, error } = await supabase.from(tableName).upsert(rowsToUpsert, { onConflict: 'id', returning: 'representation' }).select('id');
                if (error) {
                    errors.push(`[${sheetName}] 데이터 처리 실패: ${error.message}`);
                    console.error('Upsert Error:', error);
                } else {
                    // 계산(임시로 일괄 성공 처리)
                    const newCount = rowsToUpsert.filter(r => !r.id).length;
                    const updateCount = rowsToUpsert.length - newCount;
                    totalInserted += newCount;
                    totalUpdated += updateCount;
                }
            }
        };

        // 1. 사내연락망 (이름 2번 col 필수)
        await processSheet('사내연락망', 'internal_contacts', 2, (row) => ({
            name: getVal(row, 2),
            department: getVal(row, 3),
            position: getVal(row, 4),
            phone: getVal(row, 5),
            email: getVal(row, 6),
            memo: getVal(row, 7)
        }));

        // 2. 외부연락처 (회사명 2번 col 필수)
        await processSheet('외부연락처', 'external_contacts', 2, (row) => ({
            company_name: getVal(row, 2),
            contact_type: getVal(row, 3),
            address: getVal(row, 4),
            phone: getVal(row, 5),
            email: getVal(row, 6),
            contact_person: getVal(row, 7),
            memo: getVal(row, 8)
        }));

        // 3. 협력사정보 (회사명 2번 col 필수)
        await processSheet('협력사정보', 'partner_contacts', 2, (row) => ({
            company_name: getVal(row, 2),
            ceo_name: getVal(row, 3),
            phone: getVal(row, 4),
            address: getVal(row, 5),
            manager_name: getVal(row, 6),
            manager_phone: getVal(row, 7),
            memo: getVal(row, 8)
        }));

        // 4. 운전원정보 (운전원명 2번 col 필수)
        await processSheet('운전원정보', 'driver_contacts', 2, (row) => ({
            name: getVal(row, 2),
            branch: getVal(row, 3),
            business_number: getVal(row, 4),
            driver_id: getVal(row, 5),
            phone: getVal(row, 6),
            vehicle_type: getVal(row, 7),
            chassis_type: getVal(row, 8)
        }));

        // 5. 작업지안내 (주소 2번 col 필수)
        await processSheet('작업지안내', 'work_sites', 2, (row) => ({
            address: getVal(row, 2),
            contact: getVal(row, 3),
            work_method: getVal(row, 4),
            notes: getVal(row, 5)
        }));

        if (errors.length > 0) {
            return NextResponse.json({ success: true, message: `일부 에러가 있었습니다.\n- 등록: ${totalInserted}건\n- 수정: ${totalUpdated}건\n오류 내용:\n${errors.join('\n')}` });
        }

        return NextResponse.json({ success: true, message: `정상적으로 일괄 적용되었습니다!\n- 신규 등록: ${totalInserted}건\n- 기존 수정: ${totalUpdated}건` });

    } catch (err) {
        console.error(err);
        return NextResponse.json({ error: 'Excel Parsing Error', details: err.message }, { status: 500 });
    }
}

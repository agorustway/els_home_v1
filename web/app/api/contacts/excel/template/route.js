import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';
import ExcelJS from 'exceljs';

export async function GET(request) {
    const supabase = await createClient();

    // 권한 확인 (관리자, 혹은 권한이 있는지)
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'ELS Intranet';
    workbook.lastModifiedBy = 'ELS Intranet';
    workbook.created = new Date();
    workbook.modified = new Date();

    const headerStyle = {
        font: { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 },
        fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } }, // Slate-800
        alignment: { vertical: 'middle', horizontal: 'center' },
        border: {
            top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
            left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
            bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
            right: { style: 'thin', color: { argb: 'FFCBD5E1' } }
        }
    };

    const setupSheet = (sheetName, columns, data) => {
        const sheet = workbook.addWorksheet(sheetName);
        sheet.columns = columns;

        // 스타일 적용 (Header)
        sheet.getRow(1).height = 30;
        sheet.getRow(1).eachCell((cell) => {
            cell.font = headerStyle.font;
            cell.fill = headerStyle.fill;
            cell.alignment = headerStyle.alignment;
            cell.border = headerStyle.border;
        });

        // 데이터 삽입
        if (data && data.length > 0) {
            data.forEach(row => sheet.addRow(row));
        } else {
            // 빈 데이터일 경우 예시 추가
            const exampleRow = {};
            columns.forEach(col => exampleRow[col.key] = col.key === 'id' ? '' : '예시 데이터 입력');
            sheet.addRow(exampleRow);
            sheet.getRow(2).font = { italic: true, color: { argb: 'FF94A3B8' } };
        }

        // 전체 데이터 보더 주기
        sheet.eachRow((row, rowNumber) => {
            if (rowNumber > 1) {
                row.eachCell((cell) => {
                    cell.border = {
                        top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
                        left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
                        bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
                        right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
                    };
                    cell.alignment = { vertical: 'middle' };
                });
            }
        });

        sheet.getColumn('id').hidden = false; // ID 열 표시 여부. 빈 값일 시 신규 추가.
        sheet.getColumn('id').width = 40;
        sheet.getCell('A1').note = '고유 ID입니다. 수정하지 마세요! 비워두면 신규 데이터로 등록됩니다.';
    };

    // 1. 사내연락망
    const { data: internalData } = await supabase.from('internal_contacts').select('id, name, department, position, phone, email, memo').order('created_at', { ascending: true });
    setupSheet('사내연락망', [
        { header: '고유 ID (비워두면 신규)', key: 'id', width: 40 },
        { header: '이름(필수)', key: 'name', width: 15 },
        { header: '부서', key: 'department', width: 20 },
        { header: '직급', key: 'position', width: 15 },
        { header: '연락처', key: 'phone', width: 20 },
        { header: '이메일', key: 'email', width: 25 },
        { header: '메모', key: 'memo', width: 40 },
    ], internalData);

    // 2. 외부연락처
    const { data: externalData } = await supabase.from('external_contacts').select('id, company_name, contact_type, address, phone, email, contact_person, memo').order('created_at', { ascending: true });
    setupSheet('외부연락처', [
        { header: '고유 ID (비워두면 신규)', key: 'id', width: 40 },
        { header: '회사명/소속(필수)', key: 'company_name', width: 25 },
        { header: '구분(고객사등)', key: 'contact_type', width: 15 },
        { header: '주소', key: 'address', width: 40 },
        { header: '대표 연락처', key: 'phone', width: 20 },
        { header: '이메일', key: 'email', width: 25 },
        { header: '담당자명', key: 'contact_person', width: 15 },
        { header: '메모', key: 'memo', width: 40 },
    ], externalData);

    // 3. 협력사정보
    const { data: partnerData } = await supabase.from('partner_contacts').select('id, company_name, ceo_name, phone, address, manager_name, manager_phone, memo').order('created_at', { ascending: true });
    setupSheet('협력사정보', [
        { header: '고유 ID (비워두면 신규)', key: 'id', width: 40 },
        { header: '회사명(필수)', key: 'company_name', width: 25 },
        { header: '대표자명', key: 'ceo_name', width: 15 },
        { header: '대표 연락처', key: 'phone', width: 20 },
        { header: '주소', key: 'address', width: 40 },
        { header: '담당자명', key: 'manager_name', width: 15 },
        { header: '담당자 연락처', key: 'manager_phone', width: 20 },
        { header: '메모', key: 'memo', width: 40 },
    ], partnerData);

    // 4. 운전원정보
    const { data: driverData } = await supabase.from('driver_contacts').select('id, name, branch, business_number, driver_id, phone, vehicle_type, chassis_type').order('created_at', { ascending: true });
    setupSheet('운전원정보', [
        { header: '고유 ID (비워두면 신규)', key: 'id', width: 40 },
        { header: '이름(필수)', key: 'name', width: 15 },
        { header: '소속지점', key: 'branch', width: 15 },
        { header: '영업넘버', key: 'business_number', width: 20 },
        { header: '아이디(E코드)', key: 'driver_id', width: 15 },
        { header: '연락처', key: 'phone', width: 20 },
        { header: '차종', key: 'vehicle_type', width: 20 },
        { header: '샤시종류', key: 'chassis_type', width: 25 },
    ], driverData);

    // 5. 작업지안내
    const { data: siteData } = await supabase.from('work_sites').select('id, address, contact, work_method, notes').order('created_at', { ascending: true });
    setupSheet('작업지안내', [
        { header: '고유 ID (비워두면 신규)', key: 'id', width: 40 },
        { header: '작업지 주소(필수)', key: 'address', width: 50 },
        { header: '담당자 연락처(다수기재가)', key: 'contact', width: 25 },
        { header: '작업방식', key: 'work_method', width: 30 },
        { header: '참고사항', key: 'notes', width: 40 },
    ], siteData);

    const buffer = await workbook.xlsx.writeBuffer();
    return new NextResponse(buffer, {
        status: 200,
        headers: {
            'Content-Disposition': 'attachment; filename="ELS_Contacts_Unified_Template.xlsx"',
            'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        }
    });
}

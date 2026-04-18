import { NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/server';
import path from 'path';
import fs from 'fs';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL
    || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'https://nollae.com');

export async function GET() {
    const result = {
        timestamp: new Date().toISOString(),
        env: {
            SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ? '✅ SET' : '❌ MISSING',
            SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ? '✅ SET' : '❌ MISSING',
            GEMINI_API_KEY: process.env.GEMINI_API_KEY ? '✅ SET' : '❌ MISSING',
            SITE_URL: SITE_URL,
            VERCEL_URL: process.env.VERCEL_URL || 'NOT SET',
            NODE_ENV: process.env.NODE_ENV,
            CWD: process.cwd(),
        },
        sfData: { status: 'checking...' },
        supabase: { status: 'checking...' },
        kskill: { status: 'checking...' },
    };

    // 1. safe-freight.json 로드 테스트
    try {
        const sfData = require('@/public/data/safe-freight.json');
        const fareKeys = Object.keys(sfData.faresLatest || {});
        const asanBusan = fareKeys.filter(k => k.includes('아산') && k.includes('부산')).slice(0, 3);
        result.sfData = {
            status: '✅ Webpack require 성공',
            method: 'require',
            totalFareKeys: fareKeys.length,
            sampleAsanBusan: asanBusan,
            sampleFare: asanBusan[0] ? sfData.faresLatest[asanBusan[0]] : null,
            meta: sfData.meta || null,
        };
    } catch (e1) {
        result.sfData = { status: '⚠️ Webpack require 실패: ' + e1.message, method: 'require_failed' };
        
        // 파일시스템 폴백 테스트
        const paths = [
            path.join(process.cwd(), 'public', 'data', 'safe-freight.json'),
            path.join(process.cwd(), '..', 'public', 'data', 'safe-freight.json'),
        ];
        for (const p of paths) {
            try {
                if (fs.existsSync(p)) {
                    const raw = JSON.parse(fs.readFileSync(p, 'utf-8'));
                    const fareKeys = Object.keys(raw.faresLatest || {});
                    result.sfData = {
                        status: '✅ 파일시스템 폴백 성공',
                        method: 'fs',
                        path: p,
                        totalFareKeys: fareKeys.length,
                    };
                    break;
                }
            } catch (e2) {
                result.sfData.fsFallback = '❌ ' + p + ': ' + e2.message;
            }
        }

        // self-fetch 테스트
        if (result.sfData.method === 'require_failed') {
            try {
                const res = await fetch(`${SITE_URL}/data/safe-freight.json`, { signal: AbortSignal.timeout(10000) });
                result.sfData.selfFetch = res.ok 
                    ? `✅ HTTP ${res.status} (Content-Length: ${res.headers.get('content-length')})` 
                    : `❌ HTTP ${res.status}`;
            } catch (e3) {
                result.sfData.selfFetch = '❌ ' + e3.message;
            }
        }
    }

    // 2. Supabase 연결 테스트
    try {
        const supabase = createAdminClient();
        const { data, error } = await supabase.from('internal_contacts').select('name').limit(1);
        if (error) {
            result.supabase = { status: '❌ 쿼리 에러: ' + error.message };
        } else {
            result.supabase = { status: '✅ 연결 성공', sampleCount: data?.length || 0 };
        }
    } catch (e) {
        result.supabase = { status: '❌ 클라이언트 생성 실패: ' + e.message };
    }

    // 3. K-SKILL 테스트
    try {
        const res = await fetch('https://k-skill-proxy.nomadamas.org/v1/fine-dust/report?regionHint=%EC%95%84%EC%82%B0%20%EB%AA%A8%EC%A2%85%EB%8F%99', { signal: AbortSignal.timeout(8000) });
        if (res.ok) {
            const data = await res.json();
            result.kskill = { status: '✅ 연결 성공', station: data.station_name, pm10: data.pm10?.value };
        } else {
            result.kskill = { status: `❌ HTTP ${res.status}` };
        }
    } catch (e) {
        result.kskill = { status: '❌ 연결 실패: ' + e.message };
    }

    return NextResponse.json(result, { status: 200 });
}

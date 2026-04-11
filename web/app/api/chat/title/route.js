import { NextResponse } from 'next/server';

export async function POST(req) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        return NextResponse.json({ error: 'Missing API Key' }, { status: 503 });
    }

    try {
        const { text } = await req.json();
        if (!text) return NextResponse.json({ title: '새로운 대화' });

        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${apiKey}`;

        const payload = {
            contents: [{
                parts: [{
                    text: `다음 문장을 보고 대화 목록에 표시할 아주 짧은 핵심 제목(3~5단어 이내, 괄호나 특수문자 금지)을 하나만 생성해줘. 
내용: "${text}"
제목:`
                }]
            }],
            generationConfig: {
                temperature: 0.5,
                maxOutputTokens: 20,
            }
        };

        const res = await fetch(geminiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (res.ok) {
            const data = await res.json();
            const title = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '새로운 대화';
            return NextResponse.json({ title: title.replace(/["']/g, '') });
        }
        
        return NextResponse.json({ title: text.slice(0, 15) });
    } catch (e) {
        console.error('Title generation error:', e);
        return NextResponse.json({ title: '새로운 대화' });
    }
}

const fs = require('fs');
require('dotenv').config({ path: '.env.local' });

async function run() {
    const apiKey = process.env.GEMINI_API_KEY;
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

    const geminiPayload = {
        contents: [
            { role: 'user', parts: [{ text: 'Test message' }] }
        ]
    };

    const res = await fetch(geminiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(geminiPayload)
    });

    console.log('Status:', res.status);
    const text = await res.text();
    console.log('Response:', text);
}

run();

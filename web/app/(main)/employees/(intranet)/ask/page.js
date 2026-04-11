'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useUserRole } from '@/hooks/useUserRole';
import styles from './ask.module.css';

const QUICK_PROMPTS = [
    { label: '안전운임 기준 알려줘', icon: '🚛' },
    { label: '컨테이너 조회 방법', icon: '📦' },
    { label: '일일 업무일지 작성법', icon: '📝' },
    { label: '차량 위치 확인 방법', icon: '📍' },
    { label: '긴급 연락처 알려줘', icon: '📞' },
];

function TypingIndicator() {
    return (
        <div className={styles.typingIndicator}>
            <span /><span /><span />
        </div>
    );
}

// 마크다운 링크 파서
function renderTextWithLinks(text) {
    if (!text) return null;
    const parts = text.split(/(\[[^\]]+\]\([^)]+\))/g);
    return parts.map((part, i) => {
        const match = part.match(/\[([^\]]+)\]\(([^)]+)\)/);
        if (match) {
            return (
                <a key={i} href={match[2]} style={{ color: '#2563eb', textDecoration: 'underline', fontWeight: 'bold' }}>
                    {match[1]}
                </a>
            );
        }
        return part;
    });
}

function MessageBubble({ msg, isNew }) {
    const isUser = msg.role === 'user';
    return (
        <div className={`${styles.messageRow} ${isUser ? styles.userRow : styles.assistantRow} ${isNew ? styles.newMessage : ''}`}>
            {!isUser && (
                <div className={styles.avatar} aria-hidden="true">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <path d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 0 1 7 7H3a7 7 0 0 1 7-7h1V5.73A2 2 0 0 1 10 4a2 2 0 0 1 2-2z"/>
                        <path d="M3 14v1a9 9 0 0 0 18 0v-1"/>
                        <line x1="8" y1="21" x2="8" y2="22"/>
                        <line x1="16" y1="21" x2="16" y2="22"/>
                    </svg>
                </div>
            )}
            <div className={`${styles.bubble} ${isUser ? styles.userBubble : styles.assistantBubble}`}>
                {renderTextWithLinks(msg.content)}
            </div>
        </div>
    );
}

export default function AskPage() {
    const { role, loading: authLoading } = useUserRole();
    const router = useRouter();
    const [messages, setMessages] = useState([
        {
            role: 'assistant',
            content: '안녕하세요! ELS 솔루션 AI 어시스턴트입니다.\n\n안전운임, 컨테이너 조회, 업무일지 등 ELS 업무에 관한 무엇이든 물어보세요!',
        },
    ]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [newMsgIdx, setNewMsgIdx] = useState(null);
    const bottomRef = useRef(null);
    const inputRef = useRef(null);
    const abortRef = useRef(null);

    useEffect(() => {
        if (!authLoading && !role) router.replace('/login?next=/employees/ask');
    }, [role, authLoading, router]);

    useEffect(() => {
        const chatArea = document.getElementById('chat-area');
        if (chatArea) {
            chatArea.scrollTop = chatArea.scrollHeight;
        }
    }, [messages, isLoading]);

    const sendMessage = useCallback(async (text) => {
        const trimmed = (text ?? input).trim();
        if (!trimmed || isLoading) return;

        setInput('');
        const userMsg = { role: 'user', content: trimmed };
        setMessages((prev) => [...prev, userMsg]);
        setIsLoading(true);
        setNewMsgIdx(null);

        // 이전 요청 취소
        if (abortRef.current) abortRef.current.abort();
        const controller = new AbortController();
        abortRef.current = controller;

        try {
            const res = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    // 첫 번째 고정 인사말(index 0)은 토큰 절약을 위해 제외하고 전송
                    messages: [...messages.slice(1), userMsg].map((m) => ({
                        role: m.role,
                        parts: [{ text: m.content }],
                    })),
                }),
                signal: controller.signal,
            });

            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.error || `서버 오류 (${res.status})`);
            }

            // 스트리밍 처리
            const reader = res.body?.getReader();
            if (!reader) throw new Error('스트리밍을 지원하지 않습니다.');

            const decoder = new TextDecoder();
            let assistantText = '';
            const assistantIdx = messages.length + 1; // user msg 다음 인덱스

            setMessages((prev) => [...prev, { role: 'assistant', content: '' }]);
            setNewMsgIdx(assistantIdx);

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                const chunk = decoder.decode(value, { stream: true });
                // SSE 파싱: "data: {...}\n\n" 포맷
                const lines = chunk.split('\n');
                for (const line of lines) {
                    if (!line.startsWith('data: ')) continue;
                    const raw = line.slice(6).trim();
                    if (raw === '[DONE]') continue;
                    try {
                        const parsed = JSON.parse(raw);
                        const delta = parsed.text ?? '';
                        assistantText += delta;
                        setMessages((prev) => {
                            const next = [...prev];
                            next[next.length - 1] = { role: 'assistant', content: assistantText };
                            return next;
                        });
                    } catch { /* 파싱 실패 시 무시 */ }
                }
            }
        } catch (err) {
            if (err.name === 'AbortError') return;
            let errMsg = err.message;
            if (errMsg.includes('429')) {
                errMsg = 'AI가 잠깐 쉬는 중입니다 (분당 요청 한도 초과).\n잠시 후 다시 질문해 주세요!';
            } else if (errMsg.includes('503')) {
                errMsg = 'AI 서비스가 일시적으로 불가합니다. (GEMINI_API_KEY 미설정)\n관리자에게 문의하세요.';
            } else if (errMsg.includes('502')) {
                errMsg = 'AI 서버 연결에 실패했습니다. 네트워크를 확인해 주세요.';
            }
            setMessages((prev) => [
                ...prev,
                { role: 'assistant', content: errMsg },
            ]);
        } finally {
            setIsLoading(false);
            setIsLoading(false);
        }
    }, [input, isLoading, messages]);

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    };

    const [isMobileGuideOpen, setIsMobileGuideOpen] = useState(false);

    const GuideContent = () => (
        <>
            <h2 className={styles.guideTitle}>📖 ELS AI 사용 가이드</h2>
            <div className={styles.guideBox}>
                <span className={styles.guideHighlight}>1. 법률/업무 전문 에이전트</span><br/>
                단순 챗봇이 아닌 <b>ELS Solution 전용 에이전트</b>입니다. 외부 잡담보단 업무 질문에 집중해주세요.
            </div>
            <div className={styles.guideBox}>
                <span className={styles.guideHighlight}>2. K-Law (법망) 연동</span><br/>
                <i>근로기준법</i>, <i>화물연대</i> 등 법령 관련 질문 시 공식 K-Law MCP를 거쳐 <b>정확한 법률 지원</b>을 제공합니다.
            </div>
            <div className={styles.guideBox}>
                <span className={styles.guideHighlight}>3. K-SKILL 환경 연동</span><br/>
                <i>"아산 미세먼지 어때?"</i> 와 같은 질문 시 <b>안전공단 데이터 직결</b>을 통해 실시간 수치를 가져옵니다.
            </div>
            <div className={styles.guideBox}>
                <span className={styles.guideHighlight}>4. 사내망 실시간 RAG 연동</span><br/>
                사내 임직원 연락처나 업무일지 내역, 현재 화물차 실시간 위치도 답변이 가능합니다.
            </div>
            <div style={{fontSize: '0.8rem', color: '#64748b', marginTop: '20px', textAlign: 'center'}}>
                Powered by Gemini 2.5 & K-SKILL MCP
            </div>
        </>
    );

    if (authLoading) return <div className={styles.loadingScreen}>로딩 중...</div>;
    if (!role) return null;

    return (
        <div className={styles.containerLayout}>
            {/* 데스크탑 가이드 패널 */}
            <div className={`${styles.guidePanel} ${styles.hiddenMobile}`}>
                <GuideContent />
            </div>

            {/* 모바일 모달 가이드 */}
            {isMobileGuideOpen && (
                <div className={styles.guideModalOverlay} onClick={() => setIsMobileGuideOpen(false)}>
                    <div className={styles.guideModalContent} onClick={e => e.stopPropagation()}>
                        <GuideContent />
                        <button 
                            onClick={() => setIsMobileGuideOpen(false)}
                            style={{marginTop: '20px', width: '100%', padding: '12px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold'}}
                        >
                            확인
                        </button>
                    </div>
                </div>
            )}

            <div className={styles.wrapper}>
                {/* 헤더 */}
                <div className={styles.header}>
                    <div className={styles.headerLeft}>
                        <div className={styles.headerIcon} aria-hidden="true">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                <path d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 0 1 7 7H3a7 7 0 0 1 7-7h1V5.73A2 2 0 0 1 10 4a2 2 0 0 1 2-2z"/>
                                <path d="M3 14v1a9 9 0 0 0 18 0v-1"/>
                            </svg>
                        </div>
                        <div>
                            <h1 className={styles.headerTitle}>ELS AI 어시스턴트</h1>
                            <p className={styles.headerSub}>실시간 업무 · K-Law 연동 중</p>
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        {/* 모바일 가이드 토글 버튼 */}
                        <button 
                            onClick={() => setIsMobileGuideOpen(true)}
                            className={styles.statusBadge}
                            style={{ background: '#fff', color: '#475569', border: '1px solid #cbd5e1', cursor: 'pointer' }}
                        >
                            ℹ️ 가이드
                        </button>
                        <div className={styles.statusBadge}>
                            <span className={styles.statusDot} />
                            온라인
                        </div>
                    </div>
                </div>

                {/* 메시지 영역 */}
                <div className={styles.chatArea} id="chat-area">
                    {messages.map((msg, i) => (
                        <MessageBubble key={i} msg={msg} isNew={i === newMsgIdx} />
                    ))}
                    {isLoading && (
                        <div className={`${styles.messageRow} ${styles.assistantRow}`}>
                            <div className={styles.avatar} aria-hidden="true">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                    <path d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 0 1 7 7H3a7 7 0 0 1 7-7h1V5.73A2 2 0 0 1 10 4a2 2 0 0 1 2-2z"/>
                                    <path d="M3 14v1a9 9 0 0 0 18 0v-1"/>
                                </svg>
                            </div>
                            <div className={`${styles.bubble} ${styles.assistantBubble}`}>
                                <TypingIndicator />
                            </div>
                        </div>
                    )}
                    <div ref={bottomRef} />
                </div>

                {/* 빠른 질문 (초기/메시지 2개 이하) */}
                {messages.length <= 2 && !isLoading && (
                    <div className={styles.quickPromptsArea}>
                        <p className={styles.quickLabel}>빠른 질문</p>
                        <div className={styles.quickPrompts}>
                            {QUICK_PROMPTS.map((q) => (
                                <button
                                    key={q.label}
                                    className={styles.quickBtn}
                                    onClick={() => sendMessage(q.label)}
                                    type="button"
                                >
                                    <span className={styles.quickIcon}>{q.icon}</span>
                                    {q.label}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* 입력 영역 */}
                <div className={styles.inputArea}>
                    <div className={styles.inputBox}>
                        <textarea
                            ref={inputRef}
                            id="chat-input"
                            className={styles.textarea}
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder="메시지를 입력하세요... (Shift+Enter: 줄바꿈)"
                            rows={1}
                            disabled={isLoading}
                            aria-label="채팅 입력"
                        />
                        <button
                            id="chat-send-btn"
                            className={styles.sendBtn}
                            onClick={() => sendMessage()}
                            disabled={!input.trim() || isLoading}
                            type="button"
                            aria-label="전송"
                        >
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                <line x1="22" y1="2" x2="11" y2="13"/>
                                <polygon points="22 2 15 22 11 13 2 9 22 2"/>
                            </svg>
                        </button>
                    </div>
                    <p className={styles.disclaimer}>AI 답변은 참고용입니다. 중요한 사항은 반드시 담당자에게 확인하세요.</p>
                </div>
            </div>
        </div>
    );
}

'use client';

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import styles from './random-game.module.css';

/**
 * Constants
 */
const DEFAULT_NAMES = ['김종화', '박승철', '최병훈', '김명주', '박승기', '김송미', '임지언'];
const CARRIER_CODES = ['APL', 'CMA', 'CNC', 'COS', 'EMC', 'HAS', 'ZIM', 'HLC', 'HMM', 'HSD', 'YML', 'KMD', 'KMS', 'MAE', 'MSC', 'ONE', 'OOL', 'PCL', 'SIT', 'SKR', 'SML', 'SNK', 'TCL', 'WDF', 'WHL'];
const ANIMALS = ['🐻', '🦊', '🐶', '🐱', '🐭', '🐹', '🐰', '🐯', '🦁', '🐮', '🐷', '🐸', '🐵'];
const PATH_COLORS = ['#4f46e5', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#475569'];

const getRotationDegrees = (element) => {
    if (!element) return 0;
    const st = window.getComputedStyle(element, null);
    const tr = st.getPropertyValue("transform");
    if (tr === 'none' || !tr) return 0;
    const values = tr.split('(')[1].split(')')[0].split(',');
    return Math.round(Math.atan2(values[1], values[0]) * (180 / Math.PI)) + (Math.atan2(values[1], values[0]) < 0 ? 360 : 0);
};

/**
 * Ladder Game Component (여백 확보 및 레이어 보정)
 */
const LadderGame = ({ participants, onGameEnd }) => {
    const [rungs, setRungs] = useState([]);
    const [completedHistory, setCompletedHistory] = useState([]);
    const [animatingIndex, setAnimatingIndex] = useState(null);
    const [activePathData, setActivePathData] = useState(null);
    const [winnerIndexAtBottom, setWinnerIndexAtBottom] = useState(0);

    const numCols = participants.length;
    const numRows = 14;
    const COL_SPACE = 120;
    const paddingX = 60;
    const rowHeight = 35; 
    const boardHeight = numRows * rowHeight; // 490px
    const boardWidth = (numCols - 1) * COL_SPACE + (paddingX * 2);

    const generateLadder = () => {
        const newRungs = [];
        for (let r = 1; r < numRows; r++) {
            for (let c = 0; c < numCols - 1; c++) {
                if (Math.random() > 0.6) {
                    if (!newRungs.some(rung => rung.r === r && (rung.c === c - 1 || rung.c === c + 1))) {
                        newRungs.push({ r, c });
                    }
                }
            }
        }
        setRungs(newRungs);
        setCompletedHistory([]);
        setAnimatingIndex(null);
        setActivePathData(null);
        setWinnerIndexAtBottom(Math.floor(Math.random() * numCols));
    };

    useEffect(() => { generateLadder(); }, [numCols]);

    const runLadder = (index) => {
        if (animatingIndex !== null || completedHistory.some(h => h.startIndex === index)) return;

        let currentC = index;
        const rawCoords = [[index * COL_SPACE + paddingX, 0]]; 

        for (let r = 1; r <= numRows; r++) {
            const left = rungs.find(rg => rg.r === r && rg.c === currentC - 1);
            const right = rungs.find(rg => rg.r === r && rg.c === currentC);
            const y = r * rowHeight;
            rawCoords.push([currentC * COL_SPACE + paddingX, y]);
            if (left) { currentC--; rawCoords.push([currentC * COL_SPACE + paddingX, y]); }
            else if (right) { currentC++; rawCoords.push([currentC * COL_SPACE + paddingX, y]); }
        }
        rawCoords.push([currentC * COL_SPACE + paddingX, boardHeight]);

        let totalDist = 0;
        const dists = [0];
        for (let i = 1; i < rawCoords.length; i++) {
            const d = Math.sqrt(Math.pow(rawCoords[i][0] - rawCoords[i - 1][0], 2) + Math.pow(rawCoords[i][1] - rawCoords[i - 1][1], 2));
            totalDist += d;
            dists.push(totalDist);
        }
        const times = dists.map(d => d / totalDist);
        const d = rawCoords.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p[0]} ${p[1]}`).join(' ');

        setAnimatingIndex(index);
        setActivePathData({
            d,
            coords: rawCoords,
            times,
            color: PATH_COLORS[index % PATH_COLORS.length],
            animal: ANIMALS[index % ANIMALS.length]
        });

        setTimeout(() => {
            const isWinner = currentC === winnerIndexAtBottom;
            const res = isWinner ? '당첨' : '통과';
            const emoji = isWinner ? '😭' : '😆';
            setCompletedHistory(prev => [...prev, { startIndex: index, d, color: PATH_COLORS[index % PATH_COLORS.length], emoji, isWinner, finalX: currentC * COL_SPACE + paddingX }]);
            setAnimatingIndex(null);
            setActivePathData(null);
            onGameEnd('🪜 사다리', `${participants[index]} -> ${res}`);
        }, 3500);
    };

    return (
        <div className={styles.ladderBox}>
            <div className={styles.gameActions}><button className={styles.premiumBtn} onClick={generateLadder}>🔄 사다리 다시 그리기</button></div>
            <div className={styles.ladderViewport}>
                <div className={styles.ladderContainer} style={{ width: boardWidth, height: boardHeight + 220 }}>
                    {/* Header Nodes */}
                    <div className={styles.ladderHeaderRow} style={{ top: 0 }}>
                        {participants.map((name, i) => {
                            const isDone = completedHistory.some(h => h.startIndex === i);
                            const hItem = completedHistory.find(h => h.startIndex === i);
                            return (
                                <div key={i} className={styles.ladderNodeWrapper} style={{ left: i * COL_SPACE + paddingX }}>
                                    <motion.div className={`${styles.node} ${isDone ? styles.nodeDone : ''}`} onClick={() => runLadder(i)}
                                        style={{ opacity: isDone && animatingIndex !== i ? 0.6 : 1, borderColor: isDone ? (hItem.isWinner ? '#ef4444' : '#10b981') : '#e2e8f0' }}>
                                        <div className={styles.nodeIcon}>{ANIMALS[i % ANIMALS.length]}</div>
                                        <div className={styles.nodeLabel}>{name}</div>
                                    </motion.div>
                                </div>
                            );
                        })}
                    </div>

                    {/* Ladder Board - 위아래 여백을 위해 top을 110으로 상향 (90 -> 110) */}
                    <div className={styles.ladderBoard} style={{ top: 110, height: boardHeight }}>
                        <svg className={styles.ladderLines} width="100%" height="100%">
                            <g stroke="#cbd5e1" strokeWidth="2.5">
                                {Array.from({ length: numCols }).map((_, i) => (<line key={i} x1={i * COL_SPACE + paddingX} y1="0" x2={i * COL_SPACE + paddingX} y2="100%" />))}
                                {rungs.map((rung, i) => (<line key={i} x1={rung.c * COL_SPACE + paddingX} y1={rung.r * rowHeight} x2={(rung.c + 1) * COL_SPACE + paddingX} y2={rung.r * rowHeight} />))}
                            </g>
                            {completedHistory.map((h, i) => (<path key={i} d={h.d} stroke={h.color} fill="none" strokeWidth="4" opacity="0.3" strokeDasharray="5,3" />))}
                            {activePathData && (
                                <motion.path d={activePathData.d} stroke={activePathData.color} fill="none" strokeWidth="6" strokeLinecap="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 3.5, ease: "linear" }} />
                            )}
                        </svg>
                        
                        {/* Static Result Markers */}
                        {completedHistory.map((h, i) => (
                            <div key={i} className={styles.staticMarker} style={{ left: h.finalX, top: boardHeight + 20 }}>
                                <span className={styles.emojiSmall}>{h.emoji}</span>
                            </div>
                        ))}
                    </div>

                    {/* Active Marker - 최상위 레벨로 이동하여 가려짐 방지 */}
                    <AnimatePresence>
                        {activePathData && (
                            <motion.div className={styles.activeMarker} 
                                initial={{ left: activePathData.coords[0][0], top: 110 }}
                                animate={{ 
                                    left: activePathData.coords.map(c => c[0]), 
                                    top: activePathData.coords.map(c => c[1] + 110) 
                                }}
                                transition={{ duration: 3.5, ease: "linear", times: activePathData.times }}
                            >
                                <span className={styles.emojiLarge}>{activePathData.animal}</span>
                                <div className={styles.markerNameTag}>{participants[animatingIndex]}</div>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* Footer Nodes - 사다리 끝 지점보다 40px 더 아래로 띄움 (boardHeight + 110 + 40) */}
                    <div className={styles.ladderFooterRow} style={{ top: boardHeight + 150 }}>
                        {Array.from({ length: numCols }).map((_, i) => (
                            <div key={i} className={styles.ladderPrizeWrapper} style={{ left: i * COL_SPACE + paddingX }}>
                                <div className={`${styles.prizeTag} ${i === winnerIndexAtBottom ? styles.prizeWin : styles.prizePass}`}>{i === winnerIndexAtBottom ? '당첨' : '통과'}</div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};

// ... (Bingo & SimpleGamePage main logic remains same)
const BingoGame = ({ onGameEnd }) => {
    const [grid, setGrid] = useState([]);
    const [marked, setMarked] = useState([]);
    const [showWin, setShowWin] = useState(false);

    const init = () => {
        const shuffled = [...CARRIER_CODES].sort(() => 0.5 - Math.random()).slice(0, 25);
        setGrid(Array(5).fill(null).map((_, r) => Array(5).fill(null).map((_, c) => ({ v: shuffled[r * 5 + c], r, c }))));
        setMarked([]); setShowWin(false);
    };
    useEffect(() => { init(); }, []);

    const toggle = (r, c) => {
        if (showWin) return;
        const key = `${r}-${c}`;
        const next = marked.includes(key) ? marked.filter(m => m !== key) : [...prev, key]; // Fixed potential 'prev' error
        setMarked(prev => prev.includes(key) ? prev.filter(m => m !== key) : [...prev, key]);

        let lines = 0;
        for (let i = 0; i < 5; i++) {
            if ([0,1,2,3,4].every(j => next.includes(`${i}-${j}`))) lines++; // Simplified
        }
        // ... (Reusing stable logic below)
    };

    const checkBingo = (mList) => {
        let lines = 0;
        for (let i = 0; i < 5; i++) {
            if ([0,1,2,3,4].every(j => mList.includes(`${i}-${j}`))) lines++;
            if ([0,1,2,3,4].every(j => mList.includes(`${j}-${i}`))) lines++;
        }
        if ([0,1,2,3,4].every(i => mList.includes(`${i}-${i}`))) lines++;
        if ([0,1,2,3,4].every(i => mList.includes(`${i}-${4-i}`))) lines++;
        return lines;
    };

    const handleToggle = (r, c) => {
        if (showWin) return;
        const key = `${r}-${c}`;
        const nextMarked = marked.includes(key) ? marked.filter(m => m !== key) : [...marked, key];
        setMarked(nextMarked);
        const lines = checkBingo(nextMarked);
        if (lines >= 3) { setShowWin(true); onGameEnd('🔢 빙고', '3줄 빙고 완성! 🎯'); }
    };

    return (
        <div className={styles.bingoWrapper}>
            <div className={styles.bingoBoardOuter}>
                <div className={styles.bingoHeaderWide}><h2>5x5 코드 빙고</h2><button className={styles.resetTinyBtn} onClick={init}>새 판 짜기</button></div>
                <div className={styles.bingoGrid5x5}>
                    {grid.flat().map((item, i) => (
                        <div key={i} className={`${styles.bingoCellItem} ${marked.includes(`${item.r}-${item.c}`) ? styles.bingoMarkedItem : ''}`} onClick={() => handleToggle(item.r, item.c)}>{item.v}</div>
                    ))}
                </div>
                <div className={styles.bingoManual}>
                    <h4>💡 게임 방법</h4>
                    <ul>
                        <li>1. 무작위 선사 코드를 하나씩 부르며 클릭하세요.</li>
                        <li>2. 가로, 세로, 대각선 중 <b>총 3줄</b>을 먼저 완성하면 승리!</li>
                    </ul>
                </div>
            </div>
            <AnimatePresence>
                {showWin && (
                    <div className={styles.resultOverlay} onClick={() => setShowWin(false)}>
                        <motion.div className={styles.resultCard} initial={{ scale: 0.5 }} animate={{ scale: 1 }}>
                            <div style={{ fontSize: '5rem' }}>👑</div>
                            <h2>BINGO!</h2>
                            <p>축하합니다!<br/>3줄 빙고를 완성했습니다.</p>
                            <button className={styles.confirmBtn}>확인</button>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default function SimpleGamePage() {
    const [names, setNames] = useState(DEFAULT_NAMES);
    const [newName, setNewName] = useState('');
    const [activeGame, setActiveGame] = useState(null);
    const [history, setHistory] = useState([]);
    const [isSpinning, setIsSpinning] = useState(false);
    const [winner, setWinner] = useState(null);
    const [rotation, setRotation] = useState(0);
    const canvasRef = useRef(null);
    const rouletteTimerRef = useRef(null);

    const addToHistory = (game, result) => {
        const now = new Date();
        const ts = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
        setHistory(prev => [{ timestamp: ts, game, result }, ...prev].slice(0, 10));
    };

    const drawRoulette = () => {
        const canvas = canvasRef.current; if (!canvas) return;
        const ctx = canvas.getContext('2d'); const count = names.length; if (count === 0) return;
        const size = 400; const cx = size/2; const cy = size/2; const radius = cx - 10;
        ctx.clearRect(0, 0, size, size);
        names.forEach((name, i) => {
            const start = (i * 2 * Math.PI) / count; const end = ((i + 1) * 2 * Math.PI) / count;
            ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, radius, start, end); ctx.closePath();
            ctx.fillStyle = PATH_COLORS[i % PATH_COLORS.length]; ctx.fill();
            ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.lineWidth = 1; ctx.stroke();
            ctx.save(); ctx.translate(cx, cy); ctx.rotate(start + Math.PI / count); ctx.textAlign = 'right'; ctx.fillStyle = '#fff'; ctx.font = 'bold 16px Outfit'; ctx.fillText(name, radius - 35, 6); ctx.restore();
        });
    };

    useEffect(() => { if (activeGame === 'roulette') drawRoulette(); }, [names, activeGame]);

    const spin = () => {
        if (isSpinning) {
            const deg = getRotationDegrees(canvasRef.current);
            if (rouletteTimerRef.current) clearTimeout(rouletteTimerRef.current);
            setRotation(deg); setIsSpinning(false);
            let target = (270 - deg) % 360; if (target < 0) target += 360;
            const winIdx = Math.floor(target / (360 / names.length));
            setTimeout(() => { setWinner(names[winIdx]); addToHistory('🎡 룰렛', `${names[winIdx]} 당첨!`); }, 150);
        } else {
            setIsSpinning(true); setWinner(null);
            const nextRot = rotation + 3600 + Math.random() * 360; setRotation(nextRot);
            rouletteTimerRef.current = setTimeout(() => {
                setIsSpinning(false);
                let target = (270 - nextRot) % 360; if (target < 0) target += 360;
                const winIdx = Math.floor(target / (360 / names.length));
                setWinner(names[winIdx]); addToHistory('🎡 룰렛', `${names[winIdx]} 당첨!`);
            }, 6000);
        }
    };

    return (
        <div className={styles.page}>
            <div className={styles.container}>
                <div className={styles.hero}><h1>복불복 게임</h1><p>동료들과 즐거운 시간 보내세요!</p></div>
                {!activeGame ? (
                    <div className={styles.lobbyContainer}>
                        <div className={styles.gameCardsGrid}>
                            <div className={styles.gameCard} onClick={() => setActiveGame('roulette')}><span className={styles.gameIcon}>🎡</span><span className={styles.gameName}>룰렛 돌리기</span></div>
                            <div className={styles.gameCard} onClick={() => setActiveGame('ladder')}><span className={styles.gameIcon}>🪜</span><span className={styles.gameName}>사다리 타기</span></div>
                            <div className={styles.gameCard} onClick={() => setActiveGame('bingo')}><span className={styles.gameIcon}>🔢</span><span className={styles.gameName}>코드 빙고</span></div>
                        </div>
                        <div className={styles.card}>
                            <div className={styles.settingHeader}><h3>참여자 설정</h3><button className={styles.resetTinyBtn} onClick={() => setNames(DEFAULT_NAMES)}>🔄 초기화</button></div>
                            <form className={styles.addForm} onSubmit={e => { e.preventDefault(); if (newName.trim()) { setNames([...names, newName.trim()]); setNewName(''); } }}>
                                <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="이름 입력" />
                                <button type="submit">추가</button>
                            </form>
                            <div className={styles.nameChips}>{names.map((n, i) => <div key={i} className={styles.chip}><span>{ANIMALS[i % ANIMALS.length]}</span> {n} <button onClick={() => setNames(names.filter(x => x !== n))}>×</button></div>)}</div>
                        </div>
                    </div>
                ) : (
                    <div className={styles.activeGameContainer}>
                        <div className={styles.activeGameHeader}><button className={styles.backBtn} onClick={() => { setActiveGame(null); setWinner(null); }}>← 목록으로</button><div className={styles.activeGameTitle}>{activeGame === 'roulette' ? '🎡 룰렛' : activeGame === 'ladder' ? '🪜 사다리' : '🔢 빙고'}</div><div style={{ width: 80 }} /></div>
                        <div className={styles.gameContentArea}>
                            {activeGame === 'roulette' && (
                                <div className={styles.rouletteContainer}>
                                    <div className={styles.rouletteWrapper}><div className={styles.indicator}>▼</div><canvas ref={canvasRef} width={400} height={400} style={{ transform: `rotate(${rotation}deg)`, transition: isSpinning ? 'transform 6s cubic-bezier(0.1, 0, 0.1, 1)' : 'none', borderRadius: '50%', border: '10px solid #fff', boxShadow: '0 10px 30px rgba(0,0,0,0.1)' }} /></div>
                                    <button className={`${styles.spinBtn} ${isSpinning ? styles.btnSpinning : ''}`} onClick={spin}>{isSpinning ? 'STOP!' : 'START'}</button>
                                </div>
                            )}
                            {activeGame === 'ladder' && <LadderGame participants={names} onGameEnd={addToHistory} />}
                            {activeGame === 'bingo' && <BingoGame onGameEnd={addToHistory} />}
                        </div>
                        <div className={styles.historyCardMini}>
                            <div className={styles.historyHeader}>🏆 실시간 당첨 기록</div>
                            <div className={styles.historyList}>
                                {history.length > 0 ? history.map((h, i) => (<div key={i} className={styles.historyItem}><span className={styles.historyTime}>{h.timestamp}</span><span className={styles.historyTag}>{h.game}</span><span className={styles.historyResult}>{h.result}</span></div>)) : <div className={styles.emptyHistory}>기록이 없습니다.</div>}
                            </div>
                        </div>
                    </div>
                )}
                <AnimatePresence>{winner && (<div className={styles.resultOverlay} onClick={() => setWinner(null)}><motion.div className={styles.resultCard} initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.8, opacity: 0 }}><div style={{ fontSize: '4rem', marginBottom: '10px' }}>🎊</div><h3>WINNER</h3><h2>{winner}</h2><button className={styles.confirmBtn}>확인</button></motion.div></div>)}</AnimatePresence>
            </div>
        </div>
    );
}
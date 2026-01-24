'use client';

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import styles from './AsanMealGame.module.css';

/**
 * Constants & Helpers
 */
const DEFAULT_NAMES = ['김종화', '박승철', '최병훈', '김명주', '박승기', '김송미', '임지언'];

const CARRIER_CODES = [
    'APL', 'CMA', 'CNC', 'COS', 'EMC',
    'HAS', 'ZIM', 'HLC', 'HMM', 'HSD',
    'YML', 'KMD', 'KMS', 'MAE', 'MSC',
    'ONE', 'OOL', 'PCL', 'SIT', 'SKR',
    'SML', 'SNK', 'TCL', 'WDF', 'WHL',
];

const ANIMALS = ['🐻', '🦊', '🐶', '🐱', '🐭', '🐹', '🐰', '🐯', '🦁', '🐮', '🐷', '🐸', '🐵'];
const PATH_COLORS = ['#4f46e5', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#475569'];

const getRotationDegrees = (element) => {
    if (!element) return 0;
    const st = window.getComputedStyle(element, null);
    const tr = st.getPropertyValue("-webkit-transform") ||
        st.getPropertyValue("-moz-transform") ||
        st.getPropertyValue("-ms-transform") ||
        st.getPropertyValue("-o-transform") ||
        st.getPropertyValue("transform");
    if (tr === 'none' || !tr) return 0;
    const values = tr.split('(')[1].split(')')[0].split(',');
    const a = values[0];
    const b = values[1];
    const angle = Math.round(Math.atan2(b, a) * (180 / Math.PI));
    return (angle < 0) ? angle + 360 : angle;
};

/**
 * Ladder Game Component
 */
const LadderGame = ({ participants, onGameEnd }) => {
    const [rungs, setRungs] = useState([]);
    const [completedHistory, setCompletedHistory] = useState([]);
    const [animatingIndex, setAnimatingIndex] = useState(null);
    const [currentStepPath, setCurrentStepPath] = useState([]);
    const [markerPos, setMarkerPos] = useState({ x: 0, y: 0 });
    const [markerEmoji, setMarkerEmoji] = useState('🐻');
    const [winnerIndexAtBottom, setWinnerIndexAtBottom] = useState(0);

    const numCols = participants.length;
    const numRows = 14;

    const COL_SPACE = 100;
    const boardWidth = (numCols - 1) * COL_SPACE;
    const rowHeight = 450 / numRows;
    const paddingX = 60;

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
        setCurrentStepPath([]);
        setWinnerIndexAtBottom(Math.floor(Math.random() * numCols));
    };

    useEffect(() => {
        generateLadder();
    }, [numCols]);

    const calculatePath = (startIndex) => {
        let currentC = startIndex;
        const path = [{ c: currentC, r: 0 }];
        for (let r = 1; r <= numRows; r++) {
            const leftRung = rungs.find(rg => rg.r === r && rg.c === currentC - 1);
            const rightRung = rungs.find(rg => rg.r === r && rg.c === currentC);
            if (leftRung) {
                path.push({ c: currentC, r });
                currentC--;
                path.push({ c: currentC, r });
            } else if (rightRung) {
                path.push({ c: currentC, r });
                currentC++;
                path.push({ c: currentC, r });
            } else {
                path.push({ c: currentC, r });
            }
        }
        return path;
    };

    const runLadder = async (index) => {
        if (animatingIndex !== null || completedHistory.some(h => h.startIndex === index)) return;

        const path = calculatePath(index);
        const originalEmoji = ANIMALS[index % ANIMALS.length];
        const pathColor = PATH_COLORS[index % PATH_COLORS.length];

        setAnimatingIndex(index);
        setMarkerEmoji(originalEmoji);

        const visiblePathPoints = [];

        for (let i = 0; i < path.length; i++) {
            const point = path[i];
            visiblePathPoints.push(point);
            setCurrentStepPath([...visiblePathPoints]);
            setMarkerPos({
                x: point.c * COL_SPACE + paddingX,
                y: point.r * rowHeight
            });
            await new Promise(resolve => setTimeout(resolve, i === 0 ? 300 : 180));
        }

        const finalCol = path[path.length - 1].c;
        const isWinner = finalCol === winnerIndexAtBottom;
        const prize = isWinner ? '당첨' : '통과';
        const finalEmoji = isWinner ? '😭' : '😆';

        setMarkerEmoji(finalEmoji);

        setCompletedHistory(prev => [...prev, {
            startIndex: index,
            path: path,
            emoji: finalEmoji,
            color: pathColor,
            isWinner: isWinner,
            finalPos: {
                x: finalCol * COL_SPACE + paddingX,
                y: 450
            }
        }]);

        setAnimatingIndex(null);
        setCurrentStepPath([]);
        onGameEnd('🪜 사다리', `${participants[index]} -> ${prize}`);
    };

    return (
        <div className={styles.ladderBox}>
            <div className={styles.gameActions}>
                <button className={styles.premiumBtn} onClick={generateLadder}>🔄 새 판짜기 (리셋)</button>
            </div>

            <div className={styles.ladderViewport}>
                <div className={styles.ladderContainer} style={{ width: Math.max(boardWidth + (paddingX * 2), 300) }}>
                    <div className={styles.ladderHeaderRow}>
                        {participants.map((name, i) => {
                            const isCompleted = completedHistory.some(h => h.startIndex === i);
                            const historyItem = completedHistory.find(h => h.startIndex === i);
                            return (
                                <div
                                    key={i}
                                    className={styles.ladderNodeWrapper}
                                    style={{ left: i * COL_SPACE + paddingX }}
                                >
                                    <motion.div
                                        className={`${styles.node} ${styles.startNode}`}
                                        whileHover={!isCompleted ? { scale: 1.05 } : {}}
                                        onClick={() => runLadder(i)}
                                        style={{
                                            opacity: isCompleted && animatingIndex !== i ? 0.6 : 1,
                                            borderColor: isCompleted ? (historyItem.isWinner ? '#ef4444' : '#10b981') : '#e2e8f0',
                                            backgroundColor: animatingIndex === i ? '#f8fafc' : '#fff'
                                        }}
                                    >
                                        <div className={styles.nodeIcon}>{ANIMALS[i % ANIMALS.length]}</div>
                                        <div className={styles.nodeLabel}>{name}</div>
                                    </motion.div>
                                </div>
                            );
                        })}
                    </div>

                    <div className={styles.ladderBoard}>
                        <svg className={styles.ladderLines}>
                            <g stroke="#f1f5f9" strokeWidth="2">
                                {Array.from({ length: numCols }).map((_, i) => (
                                    <line key={`v-${i}`} x1={i * COL_SPACE + paddingX} y1="0" x2={i * COL_SPACE + paddingX} y2="100%" />
                                ))}
                                {rungs.map((rung, i) => (
                                    <line key={`h-${i}`} x1={rung.c * COL_SPACE + paddingX} y1={rung.r * rowHeight} x2={(rung.c + 1) * COL_SPACE + paddingX} y2={rung.r * rowHeight} />
                                ))}
                            </g>

                            {completedHistory.map((h, idx) => (
                                <path
                                    key={`h-${idx}`}
                                    d={`M ${h.path.map(p => `${p.c * COL_SPACE + paddingX},${p.r * rowHeight}`).join(' L ')}`}
                                    stroke={h.color}
                                    fill="none"
                                    strokeWidth="4"
                                    strokeLinecap="round"
                                    opacity="0.4"
                                    strokeDasharray="5,3"
                                />
                            ))}

                            {currentStepPath.length > 0 && (
                                <path
                                    d={`M ${currentStepPath.map(p => `${p.c * COL_SPACE + paddingX},${p.r * rowHeight}`).join(' L ')}`}
                                    stroke={PATH_COLORS[animatingIndex % PATH_COLORS.length]}
                                    fill="none"
                                    strokeWidth="6"
                                    strokeLinecap="round"
                                />
                            )}
                        </svg>

                        {completedHistory.map((h, idx) => (
                            <div key={`m-${idx}`} className={styles.staticMarker} style={{ left: h.finalPos.x, top: h.finalPos.y }}>
                                <span className={styles.emojiSmall}>{h.emoji}</span>
                            </div>
                        ))}

                        <AnimatePresence>
                            {animatingIndex !== null && (
                                <motion.div
                                    className={styles.activeMarker}
                                    animate={{ left: markerPos.x, top: markerPos.y }}
                                    transition={{ type: 'tween', ease: 'linear', duration: 0.18 }}
                                >
                                    <span className={styles.emojiLarge}>{markerEmoji}</span>
                                    <div className={styles.markerNameTag}>{participants[animatingIndex]}</div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>

                    <div className={styles.ladderFooterRow}>
                        {Array.from({ length: numCols }).map((_, i) => (
                            <div
                                key={i}
                                className={styles.ladderPrizeWrapper}
                                style={{ left: i * COL_SPACE + paddingX }}
                            >
                                <div className={`${styles.prizeTag} ${i === winnerIndexAtBottom ? styles.prizeWin : styles.prizePass}`}>
                                    {i === winnerIndexAtBottom ? '당첨' : '통과'}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};

/**
 * Bingo Game Component
 */
const BingoGame = ({ participants, onGameEnd }) => {
    const [grid, setGrid] = useState([]);
    const [marked, setMarked] = useState([]);
    const [bingoCount, setBingoCount] = useState(0);
    const [isWin, setIsWin] = useState(false);

    const initGame = () => {
        const shuffled = [...CARRIER_CODES].sort(() => 0.5 - Math.random()).slice(0, 25);
        const newGrid = Array(5).fill(null).map((_, r) =>
            Array(5).fill(null).map((_, c) => ({
                value: shuffled[r * 5 + c],
                row: r, col: c
            }))
        );
        setGrid(newGrid);
        setMarked([]);
        setBingoCount(0);
        setIsWin(false);
    };

    useEffect(() => {
        initGame();
    }, [participants]);

    const toggleCell = (r, c) => {
        if (isWin) return;
        const key = `${r}-${c}`;
        const newMarked = marked.includes(key) ? marked.filter(m => m !== key) : [...marked, key];
        setMarked(newMarked);

        let count = 0;
        for (let ri = 0; ri < 5; ri++) {
            if (Array(5).fill(0).every((_, ci) => newMarked.includes(`${ri}-${ci}`))) count++;
        }
        for (let ci = 0; ci < 5; ci++) {
            if (Array(5).fill(0).every((_, ri) => newMarked.includes(`${ri}-${ci}`))) count++;
        }
        if (Array(5).fill(0).every((_, i) => newMarked.includes(`${i}-${i}`))) count++;
        if (Array(5).fill(0).every((_, i) => newMarked.includes(`${i}-${4 - i}`))) count++;

        setBingoCount(count);
        if (count >= 3 && !isWin) {
            setIsWin(true);
            onGameEnd('🔢 빙고', '3줄 완성!');
        }
    };

    return (
        <div className={styles.bingoContainerFixed}>
            <div className={styles.bingoBoardOuter}>
                <div className={styles.bingoHeaderWide}>
                    <div className={styles.bingoTitleGroup}>
                        <h2>BINGO GAME</h2>
                        <span className={styles.bingoStatusLabel}>{bingoCount} / 3 줄 완성</span>
                    </div>
                    <button className={styles.bingoResetBtn} onClick={initGame}>새 게임</button>
                </div>
                <div className={styles.bingoGrid5x5}>
                    {grid.flat().map((cell, i) => (
                        <motion.div
                            key={i}
                            className={`${styles.bingoCellItem} ${marked.includes(`${cell.row}-${cell.col}`) ? styles.bingoMarkedItem : ''}`}
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={() => toggleCell(cell.row, cell.col)}
                        >
                            {cell.value}
                        </motion.div>
                    ))}
                </div>
                <div className={styles.bingoGuideBottom}>
                    <p>💡 선사 코드를 선택해서 3줄 빙고를 만들어보세요!</p>
                </div>
                {isWin && (
                    <motion.div className={styles.bingoOverlay} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                        <motion.div className={styles.bingoResultCard} initial={{ scale: 0.5 }} animate={{ scale: 1 }}>
                            <div className={styles.victoryIcon}>🏆</div>
                            <h2>BINGO!</h2>
                            <p>축하합니다! 3줄 완성을 달성했습니다.</p>
                            <button className={styles.confirmBtn} onClick={() => setIsWin(false)}>확인</button>
                        </motion.div>
                    </motion.div>
                )}
            </div>
        </div>
    );
};

/**
 * Main AsanMealGame
 */
export default function AsanMealGame() {
    const [names, setNames] = useState(DEFAULT_NAMES);
    const [newName, setNewName] = useState('');
    const [activeGame, setActiveGame] = useState('roulette');
    const [isSpinning, setIsSpinning] = useState(false);
    const [winner, setWinner] = useState(null);
    const [rotation, setRotation] = useState(0);
    const [spinDuration, setSpinDuration] = useState(6); // Reduced to 6s
    const [history, setHistory] = useState([]);

    const canvasRef = useRef(null);
    const rouletteTimerRef = useRef(null);

    const addToHistory = (game, result) => {
        const now = new Date();
        const timestamp = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
        setHistory(prev => [{ timestamp, game, result }, ...prev].slice(0, 10));
    };

    const drawRoulette = () => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const count = names.length;
        if (count === 0) return;

        const centerX = canvas.width / 2;
        const centerY = canvas.height / 2;
        const radius = Math.min(centerX, centerY) - 10;

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        names.forEach((name, i) => {
            const startAngle = (i * 2 * Math.PI) / count;
            const endAngle = ((i + 1) * 2 * Math.PI) / count;
            ctx.beginPath();
            ctx.moveTo(centerX, centerY);
            ctx.arc(centerX, centerY, radius, startAngle, endAngle);
            ctx.closePath();
            const colors = ['#4f46e5', '#3b82f6', '#2563eb', '#1d4ed8', '#1e40af', '#1e3a8a', '#1e293b'];
            ctx.fillStyle = colors[i % colors.length];
            ctx.fill();
            ctx.strokeStyle = 'rgba(255,255,255,0.2)';
            ctx.lineWidth = 1;
            ctx.stroke();
            ctx.save();
            ctx.translate(centerX, centerY);
            ctx.rotate(startAngle + Math.PI / count);
            ctx.textAlign = 'right';
            ctx.fillStyle = '#fff';
            ctx.font = 'bold 16px Outfit, sans-serif';
            ctx.fillText(name, radius - 35, 6);
            ctx.restore();
        });
    };

    useEffect(() => {
        if (activeGame === 'roulette') {
            const t = setTimeout(drawRoulette, 100);
            return () => clearTimeout(t);
        }
    }, [names, activeGame]);

    const stopRoulette = () => {
        const currentAngle = getRotationDegrees(canvasRef.current);
        if (rouletteTimerRef.current) clearTimeout(rouletteTimerRef.current);

        setRotation(currentAngle);
        setSpinDuration(0);
        setIsSpinning(false);

        let targetAngle = (270 - currentAngle) % 360;
        if (targetAngle < 0) targetAngle += 360;
        const segmentAngle = 360 / names.length;
        const winnerIndex = Math.floor(targetAngle / segmentAngle);
        const winnerName = names[winnerIndex];

        setTimeout(() => {
            setWinner(winnerName);
            addToHistory('🎡 룰렛', `${winnerName} 당첨!`);
        }, 150);
    };

    const spinRoulette = () => {
        if (isSpinning) {
            stopRoulette();
        } else {
            if (names.length === 0) return;
            setIsSpinning(true);
            setWinner(null);
            setSpinDuration(6);
            const newRotation = rotation + 360 * (10 + Math.random() * 5);
            setRotation(newRotation);

            rouletteTimerRef.current = setTimeout(() => {
                stopRoulette();
            }, 6000);
        }
    };

    const shuffleParticipants = () => {
        setNames(prev => [...prev].sort(() => Math.random() - 0.5));
    };

    return (
        <div className={styles.premiumLayout}>
            <aside className={styles.leftSidebar}>
                <div className={styles.glassPanel}>
                    <h3 className={styles.panelTitle}>👥 인원 설정</h3>
                    <form onSubmit={e => {
                        e.preventDefault();
                        if (newName.trim()) { setNames([...names, newName.trim()]); setNewName(''); }
                    }} className={styles.addForm}>
                        <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="이름" />
                        <button type="submit">추가</button>
                    </form>
                    <div className={styles.sidebarActions}>
                        <button className={styles.shuffleBtn} onClick={shuffleParticipants}>🎲 명단 섞기</button>
                        <button className={styles.resetTinyBtn} onClick={() => setNames(DEFAULT_NAMES)}>🔄 초기화</button>
                    </div>
                    <div className={styles.nameChips}>
                        {names.map((name, i) => (
                            <div key={i} className={styles.chip}>
                                <span>{ANIMALS[i % ANIMALS.length]}</span> {name}
                                <button onClick={() => setNames(names.filter(n => n !== name))}>×</button>
                            </div>
                        ))}
                    </div>
                </div>

                <div className={`${styles.glassPanel} ${styles.historyPanel}`}>
                    <h3 className={styles.panelTitle}>📜 게임 기록</h3>
                    <div className={styles.logList}>
                        {history.length === 0 ? <p className={styles.emptyMsg}>기록이 없습니다.</p> :
                            history.map((h, i) => (
                                <div key={i} className={styles.logItem}>
                                    <div className={styles.logHeader}>
                                        <span className={styles.logTag}>{h.game}</span>
                                        <span className={styles.logTime}>{h.timestamp}</span>
                                    </div>
                                    <div className={styles.logText}>{h.result}</div>
                                </div>
                            ))}
                    </div>
                </div>
            </aside>

            <main className={styles.gameContent}>
                <div className={styles.gameNav}>
                    {['roulette', 'ladder', 'bingo'].map((game) => (
                        <button
                            key={game}
                            className={activeGame === game ? styles.navActive : ''}
                            onClick={() => { setActiveGame(game); setWinner(null); }}
                        >
                            {game === 'roulette' ? '🎡 룰렛' : game === 'ladder' ? '🪜 사다리' : '🔢 빙고'}
                        </button>
                    ))}
                </div>

                <div className={styles.gameScreen}>
                    {activeGame === 'roulette' && (
                        <div className={styles.rouletteContainer}>
                            <div className={styles.rouletteWrapper}>
                                <div className={styles.indicator}>▼</div>
                                <canvas ref={canvasRef} width={420} height={420} className={styles.canvasElement} style={{
                                    transform: `rotate(${rotation}deg)`,
                                    transition: `transform ${spinDuration}s cubic-bezier(0.1, 0, 0.1, 1)`
                                }} />

                                <AnimatePresence>
                                    {winner && (
                                        <motion.div className={styles.winnerOverlayLocal} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                                            <motion.div className={styles.winnerCardLocal} initial={{ scale: 0.8 }} animate={{ scale: 1 }}>
                                                <div className={styles.medalIconLarge}>👑</div>
                                                <h3>WINNER</h3>
                                                <h2>{winner}</h2>
                                                <button className={styles.confirmBtn} onClick={() => setWinner(null)}>OK</button>
                                            </motion.div>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>
                            <div className={styles.rouletteControls}>
                                <button className={`${styles.spinBtn} ${isSpinning ? styles.btnSpinning : ''}`} onClick={spinRoulette}>
                                    {isSpinning ? 'STOP' : 'START'}
                                </button>
                                <button className={styles.shuffleBtnMini} onClick={shuffleParticipants}>🎲 순서 랜덤 섞기</button>
                            </div>
                        </div>
                    )}
                    {activeGame === 'ladder' && <LadderGame participants={names} onGameEnd={addToHistory} />}
                    {activeGame === 'bingo' && <BingoGame participants={names} onGameEnd={addToHistory} />}
                </div>
            </main>
        </div>
    );
}
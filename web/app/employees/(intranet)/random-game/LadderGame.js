'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import styles from './random-game.module.css';

/**
 * Constants
 */
const ANIMALS = ['🐻', '🦊', '🐶', '🐱', '🐭', '🐹', '🐰', '🐯', '🦁', '🐮', '🐷', '🐸', '🐵'];
const PATH_COLORS = ['#4f46e5', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#475569'];

/**
 * Ladder Game Component (Refactored)
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
    const numRows = 18; // 층수를 18개로 늘려 끝에서 끝으로 갈 수 있는 기회 대폭 증가
    const COL_WIDTH = 80; // 가로 간격
    const ROW_HEIGHT = 22; // 세로 간격 조정 (18 * 22 = 396px로 스크롤 X)

    // Overall dimensions
    const boardWidth = numCols * COL_WIDTH;
    const boardHeight = numRows * ROW_HEIGHT;

    // SVG viewbox logic: 
    // Leftmost line at x = COL_WIDTH / 2.
    // Rightmost line at x = boardWidth - (COL_WIDTH / 2).

    const getX = (colIdx) => (colIdx * COL_WIDTH) + (COL_WIDTH / 2);

    const [transitionDuration, setTransitionDuration] = useState(0);

    const generateLadder = () => {
        const newRungs = [];

        const totalGaps = numCols - 1;
        const totalSlots = numRows * totalGaps;

        // 1. 최소 간격 보장: 각 기둥 사이(gap)마다 최소 5개 이상의 선을 무조건 배치
        let gaps = Array.from({ length: totalGaps }, (_, i) => i);
        // 왼쪽부터 채우는 편향 방지를 위해 gap 채우는 순서 섞기
        gaps.sort(() => Math.random() - 0.5);

        for (let c of gaps) {
            let rowIndices = Array.from({ length: numRows }, (_, i) => i);
            rowIndices.sort(() => Math.random() - 0.5); // 행 위치도 무작위

            let placedCount = 0;
            // 각 기둥 사이에 5개를 무조건 보장 (사선 포함)
            for (let r of rowIndices) {
                if (placedCount >= 5) break;

                const hasLeft = (c > 0) && newRungs.some(rg => rg.r === r && rg.c === c - 1);
                const hasRight = (c < totalGaps - 1) && newRungs.some(rg => rg.r === r && rg.c === c + 1);

                if (!hasLeft && !hasRight) {
                    const rnd = Math.random();
                    let type = 'h';
                    if (rnd < 0.15) type = 'd1'; // 사선 발생 확률 15%
                    else if (rnd < 0.30) type = 'd2'; // 반대 방향 사선 발생 확률 15%

                    newRungs.push({ r, c, type });
                    placedCount++;
                }
            }
        }

        // 2. 전체적인 짜임새 보강: 기둥당 5개 배치 후 남은 전체 슬롯들을 모아서
        // 목표 밀도(약 45%)가 될 때까지 무작위로 추가 (풍성함 극대화)
        let extraSlots = [];
        for (let r = 0; r < numRows; r++) {
            for (let c = 0; c < totalGaps; c++) {
                if (!newRungs.some(rg => rg.r === r && rg.c === c)) {
                    extraSlots.push({ r, c });
                }
            }
        }

        extraSlots.sort(() => Math.random() - 0.5);
        const targetLines = Math.floor(totalSlots * 0.45);

        for (const slot of extraSlots) {
            if (newRungs.length >= targetLines) break;

            const r = slot.r;
            const c = slot.c;

            const hasLeft = (c > 0) && newRungs.some(rg => rg.r === r && rg.c === c - 1);
            const hasRight = (c < totalGaps - 1) && newRungs.some(rg => rg.r === r && rg.c === c + 1);

            if (!hasLeft && !hasRight) {
                const rnd = Math.random();
                let type = 'h';
                if (rnd < 0.15) type = 'd1';
                else if (rnd < 0.30) type = 'd2';

                newRungs.push({ r, c, type });
            }
        }

        // 2. 수직 고속도로(너무 많이 끊긴 기둥) 방지 및 보정
        for (let c = 0; c < numCols; c++) {
            let emptyCount = 0;
            for (let r = 0; r < numRows; r++) {
                const connectedRight = (c < numCols - 1) && newRungs.some(rg => rg.r === r && rg.c === c);
                const connectedLeft = (c > 0) && newRungs.some(rg => rg.r === r && rg.c === c - 1);

                if (!connectedRight && !connectedLeft) {
                    emptyCount++;
                } else {
                    emptyCount = 0;
                }

                if (emptyCount >= 4) { // 4칸 연속 비어있으면 양쪽 빈칸 어딘가에 강제 연결
                    let options = [];
                    if (c < numCols - 1) options.push(c);
                    if (c > 0) options.push(c - 1);
                    options.sort(() => Math.random() - 0.5);

                    for (let optC of options) {
                        const hasL = (optC > 0) && newRungs.some(rg => rg.r === r && rg.c === optC - 1);
                        const hasR = (optC < numCols - 2) && newRungs.some(rg => rg.r === r && rg.c === optC + 1);
                        if (!hasL && !hasR) { // 넣으려는 위치 옆이 안 막혀있으면 강제 추가
                            newRungs.push({ r, c: optC, type: 'h' });
                            break;
                        }
                    }
                    emptyCount = 0;
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
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [numCols]);

    const runLadder = async (index) => {
        if (animatingIndex !== null || completedHistory.some(h => h.startIndex === index)) return;

        // Find path
        let currentC = index;
        // Start from top (r=-1 to r=0 is the first step visually)
        // We track nodes as coordinates directly for smooth animation

        let pathPoints = [];
        // Start Point (Top of SVG line)
        pathPoints.push({ x: getX(currentC), y: 0 });

        for (let r = 0; r < numRows; r++) {
            // Move down to next row center
            // const y1 = r * ROW_HEIGHT;
            // const y2 = (r + 1) * ROW_HEIGHT; // Bottom of this row segment usually 

            // Actually, rungs are usually placed at the *bottom* of a row segment or middle.
            // Let's say rungs are at y = r * ROW_HEIGHT + (ROW_HEIGHT / 2)

            // Better logic: Walk down unit by unit
            const midY = (r * ROW_HEIGHT) + (ROW_HEIGHT / 2);

            // 2. Check for horizontal bridge
            const rightBridge = rungs.find(rg => rg.r === r && rg.c === currentC);
            const leftBridge = rungs.find(rg => rg.r === r && rg.c === currentC - 1);

            if (rightBridge) {
                // Move Right
                let y1 = midY, y2 = midY;
                if (rightBridge.type === 'd1') { y1 = midY - 12; y2 = midY + 12; }
                if (rightBridge.type === 'd2') { y1 = midY + 12; y2 = midY - 12; }

                pathPoints.push({ x: getX(currentC), y: y1 });
                currentC++;
                pathPoints.push({ x: getX(currentC), y: y2 });
            } else if (leftBridge) {
                // Move Left
                let y1 = midY, y2 = midY;
                if (leftBridge.type === 'd1') { y1 = midY + 12; y2 = midY - 12; }
                if (leftBridge.type === 'd2') { y1 = midY - 12; y2 = midY + 12; }

                pathPoints.push({ x: getX(currentC), y: y1 });
                currentC--;
                pathPoints.push({ x: getX(currentC), y: y2 });
            } else {
                pathPoints.push({ x: getX(currentC), y: midY });
            }

            // 3. Move vertical from mid of cell to bottom of cell (which is top of next)
            // const bottomY = (r + 1) * ROW_HEIGHT;
            // We'll add this point in next iteration as top of cell, or at end
        }

        // Add final point at very bottom
        pathPoints.push({ x: getX(currentC), y: boardHeight });

        setAnimatingIndex(index);
        setMarkerEmoji(ANIMALS[index % ANIMALS.length]);

        // Initial position before animation loop
        setMarkerPos({ x: pathPoints[0].x, y: pathPoints[0].y });
        setTransitionDuration(0);

        // Slight pause before start
        await new Promise(r => setTimeout(r, 100));

        // Animate
        for (let i = 1; i < pathPoints.length; i++) {
            const pPrev = pathPoints[i - 1];
            const pNext = pathPoints[i];

            // Determine ease and duration
            const isHorizontal = pPrev.y === pNext.y;
            // Slower speed: Horizontal longer than vertical
            const durationSec = isHorizontal ? 0.3 : 0.2;

            setTransitionDuration(durationSec);
            setMarkerPos({ x: pNext.x, y: pNext.y });
            setCurrentStepPath(pathPoints.slice(0, i + 1));

            // Wait just a bit longer than duration to ensure smoothness
            await new Promise(r => setTimeout(r, durationSec * 1000));
        }

        const isWinner = currentC === winnerIndexAtBottom;
        const finalEmoji = isWinner ? '😭' : '😆'; // 당첨(Win) = Crying / Pass = Laughing

        setMarkerEmoji(finalEmoji);
        setCompletedHistory(prev => [...prev, {
            startIndex: index,
            name: participants[index],
            emoji: finalEmoji,
            color: PATH_COLORS[index % PATH_COLORS.length],
            isWinner,
            pathPoints,
            finalColIndex: currentC, // Store final column index
            finalPos: { x: getX(currentC), y: boardHeight + 20 }
        }]);
        setAnimatingIndex(null);
        setCurrentStepPath([]);
        onGameEnd('🪜 사다리', `${participants[index]} -> ${isWinner ? '당첨' : '통과'}`);
    };

    return (
        <div className={styles.ladderBox}>
            <div className={styles.ladderScrollArea}>
                <div className={styles.ladderGridContainer} style={{ width: boardWidth + 40 }}>

                    {/* Header: Names */}
                    <div className={styles.ladderHeader}>
                        {participants.map((name, i) => {
                            const done = completedHistory.find(h => h.startIndex === i);
                            return (
                                <div key={i} className={styles.ladderNodeCol} style={{ width: COL_WIDTH }}>
                                    <div
                                        className={`${styles.node} ${done ? styles.nodeDone : ''}`}
                                        onClick={() => runLadder(i)}
                                        style={{ borderColor: done ? (done.isWinner ? '#ef4444' : '#10b981') : '#e2e8f0' }}
                                    >
                                        <div className={styles.nodeIcon}>{ANIMALS[i % ANIMALS.length]}</div>
                                        <div className={styles.nodeLabel}>{name}</div>
                                    </div>
                                    {/* Visual Connector to Line */}
                                    <div style={{
                                        position: 'absolute', bottom: -24, left: '50%', width: 2, height: 24,
                                        background: done ? (completedHistory.find(h => h.startIndex === i).color) : '#cbd5e1',
                                        transform: 'translateX(-1px)', zIndex: 10
                                    }} />
                                </div>
                            );
                        })}
                    </div>

                    {/* Body: SVG Lines */}
                    <div className={styles.ladderBody} style={{ height: boardHeight }}>
                        <svg className={styles.ladderLines} width="100%" height="100%">
                            <g stroke="#cbd5e1" strokeWidth="3" strokeLinecap="round">
                                {/* Vertical Lines */}
                                {Array.from({ length: numCols }).map((_, i) => (
                                    <line key={`v-${i}`} x1={getX(i)} y1="0" x2={getX(i)} y2="100%" />
                                ))}
                                {/* Horizontal & Diagonal Rungs */}
                                {rungs.map((rung, i) => {
                                    const midY = (rung.r * ROW_HEIGHT) + (ROW_HEIGHT / 2);
                                    let y1 = midY, y2 = midY;
                                    if (rung.type === 'd1') { y1 = midY - 12; y2 = midY + 12; }
                                    if (rung.type === 'd2') { y1 = midY + 12; y2 = midY - 12; }
                                    return (
                                        <line key={`h-${i}`} x1={getX(rung.c)} y1={y1} x2={getX(rung.c + 1)} y2={y2} />
                                    );
                                })}
                            </g>

                            {/* Completed Paths */}
                            {completedHistory.map((h, i) => (
                                <path
                                    key={`path-${i}`}
                                    d={`M ${h.pathPoints.map(p => `${p.x},${p.y}`).join(' L ')}`}
                                    stroke={h.color} fill="none" strokeWidth="5" opacity="0.4"
                                />
                            ))}

                            {/* Active Path */}
                            {currentStepPath.length > 0 && (
                                <motion.path
                                    d={`M ${currentStepPath.map(p => `${p.x},${p.y}`).join(' L ')}`}
                                    stroke={PATH_COLORS[animatingIndex % PATH_COLORS.length]}
                                    fill="none" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round"
                                />
                            )}
                        </svg>

                        {/* Active Marker */}
                        <AnimatePresence>
                            {animatingIndex !== null && (
                                <motion.div
                                    key="marker"
                                    className={styles.activeMarker}
                                    animate={{ left: markerPos.x, top: markerPos.y }}
                                    transition={{ duration: transitionDuration, ease: "linear" }}
                                >
                                    <span className={styles.emojiLarge}>{markerEmoji}</span>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>

                    {/* Footer: Results */}
                    <div className={styles.ladderFooter}>
                        {Array.from({ length: numCols }).map((_, i) => {
                            const resultUser = completedHistory.find(h => h.finalColIndex === i);
                            return (
                                <div key={i} className={styles.ladderPrizeCol} style={{ width: COL_WIDTH, flexDirection: 'column', alignItems: 'center', position: 'relative' }}>
                                    {/* Visual Connector from Line */}
                                    <div style={{
                                        position: 'absolute', top: -20, left: '50%', width: 2, height: 20,
                                        background: '#cbd5e1', transform: 'translateX(-1px)', zIndex: 10
                                    }} />

                                    {/* Result Emoji if arrived */}
                                    {resultUser && (
                                        <div style={{ marginBottom: 4, zIndex: 20 }}>
                                            <span className={styles.emojiSmall}>{resultUser.emoji}</span>
                                        </div>
                                    )}

                                    <div className={`${styles.prizeTag} ${i === winnerIndexAtBottom ? styles.prizeWin : styles.prizePass}`} style={{ zIndex: 1 }}>
                                        {i === winnerIndexAtBottom ? '당첨' : '통과'}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
            <div className={styles.gameActions}>
                <button className={styles.premiumBtn} onClick={generateLadder}>🔄 게임판 리셋</button>
            </div>
        </div>
    );
};

export default LadderGame;
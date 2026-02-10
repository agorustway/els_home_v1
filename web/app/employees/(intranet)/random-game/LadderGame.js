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
    const numRows = 10; // 높이를 조금 더 줄임 (12 -> 10)
    const COL_SPACE = 120;
    const paddingX = 60;
    const rowHeight = 35; 
    const boardHeight = numRows * rowHeight; // 350px
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
        setCurrentStepPath([]);
        setWinnerIndexAtBottom(Math.floor(Math.random() * numCols));
    };

    useEffect(() => { generateLadder(); }, [numCols]);

    const runLadder = async (index) => {
        if (animatingIndex !== null || completedHistory.some(h => h.startIndex === index)) return;
        
        let currentC = index;
        const path = [{ c: currentC, r: 0 }];
        for (let r = 1; r <= numRows; r++) {
            const left = rungs.find(rg => rg.r === r && rg.c === currentC - 1);
            const right = rungs.find(rg => rg.r === r && rg.c === currentC);
            path.push({ c: currentC, r });
            if (left) { currentC--; path.push({ c: currentC, r }); }
            else if (right) { currentC++; path.push({ c: currentC, r }); }
        }

        setAnimatingIndex(index);
        setMarkerEmoji(ANIMALS[index % ANIMALS.length]);
        const visiblePoints = [];
        for (let i = 0; i < path.length; i++) {
            visiblePoints.push(path[i]);
            setCurrentStepPath([...visiblePoints]);
            setMarkerPos({ x: path[i].c * COL_SPACE + paddingX, y: path[i].r * rowHeight });
            await new Promise(r => setTimeout(r, i === 0 ? 300 : 180));
        }

        const isWinner = path[path.length - 1].c === winnerIndexAtBottom;
        const finalEmoji = isWinner ? '😭' : '😆';
        setMarkerEmoji(finalEmoji);
        setCompletedHistory(prev => [...prev, {
            startIndex: index, name: participants[index], emoji: finalEmoji, color: PATH_COLORS[index % PATH_COLORS.length],
            isWinner, path, finalPos: { x: path[path.length - 1].c * COL_SPACE + paddingX, y: boardHeight }
        }]);
        setAnimatingIndex(null);
        setCurrentStepPath([]);
        onGameEnd('🪜 사다리', `${participants[index]} -> ${isWinner ? '당첨' : '통과'}`);
    };

    return (
        <div className={styles.ladderBox}>
            <div className={styles.ladderViewport}>
                {/* 컨테이너 높이 줄임 (boardHeight + 180 -> + 140) */}
                <div className={styles.ladderContainer} style={{ width: boardWidth, height: boardHeight + 140 }}>
                    {/* Header: 상단 밀착 */}
                    <div className={styles.ladderHeaderRow} style={{ height: '70px' }}>
                        {participants.map((name, i) => {
                            const done = completedHistory.find(h => h.startIndex === i);
                            return (
                                <div key={`head-${i}-${name}`} className={styles.ladderNodeWrapper} style={{ left: i * COL_SPACE + paddingX }}>
                                    <div className={`${styles.node} ${done ? styles.nodeDone : ''}`} onClick={() => runLadder(i)}
                                        style={{ opacity: done && animatingIndex !== i ? 0.6 : 1, borderColor: done ? (done.isWinner ? '#ef4444' : '#10b981') : '#e2e8f0' }}>
                                        <div className={styles.nodeIcon}>{ANIMALS[i % ANIMALS.length]}</div>
                                        <div className={styles.nodeLabel}>{name}</div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {/* Board: margin-top 축소 (110 -> 80) */}
                    <div className={styles.ladderBoard} style={{ top: 80, height: boardHeight }}>
                        <svg className={styles.ladderLines} width="100%" height="100%">
                            <g stroke="#cbd5e1" strokeWidth="2.5">
                                {Array.from({ length: numCols }).map((_, i) => (<line key={`v-${i}`} x1={i * COL_SPACE + paddingX} y1="0" x2={i * COL_SPACE + paddingX} y2="100%" />))}
                                {rungs.map((rung, i) => (<line key={`h-${i}`} x1={rung.c * COL_SPACE + paddingX} y1={rung.r * rowHeight} x2={(rung.c + 1) * COL_SPACE + paddingX} y2={rung.r * rowHeight} />))}
                            </g>
                            {completedHistory.map((h, i) => (<path key={`path-${i}`} d={`M ${h.path.map(p => `${p.c * COL_SPACE + paddingX},${p.r * rowHeight}`).join(' L ')}`} stroke={h.color} fill="none" strokeWidth="4" opacity="0.3" strokeDasharray="5,3" />))}
                            {currentStepPath.length > 0 && (
                                <motion.path key="active-path" d={`M ${currentStepPath.map(p => `${p.c * COL_SPACE + paddingX},${p.r * rowHeight}`).join(' L ')}`} stroke={PATH_COLORS[animatingIndex % PATH_COLORS.length]} fill="none" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.25, ease: "linear" }} />
                            )}
                        </svg>
                        <AnimatePresence>
                            {animatingIndex !== null && (
                                <motion.div key="marker" className={styles.activeMarker} animate={{ left: markerPos.x, top: markerPos.y }} transition={{ type: 'tween', ease: 'linear', duration: 0.25 }}>
                                    <span className={styles.emojiLarge}>{markerEmoji}</span>
                                    <div className={styles.markerNameTag}>{participants[animatingIndex]}</div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                        {completedHistory.map((h, i) => (<div key={`static-${i}`} className={styles.staticMarker} style={{ left: h.finalPos.x, top: h.finalPos.y + 20 }}><span className={styles.emojiSmall}>{h.emoji}</span></div>))}
                    </div>

                    {/* Footer: 결과 버튼 간격 확보 */}
                    <div className={styles.ladderFooterRow} style={{ top: boardHeight + 100 }}>
                        {Array.from({ length: numCols }).map((_, i) => (
                            <div key={`foot-${i}`} className={styles.ladderPrizeWrapper} style={{ left: i * COL_SPACE + paddingX }}>
                                <div className={`${styles.prizeTag} ${i === winnerIndexAtBottom ? styles.prizeWin : styles.prizePass}`}>{i === winnerIndexAtBottom ? '당첨' : '통과'}</div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
            
            {/* 다시 그리기 버튼: 하단 배치 */}
            <div className={styles.gameActions} style={{ marginTop: '20px' }}>
                <button className={styles.premiumBtn} onClick={generateLadder}>🔄 사다리 다시 그리기</button>
            </div>
        </div>
    );
};
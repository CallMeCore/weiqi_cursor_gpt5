const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const startBtn = document.getElementById('startBtn');
const passBtn = document.getElementById('passBtn');
const sizeSel = document.getElementById('boardSize');
const komiInput = document.getElementById('komi');
const humanColorSel = document.getElementById('humanColor');
const modeSel = document.getElementById('mode');
const aiTimeInput = document.getElementById('aiTime');
const statusEl = document.getElementById('status');
const logEl = document.getElementById('log');
const toggleLog = document.getElementById('toggleLog');

let ws = null;
let state = {
  boardSize: 19,
  grid: [], // 'B' | 'W' | null
  turn: 'B',
  humanColor: 'B',
  komi: 7.5,
  stoneRadius: 16,
  padding: 30,
  lastMove: null
};
let lastTentative = null;
let aiTimerId = null;
let aiTimerStart = 0;

function log(msg) {
  const d = document.createElement('div');
  d.textContent = msg;
  logEl.prepend(d);
}

function setStatus(s) { statusEl.textContent = s; }

function initBoard() {
  state.boardSize = parseInt(sizeSel.value, 10);
  state.komi = parseFloat(komiInput.value);
  state.humanColor = humanColorSel.value;
  state.mode = modeSel ? modeSel.value : 'human-ai';
  state.aiTime = Math.min(10, Math.max(1, parseInt(aiTimeInput?.value || '5', 10)));
  state.turn = 'B';
  state.grid = Array.from({ length: state.boardSize }, () => Array(state.boardSize).fill(null));
  // reset highlights and any tentative marker BEFORE first draw
  state.lastMove = null;
  lastTentative = null;
  resizeCanvas();
  drawBoard();
}

function resizeCanvas() {
  const size = 40 * (state.boardSize - 1) + state.padding * 2;
  canvas.width = size;
  canvas.height = size;
}

function drawBoard() {
  const N = state.boardSize;
  const pad = state.padding;
  const gap = (canvas.width - pad * 2) / (N - 1);

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#f7f4e8';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.strokeStyle = '#b38b45';
  ctx.lineWidth = 1;
  for (let i = 0; i < N; i++) {
    const x = pad + i * gap;
    const y = pad + i * gap;
    ctx.beginPath();
    ctx.moveTo(pad, y);
    ctx.lineTo(canvas.width - pad, y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x, pad);
    ctx.lineTo(x, canvas.height - pad);
    ctx.stroke();
  }

  // star points for 19x19
  if (N === 19) {
    const stars = [3, 9, 15];
    ctx.fillStyle = '#333';
    for (const sy of stars) for (const sx of stars) {
      const x = pad + sx * gap;
      const y = pad + sy * gap;
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // stones
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      if (!state.grid[y][x]) continue;
      drawStone(x, y, state.grid[y][x]);
    }
  }

  // highlight last move
  if (state.lastMove && state.lastMove.x != null && state.lastMove.y != null) {
    drawLastMove(state.lastMove.x, state.lastMove.y);
  }
}

function gridToCanvas(x, y) {
  const N = state.boardSize;
  const pad = state.padding;
  const gap = (canvas.width - pad * 2) / (N - 1);
  return { cx: pad + x * gap, cy: pad + y * gap };
}

function canvasToGrid(mx, my) {
  const N = state.boardSize;
  const pad = state.padding;
  const gap = (canvas.width - pad * 2) / (N - 1);
  const x = Math.round((mx - pad) / gap);
  const y = Math.round((my - pad) / gap);
  if (x < 0 || x >= N || y < 0 || y >= N) return null;
  return { x, y };
}

function drawStone(x, y, color) {
  const { cx, cy } = gridToCanvas(x, y);
  const r = state.stoneRadius;
  ctx.save();
  // soft shadow to lift stones from board
  ctx.shadowColor = 'rgba(0,0,0,0.25)';
  ctx.shadowBlur = 4;
  ctx.shadowOffsetY = 1;

  const grad = ctx.createRadialGradient(cx - r/3, cy - r/3, Math.max(1, r/4), cx, cy, r);
  if (color === 'B') {
    grad.addColorStop(0, '#5a5a5a');
    grad.addColorStop(1, '#0a0a0a');
  } else {
    // Stronger edge to stand out against the board
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(0.6, '#eeeeee');
    grad.addColorStop(1, '#bebebe');
  }
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();

  // subtle outline to improve contrast, especially for white stones
  ctx.shadowColor = 'transparent';
  if (color === 'W') {
    ctx.strokeStyle = 'rgba(0,0,0,0.45)';
    ctx.lineWidth = 1.2;
  } else {
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.lineWidth = 1.0;
  }
  ctx.stroke();
  ctx.restore();
}

function drawLastMove(x, y) {
  const { cx, cy } = gridToCanvas(x, y);
  const r = state.stoneRadius * 0.6;
  ctx.save();
  ctx.strokeStyle = '#ffcc00';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

canvas.addEventListener('click', (e) => {
  if (!ws || ws.readyState !== WebSocket.OPEN) { log('WS 未连接'); return; }
  const rect = canvas.getBoundingClientRect();
  const pt = canvasToGrid(e.clientX - rect.left, e.clientY - rect.top);
  if (!pt) { log('点位超出棋盘'); return; }
  if (state.grid[pt.y][pt.x]) { log('该点已有棋'); return; }

  // 人机：仅允许与 humanColor 一致的一方落子；人人：允许当前手方
  if (state.mode === 'human-ai') {
    if (state.turn !== state.humanColor) { log('未到你走'); return; }
    playHuman(pt, state.humanColor);
  } else {
    playHuman(pt, state.turn);
  }
});

passBtn.addEventListener('click', () => {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  const color = state.mode === 'human-ai' ? state.humanColor : state.turn;
  if (state.mode === 'human-ai' && state.turn !== state.humanColor) return;
  playHuman(null, color);
});

function playHuman(move, color) {
  tentativePlace(move, color);
  if (state.mode === 'human-ai') {
    startAiTimer();
    passBtn.disabled = true;
  }
  ws.send(JSON.stringify({ type: 'humanMove', payload: { color, move } }));
}

function placeMoveOnBoard(move, color) {
  if (move) {
    const { x, y } = move;
    state.grid[y][x] = color;
  }
  state.turn = color === 'B' ? 'W' : 'B';
  drawBoard();
}

function tentativePlace(move, color) {
  // 仅本地展示，最终以服务器棋盘为准
  if (move) {
    const { x, y } = move;
    state.grid[y][x] = color;
    lastTentative = { x, y };
  }
  state.turn = color === 'B' ? 'W' : 'B';
  drawBoard();
}

startBtn.addEventListener('click', () => {
  initBoard();
  connect();
});

toggleLog.addEventListener('change', () => {
  logEl.style.display = toggleLog.checked ? 'block' : 'none';
});

function connect() {
  if (ws) ws.close();
  ws = new WebSocket(getWsUrl());
  ws.onopen = null;
  ws.onopen = () => {
    setStatus('连接成功，初始化引擎...');
    ws.send(JSON.stringify({
      type: 'init',
      payload: { boardSize: state.boardSize, komi: state.komi, rules: 'Chinese', mode: state.mode, humanColor: state.humanColor, aiTime: state.aiTime }
    }));
  };
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    log('[WS] ' + msg.type);
    if (msg.type === 'inited') {
      setStatus('对局已开始');
      passBtn.disabled = false;
      if (state.mode === 'human-ai' && state.humanColor === 'W') {
        startAiTimer();
        ws.send(JSON.stringify({ type: 'genmove', payload: { color: 'B' } }));
      }
      if (state.mode === 'ai-ai') {
        ws.send(JSON.stringify({ type: 'startAuto' }));
      }
      return;
    }
    if (msg.type === 'error' && msg.payload === 'engine not ready') {
      setStatus('引擎未就绪，请稍候...');
      return;
    }
    if (msg.type === 'syncBoard') {
      if (Array.isArray(msg.payload.board)) {
        state.grid = msg.payload.board;
        if (lastTentative) state.lastMove = { ...lastTentative };
        lastTentative = null;
        if (msg.payload.next) state.turn = msg.payload.next;
        drawBoard();
        log('[同步] 棋盘已同步');
        if (msg.payload.rawBoard) log(msg.payload.rawBoard);
        if (state.mode === 'human-human') {
          setStatus('轮到你了');
          passBtn.disabled = false;
        }
      }
      return;
    }
    if (msg.type === 'aiMove') {
      const move = msg.payload.coord; // null for pass
      if (Array.isArray(msg.payload.board)) {
        // 以服务器棋盘为准（含提子）
        state.grid = msg.payload.board;
        if (msg.payload.next) state.turn = msg.payload.next;
      } else {
        if (move) placeMoveOnBoard(move, state.turn);
        else { state.turn = state.turn === 'B' ? 'W' : 'B'; }
      }
      state.lastMove = move || null;
      drawBoard();
      stopAiTimer();
      setStatus('轮到你了');
      passBtn.disabled = false;
      log('AI: ' + (move ? `${move.x},${move.y}` : 'PASS'));
      if (msg.payload.rawBoard) log(msg.payload.rawBoard);
      return;
    }
    if (msg.type === 'illegal') {
      const message = msg.payload && msg.payload.message ? msg.payload.message : '非法落子';
      log('[非法] ' + message);
      alert('你的落子不合法：' + message);
      stopAiTimer();
      if (msg.payload && Array.isArray(msg.payload.board)) {
        state.grid = msg.payload.board;
      } else if (lastTentative) {
        const { x, y } = lastTentative;
        if (state.grid[y] && state.grid[y][x]) state.grid[y][x] = null;
      }
      lastTentative = null;
      state.lastMove = null;
      // rollback turn
      state.turn = state.humanColor;
      passBtn.disabled = false;
      drawBoard();
      return;
    }
    if (msg.type === 'error') {
      setStatus('错误：' + msg.payload);
      return;
    }
  };
  ws.onclose = () => setStatus('连接关闭');
}

function getWsUrl() {
  const params = new URLSearchParams(window.location.search);
  const override = params.get('ws') || localStorage.getItem('weiqi_ws');
  if (override) return override;
  const l = window.location;
  const proto = l.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${l.host}`;
}

// 初始绘制 + 支持 autostart
initBoard();
drawBoard();

(function maybeAutoStart(){
  const p = new URLSearchParams(window.location.search);
  if (p.get('autostart') === '1') {
    const size = parseInt(p.get('size') || '19', 10);
    const komi = parseFloat(p.get('komi') || '7.5');
    const color = (p.get('color') || 'B').toUpperCase();
    if ([9,13,19].includes(size)) sizeSel.value = String(size);
    if (!Number.isNaN(komi)) komiInput.value = String(komi);
    if (color === 'B' || color === 'W') humanColorSel.value = color;
    startBtn.click();
  }
})();

function startAiTimer() {
  stopAiTimer();
  aiTimerStart = Date.now();
  const update = () => {
    const secs = Math.floor((Date.now() - aiTimerStart) / 1000);
    setStatus(`AI 思考中...${secs}秒`);
  };
  update();
  aiTimerId = setInterval(update, 500);
}

function stopAiTimer() {
  if (aiTimerId) {
    clearInterval(aiTimerId);
    aiTimerId = null;
  }
}



const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const startBtn = document.getElementById('startBtn');
const passBtn = document.getElementById('passBtn');
const sizeSel = document.getElementById('boardSize');
const komiInput = document.getElementById('komi');
const humanColorSel = document.getElementById('humanColor');
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
  state.turn = 'B';
  state.grid = Array.from({ length: state.boardSize }, () => Array(state.boardSize).fill(null));
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
  const grad = ctx.createRadialGradient(cx - r/3, cy - r/3, Math.max(1, r/4), cx, cy, r);
  if (color === 'B') {
    grad.addColorStop(0, '#666');
    grad.addColorStop(1, '#000');
  } else {
    grad.addColorStop(0, '#fff');
    grad.addColorStop(1, '#ddd');
  }
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
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
  if (state.turn !== state.humanColor) { log('未到你走'); return; }
  const rect = canvas.getBoundingClientRect();
  const pt = canvasToGrid(e.clientX - rect.left, e.clientY - rect.top);
  if (!pt) { log('点位超出棋盘'); return; }
  if (state.grid[pt.y][pt.x]) { log('该点已有棋'); return; }

  playHuman(pt);
});

passBtn.addEventListener('click', () => {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  if (state.turn !== state.humanColor) return;
  playHuman(null);
});

function playHuman(move) {
  tentativePlace(move, state.humanColor);
  setStatus('AI 思考中...');
  passBtn.disabled = true;
  ws.send(JSON.stringify({ type: 'humanMove', payload: { color: state.humanColor, move } }));
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
  state.lastMove = null;
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
      payload: { boardSize: state.boardSize, komi: state.komi, rules: 'Chinese' }
    }));
  };
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    log('[WS] ' + msg.type);
    if (msg.type === 'inited') {
      setStatus('对局已开始');
      passBtn.disabled = false;
      if (state.humanColor === 'W') {
        // 立即请求 AI 执黑先行
        setStatus('AI 先行...');
        ws.send(JSON.stringify({ type: 'genmove', payload: { color: 'B' } }));
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
  const l = window.location;
  const proto = l.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${l.host}`;
}

// 初始绘制
initBoard();
drawBoard();



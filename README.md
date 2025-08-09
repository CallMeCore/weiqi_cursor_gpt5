# 在线围棋 - 人机对战（GTP/KataGo）

- 前端：原生 Canvas 棋盘 + WebSocket
- 后端：Node.js（Express + ws），对接 GTP 围棋引擎（建议 KataGo）

## 快速开始

1) 配置引擎：编辑 `server/config/engine.json`
- Windows 示例：
  - `command`: `C:/katago/katago.exe`
  - `args`: `["gtp", "-model", "C:/katago/models/model.bin.gz", "-config", "C:/katago/configs/gtp_example.cfg"]`

2) 启动服务：
- 终端执行：
  - `cd server`
  - `npm install`
  - `npm start`

3) 浏览器打开：`http://localhost:8080`

## 使用说明

- 选择棋盘大小、贴目和人类执色，点击“开始对局”。
- 人类落子后，后端以 GTP `play` 验证；随后用 `genmove` 让 AI 落子。
- 每步后端会 `showboard` 并把全盘同步到前端，前端以服务器棋盘为准（正确显示提子/停一手）。

## 注意

- 若显示 unknown command `kata-set-rule`，说明引擎不支持该自定义命令，已自动忽略。
- 如果 KataGo 不在 PATH，请把 `engine.json` 中的 `command` 改为绝对路径。

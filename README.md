# ARG Framework · 网页文本解密类 ARG 框架

内容与引擎分离的可复用 ARG 框架。引擎只负责：路由、状态存档、线索进度、条件判定、聊天、结局。所有剧情都写在 `content/story.json` 里。

## 目录结构

```
arg-framework/
├── index.html            # 入口（加载引擎 + 剧情包 + 主题）
├── engine/
│   └── arg-runtime.js    # 通用引擎（与具体故事无关）
├── content/
│   └── story.json        # 剧情包（换一个故事 = 换这个文件）
└── themes/
    └── retro2001.css     # 主题样式（可换）
```

## 运行

需通过 HTTP 服务打开（不要直接双击 index.html）：

```bash
cd arg-framework
python -m http.server 8080
# 打开 http://localhost:8080/
```

路由使用 hash：`#/page/房间ID`，支持浏览器前进/后退。

## story.json 结构

```jsonc
{
  "meta": { "title": "...", "start": "工作台ID", "storageKey": "arg-save-xxx" },
  "clues": { "线索ID": "线索名" },           // 收集后计入进度，进度 = 收集数/总数
  "suspects": ["嫌疑人A", "嫌疑人B", "？？"],
  "nodes": [
    {
      "id": "n_room",
      "type": "browse",                       // browse | chat | login | files | ending | workbench
      "title": "疗养院·入室调查",
      "body": "正文…\n支持多段",
      "links": [ { "label": "检查窗沿的鞋印", "to": "n_window", "requires": [] } ],
      "clue": "n_window"                      // 进入即收集的线索（可选）
    },
    {
      "id": "n_contacts",
      "type": "chat",
      "title": "木巳的通讯记录",
      "contacts": [ {
        "name": "柳莺", "avatar": "🕊️", "bio": "…",
        "messages": [ { "sender": "npc", "text": "…" } ],
        "options": [ {
          "text": "选项文字", "reply": "点击后的回复",
          "to": "n_lingying",                 // 点击后跳转（可空）
          "requires": [ "clueId" ],           // 可选：需持有线索才可点
          "clue": "某线索ID"                  // 可选：点击后收集的线索
        } ]
      } ]
    },
    { "id": "n_login", "type": "login", "title": "…", "systemName": "…",
      "password": "TEIN0415", "hint": "…", "success": "n_truth" },
    { "id": "n_truth", "type": "files", "title": "…", "path": "D:/…", "body": "…", "clue": "n_truth" },
    { "id": "n_end1", "type": "ending", "title": "结局一…", "body": "…" }
  ],
  "verdictPage": {                             // 最终章判词（type: "verdict" 的节点）
    "intro": ["说明段落…"],
    "choices": [ {
      "label": "判词一：指认特因…", "ending": "n_end1",
      "requires": { "clues": ["n_theresa1"], "progressMax": 49 }
    } ]
  }
}
```

## 关键词收集与组合（v2）

- **正文内点击收集**：body 中写 `[[线索ID|显示文字]]`，渲染为可点击关键词，点击即记录线索；已收集后变为灰色。场景线索不再随页面进入自动获得（仅档案/人物页可保留 `clue` 自动收集）。
- **组合配方**：全局 `combos` 数组，`{ id, keywords:[两条线索], title, result, clue?, to?, flag? }`。在工作台的分析板中选两个已收集关键词尝试拼合。
- **选项/链接分阶段出现**：links 和聊天 options 支持 `hideRequires`（条件未满足时完全不显示，而非置灰）与 `setFlag`（点击后设置旗标，用于解锁后续文本）。evalRequires 支持 `{ clues:[], flags:[], progressMin, progressMax }`。
- 聊天选项点击后只刷新当前会话，已触发的回复气泡会回显。

## 条件系统（requires）

节点 links / 聊天选项 / 判词 都支持：

- `["clueId", "clueId2"]` — 简写：需持有全部线索
- 对象 `{ "clues": [...], "progressMin": 50, "progressMax": 99, "flag": "loginUnlocked" }` — 精确控制

条件不满足时显示但置灰，并提示所缺条件。

## 存档

localStorage（key 由 `meta.storageKey` 决定）：线索、已展开的聊天选项、旗标、已提交判词。控制台执行
`localStorage.removeItem('arg-save-xxx')` 可重置。

## 换故事

1. 写一个新的 `story.json`（或改 `index.html` 里 `STORY_URL` 指向别的包）；
2. 换 `themes/*.css` 可整体换皮。

/*
 * 每日记忆总结 (daily-memory-summary)
 * 按天分割会话短期记忆，导入人设与世界书，自定义思维链与格式生成每日总结。
 * 风格：深色梦幻星河 + 毛玻璃，无廉价 emoji。
 */
(function () {
  "use strict";

  const ROOT_CLASS = "roche-plugin-dms";
  const STORAGE_SETTINGS = "dms-settings";
  const STORAGE_SUMMARIES = "dms-summaries";

  /* ---------- 默认设置 ---------- */
  const DEFAULT_SETTINGS = {
    showFacts: false,
    showCore: false,
    useWorldbook: false,
    worldbookCategories: [], // 选中的分类 id
    worldbookEntries: [],    // 选中的词条 id
    thinkingChain: [
      "1. 人设加载：确认 user 与 char 的身份、关系、性格基线。",
      "2. 记忆回溯：扫描当日全部短期消息，识别关键事件、情绪转折、承诺与冲突。",
      "3. 关系进展：判断当日双方关系的变化方向与强度。",
      "4. 待办与伏笔：提取未完成的承诺、悬念、可能的后续剧情钩子。",
      "5. 防崩自检：确认不捏造 user 未输入的言行，不抢话，不出戏。"
    ].join("\n"),
    summaryFormat: [
      "【日期】{date}",
      "【会话】{conversation}",
      "",
      "## 情感与关系",
      "{relation}",
      "",
      "## 关键事件",
      "{events}",
      "",
      "## 重要承诺与伏笔",
      "{pending}",
      "",
      "## 角色内心活动",
      "{inner}"
    ].join("\n"),
    syncToFactMemory: false,
    autoSyncAfterGenerate: false,
    messageLimit: 5000
  };

  /* ---------- 工具 ---------- */
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  function el(tag, props = {}, ...children) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) {
      if (v == null) continue;
      if (k === "class") node.className = v;
      else if (k === "style" && typeof v === "object") Object.assign(node.style, v);
      else if (k === "html") node.innerHTML = v;
      else if (k.startsWith("on") && typeof v === "function") {
        node.addEventListener(k.slice(2).toLowerCase(), v);
      } else if (k === "attrs") {
        for (const [ak, av] of Object.entries(v)) node.setAttribute(ak, av);
      } else node.setAttribute(k, v);
    }
    for (const c of children.flat()) {
      if (c == null || c === false) continue;
      node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    }
    return node;
  }

  function escapeHtml(s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[c]));
  }

  function pad2(n) { return String(n).padStart(2, "0"); }

  // 本地时区某天的 00:00:00.000
  function startOfDay(d) {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x;
  }
  // 本地时区次日 00:00:00.000
  function endOfDay(d) { return startOfDay(d).getTime() + 24 * 3600 * 1000; }

  function toDateKey(d) {
    const x = new Date(d);
    return `${x.getFullYear()}-${pad2(x.getMonth() + 1)}-${pad2(x.getDate())}`;
  }

  function fmtDateTime(ms) {
    const x = new Date(ms);
    return `${pad2(x.getHours())}:${pad2(x.getMinutes())}`;
  }

  function toDateInputValue(d) {
    const x = new Date(d);
    return `${x.getFullYear()}-${pad2(x.getMonth() + 1)}-${pad2(x.getDate())}`;
  }

  function parseDateInputValue(v) {
    const [y, m, d] = v.split("-").map(Number);
    return new Date(y, m - 1, d, 0, 0, 0, 0);
  }

  // 兼容秒/毫秒时间戳
  function toMs(ts) {
    const n = Number(ts);
    if (!n) return Date.now();
    return n < 1e12 ? n * 1000 : n;
  }

  // 渲染占位符
  function fillTemplate(tpl, vars) {
    return String(tpl || "").replace(/\{(\w+)\}/g, (m, key) => {
      return vars[key] != null ? String(vars[key]) : "";
    });
  }

  /* ---------- 数据加载层 ---------- */
  async function loadConversations(roche) {
    try {
      return await roche.conversation.list();
    } catch (e) {
      console.warn("[DMS] conversation.list 失败", e);
      return [];
    }
  }

  async function loadActiveUserPersona(roche) {
    try { return await roche.persona.getActiveUserPersona(); }
    catch (e) { console.warn("[DMS] persona.getActiveUserPersona 失败", e); return null; }
  }

  async function loadCharacter(roche, id) {
    try { return await roche.character.get(id); }
    catch (e) { console.warn("[DMS] character.get 失败", e); return null; }
  }

  async function loadShortTerm(roche, conversationId, limit) {
    try {
      const list = await roche.memory.getShortTerm({ conversationId, limit });
      return Array.isArray(list) ? list : (list?.messages || []);
    } catch (e) { console.warn("[DMS] getShortTerm 失败", e); return []; }
  }

  async function loadLongTerm(roche, conversationId) {
    try { return await roche.memory.getLongTerm({ conversationId, limit: 100 }); }
    catch (e) { console.warn("[DMS] getLongTerm 失败", e); return { core: null, facts: [], vectors: [] }; }
  }

  async function loadWorldbookTree(roche) {
    // 优先用 getCategoryTree，回退到 list + getEntries
    try {
      if (roche.worldbook.getCategoryTree) {
        return await roche.worldbook.getCategoryTree();
      }
    } catch (e) { console.warn("[DMS] getCategoryTree 失败", e); }
    try {
      const cats = await roche.worldbook.list();
      const tree = [];
      for (const c of cats) {
        const entries = await roche.worldbook.getEntries({ categoryId: c.id, scope: "global" });
        tree.push({ ...c, entries: entries || [] });
      }
      return tree;
    } catch (e) { console.warn("[DMS] worldbook.list 失败", e); return []; }
  }

  async function loadSelectedWorldbookText(roche, settings) {
    const catIds = settings.worldbookCategories || [];
    const entryIds = settings.worldbookEntries || [];
    if (!catIds.length && !entryIds.length) return "";
    const tree = await loadWorldbookTree(roche);
    const parts = [];
    const seen = new Set();
    for (const cat of tree) {
      if (catIds.includes(cat.id)) {
        for (const en of (cat.entries || [])) {
          const key = "c:" + cat.id + ":e:" + en.id;
          if (seen.has(key)) continue; seen.add(key);
          const t = en.content || en.text || en.description || "";
          if (t) parts.push(`【${cat.name || cat.title || "分类"}】${en.name || en.title || ""}\n${t}`);
        }
      }
    }
    for (const cat of tree) {
      for (const en of (cat.entries || [])) {
        if (entryIds.includes(en.id)) {
          const key = "e:" + en.id;
          if (seen.has(key)) continue; seen.add(key);
          const t = en.content || en.text || en.description || "";
          if (t) parts.push(`【${cat.name || cat.title || "分类"}】${en.name || en.title || ""}\n${t}`);
        }
      }
    }
    return parts.join("\n\n");
  }

  /* ---------- 按天分割 ---------- */
  function splitByDay(messages, dayDate) {
    const start = startOfDay(dayDate).getTime();
    const end = endOfDay(dayDate);
    return messages.filter(m => {
      const ts = toMs(m.timestamp);
      return ts >= start && ts < end;
    }).sort((a, b) => toMs(a.timestamp) - toMs(b.timestamp));
  }

  // 找出消息里覆盖到哪些天，返回 dateKey 数组（降序）
  function coveredDays(messages) {
    const set = new Set();
    for (const m of messages) set.add(toDateKey(toMs(m.timestamp)));
    return Array.from(set).sort().reverse();
  }

  /* ---------- 会话显示信息 ---------- */
  function convDisplay(conv) {
    const name = conv.handle || conv.name || conv.title || "未命名会话";
    const isGroup = conv.isGroup || conv.type === "group";
    const tag = isGroup ? "群聊" : "单聊";
    return { name, isGroup, tag, avatar: conv.avatar || "" };
  }

  function senderDisplay(m) {
    return m.senderHandle || m.senderName || m.senderId || "未知";
  }

  /* ---------- 消息文本拼装 ---------- */
  function messagesToText(messages) {
    return messages.map(m => {
      const t = fmtDateTime(toMs(m.timestamp));
      const who = senderDisplay(m);
      const txt = m.text || m.content || "";
      return `[${t}] ${who}: ${txt}`;
    }).join("\n");
  }

  function factsToText(facts) {
    return (facts || []).map(f => f.summaryText || f.action || f.text || "").filter(Boolean).join("\n");
  }

  function coreToText(core) {
    if (!core) return "";
    return core.summary || core.summaryText || core.text || "";
  }

  /* ---------- 上下文拼装 ---------- */
  async function buildContext(roche, state, dayDate) {
    const { settings, selectedConv } = state;
    const conv = selectedConv;
    const conversationId = conv.conversationId || conv.id;
    const isGroup = conv.isGroup || conv.type === "group";

    // user 人设
    const activeUser = await loadActiveUserPersona(roche);
    const userPersona = activeUser?.persona || activeUser?.bio || "";
    const userName = activeUser?.handle || activeUser?.name || "用户";

    // char 人设
    let charText = "";
    let charName = convDisplay(conv).name;
    if (!isGroup && conv.contactId) {
      const ch = await loadCharacter(roche, conv.contactId);
      if (ch) {
        charText = ch.persona || ch.bio || "";
        charName = ch.handle || ch.name || charName;
      }
    } else if (isGroup && conv.memberProfiles) {
      charText = conv.memberProfiles.map(p => {
        return `成员【${p.handle || p.name}】: ${p.bio || p.description || ""}`;
      }).join("\n");
    }

    // 短期记忆按天
    const allShort = await loadShortTerm(roche, conversationId, settings.messageLimit || 5000);
    const dayShort = splitByDay(allShort, dayDate);
    const shortText = messagesToText(dayShort);

    // 可选：核心 / 事实
    let coreText = "", factsText = "";
    if (settings.showCore || settings.showFacts) {
      const lt = await loadLongTerm(roche, conversationId);
      if (settings.showCore) coreText = coreToText(lt.core);
      if (settings.showFacts) factsText = factsToText(lt.facts);
    }

    // 可选：世界书
    let wbText = "";
    if (settings.useWorldbook) wbText = await loadSelectedWorldbookText(roche, settings);

    return {
      conversationId, isGroup,
      userName, userPersona,
      charName, charText,
      dayShort, shortText,
      coreText, factsText,
      wbText,
      dateKey: toDateKey(dayDate)
    };
  }

  /* ---------- AI 总结 ---------- */
  function buildAiMessages(ctx, settings) {
    const systemParts = [];
    systemParts.push("你是一名严谨的记忆整理助手。你的任务是根据提供的当日聊天记录与可选背景资料，生成一份当日记忆总结。");

    if (ctx.userPersona) {
      systemParts.push(`【用户人设】${ctx.userName}\n${ctx.userPersona}`);
    }
    if (ctx.charText) {
      systemParts.push(`【角色/会话人设】${ctx.charName}\n${ctx.charText}`);
    }
    if (ctx.wbText) {
      systemParts.push(`【世界书（用户勾选）】\n${ctx.wbText}`);
    }
    if (ctx.coreText) {
      systemParts.push(`【已有核心记忆（参考，不要直接照抄）】\n${ctx.coreText}`);
    }
    if (ctx.factsText) {
      systemParts.push(`【已有事实记忆（参考，不要直接照抄）】\n${ctx.factsText}`);
    }

    systemParts.push(`【待总结日期】${ctx.dateKey}`);
    systemParts.push(`【当日聊天记录】\n${ctx.shortText || "（当日无聊天记录）"}`);

    // 约束
    systemParts.push(
      "约束：\n" +
      "- 只基于上述记录进行总结，不要捏造用户未输入的言行。\n" +
      "- 不要抢话用户，不要揣测用户没有输入的语言或行动。\n" +
      "- 输出语言与聊天记录主要语言保持一致。"
    );

    // 思维链（用户自定义）
    if (settings.thinkingChain?.trim()) {
      systemParts.push("【思维链】请先在内部按以下步骤推理，再输出最终总结：\n" + settings.thinkingChain);
    }

    // 格式（用户自定义）
    const formatGuide = settings.summaryFormat?.trim()
      ? "【输出格式】严格按以下模板输出，未被占位符包含的提示文字保留原样，不要额外加前后说明：\n" + settings.summaryFormat
      : "【输出格式】自由输出结构化总结。";

    const userMsg = formatGuide + "\n\n占位符变量可用：{date} {conversation} {relation} {events} {pending} {inner}。未被引用的占位符自动忽略。";

    return [
      { role: "system", content: systemParts.join("\n\n") },
      { role: "user", content: userMsg }
    ];
  }

  async function generateSummary(roche, ctx, settings) {
    const messages = buildAiMessages(ctx, settings);
    const result = await roche.ai.chat({
      messages,
      temperature: 0.6
    });
    let text = result?.text || result?.content || "";
    if (Array.isArray(text)) text = text.map(c => c?.text || "").join("");
    if (!text && typeof result === "string") text = result;
    return text;
  }

  /* ---------- 同步到事实记忆 ---------- */
  async function syncToFactMemory(roche, ctx, summaryText, settings) {
    if (!summaryText?.trim()) return false;
    await roche.memory.write({
      conversationId: ctx.conversationId,
      summaryText: summaryText.slice(0, 2000),
      who: [ctx.userName, ctx.charName],
      action: `每日总结 · ${ctx.dateKey}`,
      when: ctx.dateKey,
      where: ctx.isGroup ? "群聊" : "单聊",
      source: "plugin:daily-memory-summary"
    });
    return true;
  }

  /* ---------- 设置读写 ---------- */
  async function getSettings(roche) {
    try {
      const s = await roche.storage.get(STORAGE_SETTINGS);
      return { ...DEFAULT_SETTINGS, ...(s || {}) };
    } catch { return { ...DEFAULT_SETTINGS }; }
  }
  async function saveSettings(roche, s) {
    await roche.storage.set(STORAGE_SETTINGS, s);
  }

  async function getSummaries(roche) {
    try { return (await roche.storage.get(STORAGE_SUMMARIES)) || {}; }
    catch { return {}; }
  }
  async function saveSummary(roche, key, data) {
    const all = await getSummaries(roche);
    all[key] = data;
    await roche.storage.set(STORAGE_SUMMARIES, all);
  }

  /* ============================================================
   *  UI
   * ============================================================ */
  function mountStyles(root) {
    const style = document.createElement("style");
    style.id = ROOT_CLASS + "-style";
    style.textContent = `
    .${ROOT_CLASS}{
      --dms-bg1:#0f0b2a; --dms-bg2:#1a1147; --dms-bg3:#2a1b5e;
      --dms-glass: rgba(255,255,255,0.06);
      --dms-glass-strong: rgba(255,255,255,0.12);
      --dms-border: rgba(255,255,255,0.14);
      --dms-text:#EDE9FF; --dms-text-dim:#B8B0E0; --dms-text-mute:#7C75A8;
      --dms-accent:#9D7BFF; --dms-accent2:#5BD0FF; --dms-accent3:#FF8AD8;
      --dms-warn:#FFC36A; --dms-ok:#7CE0B0;
      --dms-radius:16px; --dms-radius-sm:10px;
      position:relative; min-height:100%; color:var(--dms-text);
      font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;
      background:
        radial-gradient(1200px 700px at 15% -10%, rgba(157,123,255,0.30), transparent 60%),
        radial-gradient(900px 600px at 95% 10%, rgba(91,208,255,0.22), transparent 60%),
        radial-gradient(800px 700px at 50% 110%, rgba(255,138,216,0.18), transparent 60%),
        linear-gradient(180deg, #0b0822 0%, #140c38 60%, #0a0720 100%);
      padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left);
      backdrop-filter: blur(6px);
    }
    .${ROOT_CLASS} *{box-sizing:border-box;}
    .${ROOT_CLASS} .dms-star{
      position:absolute; border-radius:50%; background:#fff; opacity:0.5;
      pointer-events:none; filter:blur(0.4px);
    }
    .${ROOT_CLASS} .dms-top{
      position:sticky; top:0; z-index:20;
      display:flex; align-items:center; gap:12px;
      padding:14px 18px;
      background:linear-gradient(180deg, rgba(15,11,42,0.85), rgba(15,11,42,0.25));
      backdrop-filter: blur(18px) saturate(1.4);
      border-bottom:1px solid var(--dms-border);
    }
    .${ROOT_CLASS} .dms-top h1{
      margin:0; font-size:18px; font-weight:600; letter-spacing:1px;
      background:linear-gradient(90deg,var(--dms-accent),var(--dms-accent2));
      -webkit-background-clip:text; background-clip:text; color:transparent;
    }
    .${ROOT_CLASS} .dms-top .dms-sub{font-size:12px;color:var(--dms-text-dim);margin-left:4px;}
    .${ROOT_CLASS} .dms-btn{
      appearance:none; border:1px solid var(--dms-border); cursor:pointer;
      background:var(--dms-glass); color:var(--dms-text);
      padding:9px 14px; border-radius:var(--dms-radius-sm); font-size:13px;
      backdrop-filter:blur(8px); transition:all .2s ease;
      display:inline-flex; align-items:center; gap:6px;
    }
    .${ROOT_CLASS} .dms-btn:hover{background:var(--dms-glass-strong); border-color:rgba(255,255,255,0.28);}
    .${ROOT_CLASS} .dms-btn:disabled{opacity:.5; cursor:not-allowed;}
    .${ROOT_CLASS} .dms-btn-primary{
      background:linear-gradient(135deg, rgba(157,123,255,0.85), rgba(91,208,255,0.65));
      border-color:transparent; color:#0b0822; font-weight:600;
    }
    .${ROOT_CLASS} .dms-btn-primary:hover{filter:brightness(1.1);}
    .${ROOT_CLASS} .dms-btn-ghost{background:transparent;}
    .${ROOT_CLASS} .dms-btn-icon{
      width:34px; height:34px; padding:0; justify-content:center; border-radius:50%;
    }
    .${ROOT_CLASS} .dms-wrap{padding:18px; max-width:860px; margin:0 auto; padding-bottom:120px;}
    .${ROOT_CLASS} .dms-card{
      background:var(--dms-glass); border:1px solid var(--dms-border);
      border-radius:var(--dms-radius); padding:18px; margin-bottom:16px;
      backdrop-filter:blur(16px) saturate(1.3);
      box-shadow:0 8px 32px rgba(0,0,0,0.25);
    }
    .${ROOT_CLASS} .dms-card h2{
      margin:0 0 4px 0; font-size:15px; font-weight:600; color:var(--dms-text);
      display:flex; align-items:center; gap:8px;
    }
    .${ROOT_CLASS} .dms-card .dms-card-sub{font-size:12px;color:var(--dms-text-mute);margin-bottom:14px;}
    .${ROOT_CLASS} .dms-step-badge{
      display:inline-flex; align-items:center; justify-content:center;
      width:22px; height:22px; border-radius:50%;
      background:linear-gradient(135deg,var(--dms-accent),var(--dms-accent2));
      color:#0b0822; font-size:12px; font-weight:700;
    }
    .${ROOT_CLASS} .dms-grid{display:grid; gap:10px;}
    .${ROOT_CLASS} .dms-conv-list{display:flex; flex-direction:column; gap:8px; max-height:340px; overflow:auto; padding-right:4px;}
    .${ROOT_CLASS} .dms-conv-item{
      display:flex; align-items:center; gap:12px; padding:10px 12px;
      background:var(--dms-glass); border:1px solid var(--dms-border);
      border-radius:var(--dms-radius-sm); cursor:pointer; transition:all .15s ease;
    }
    .${ROOT_CLASS} .dms-conv-item:hover{background:var(--dms-glass-strong);}
    .${ROOT_CLASS} .dms-conv-item.active{
      border-color:var(--dms-accent);
      background:linear-gradient(135deg, rgba(157,123,255,0.22), rgba(91,208,255,0.10));
    }
    .${ROOT_CLASS} .dms-conv-avatar{
      width:38px; height:38px; border-radius:50%; flex:0 0 38px;
      background:linear-gradient(135deg,var(--dms-accent),var(--dms-accent2));
      display:flex; align-items:center; justify-content:center; color:#0b0822; font-weight:600;
      overflow:hidden;
    }
    .${ROOT_CLASS} .dms-conv-avatar img{width:100%;height:100%;object-fit:cover;}
    .${ROOT_CLASS} .dms-conv-info{flex:1; min-width:0;}
    .${ROOT_CLASS} .dms-conv-name{font-size:14px; font-weight:500; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;}
    .${ROOT_CLASS} .dms-conv-meta{font-size:11px; color:var(--dms-text-mute); margin-top:2px;}
    .${ROOT_CLASS} .dms-tag{
      font-size:10px; padding:2px 8px; border-radius:10px;
      background:rgba(157,123,255,0.22); color:var(--dms-accent);
      border:1px solid rgba(157,123,255,0.4);
    }
    .${ROOT_CLASS} .dms-tag.group{background:rgba(91,208,255,0.18); color:var(--dms-accent2); border-color:rgba(91,208,255,0.4);}
    .${ROOT_CLASS} .dms-checkbox{
      width:18px; height:18px; border-radius:5px; border:1.5px solid var(--dms-text-mute);
      display:flex; align-items:center; justify-content:center; flex:0 0 18px;
      transition:all .15s ease;
    }
    .${ROOT_CLASS} .dms-conv-item.active .dms-checkbox{
      background:linear-gradient(135deg,var(--dms-accent),var(--dms-accent2));
      border-color:transparent;
    }
    .${ROOT_CLASS} .dms-conv-item.active .dms-checkbox::after{
      content:""; width:5px; height:9px; border:solid #0b0822; border-width:0 2px 2px 0;
      transform:rotate(45deg) translate(-1px,-1px);
    }
    .${ROOT_CLASS} .dms-row{display:flex; align-items:center; gap:12px; margin-bottom:12px;}
    .${ROOT_CLASS} .dms-row:last-child{margin-bottom:0;}
    .${ROOT_CLASS} .dms-label{font-size:13px; color:var(--dms-text-dim); flex:1;}
    .${ROOT_CLASS} .dms-label-hint{font-size:11px; color:var(--dms-text-mute); margin-top:2px;}
    .${ROOT_CLASS} .dms-switch{
      position:relative; width:42px; height:24px; border-radius:12px;
      background:rgba(255,255,255,0.12); border:1px solid var(--dms-border);
      cursor:pointer; flex:0 0 42px; transition:all .2s ease;
    }
    .${ROOT_CLASS} .dms-switch::after{
      content:""; position:absolute; top:2px; left:2px; width:18px; height:18px; border-radius:50%;
      background:#fff; transition:all .2s ease;
    }
    .${ROOT_CLASS} .dms-switch.on{
      background:linear-gradient(135deg,var(--dms-accent),var(--dms-accent2)); border-color:transparent;
    }
    .${ROOT_CLASS} .dms-switch.on::after{left:21px;}
    .${ROOT_CLASS} .dms-input, .${ROOT_CLASS} .dms-textarea, .${ROOT_CLASS} .dms-select{
      width:100%; padding:10px 12px; border-radius:var(--dms-radius-sm);
      background:rgba(0,0,0,0.25); border:1px solid var(--dms-border);
      color:var(--dms-text); font-size:13px; font-family:inherit;
      outline:none; transition:border-color .15s ease;
    }
    .${ROOT_CLASS} .dms-input:focus, .${ROOT_CLASS} .dms-textarea:focus, .${ROOT_CLASS} .dms-select:focus{
      border-color:var(--dms-accent);
    }
    .${ROOT_CLASS} .dms-textarea{resize:vertical; min-height:90px; line-height:1.55; white-space:pre-wrap;}
    .${ROOT_CLASS} .dms-textarea.tall{min-height:160px;}
    .${ROOT_CLASS} .dms-date-row{display:flex; gap:10px; align-items:center; flex-wrap:wrap;}
    .${ROOT_CLASS} .dms-date-row .dms-input{max-width:180px;}
    .${ROOT_CLASS} .dms-wb-tree{max-height:280px; overflow:auto; padding-right:4px;}
    .${ROOT_CLASS} .dms-wb-cat{
      padding:8px 10px; background:var(--dms-glass); border:1px solid var(--dms-border);
      border-radius:var(--dms-radius-sm); margin-bottom:6px; cursor:pointer;
    }
    .${ROOT_CLASS} .dms-wb-cat.active{border-color:var(--dms-accent); background:rgba(157,123,255,0.18);}
    .${ROOT_CLASS} .dms-wb-cat-head{display:flex; align-items:center; gap:8px;}
    .${ROOT_CLASS} .dms-wb-cat-name{font-size:13px; font-weight:500;}
    .${ROOT_CLASS} .dms-wb-entries{margin-top:6px; padding-left:24px; display:flex; flex-direction:column; gap:4px;}
    .${ROOT_CLASS} .dms-wb-entry{
      font-size:12px; padding:5px 8px; border-radius:6px; cursor:pointer;
      background:rgba(0,0,0,0.2); border:1px solid transparent;
    }
    .${ROOT_CLASS} .dms-wb-entry.active{border-color:var(--dms-accent2); background:rgba(91,208,255,0.12);}
    .${ROOT_CLASS} .dms-empty{
      text-align:center; padding:28px 12px; color:var(--dms-text-mute); font-size:13px;
    }
    .${ROOT_CLASS} .dms-gen-box{display:flex; gap:10px; flex-wrap:wrap; align-items:center; margin-top:6px;}
    .${ROOT_CLASS} .dms-result{
      background:rgba(0,0,0,0.3); border:1px solid var(--dms-border);
      border-radius:var(--dms-radius-sm); padding:16px;
      white-space:pre-wrap; word-break:break-word; font-size:13px; line-height:1.7;
      max-height:520px; overflow:auto;
    }
    .${ROOT_CLASS} .dms-result-meta{font-size:11px; color:var(--dms-text-mute); margin-bottom:10px; display:flex; gap:10px; flex-wrap:wrap;}
    .${ROOT_CLASS} .dms-pill{
      font-size:10px; padding:2px 8px; border-radius:10px;
      background:rgba(255,255,255,0.08); border:1px solid var(--dms-border); color:var(--dms-text-dim);
    }
    .${ROOT_CLASS} .dms-pill.ok{background:rgba(124,224,176,0.14); color:var(--dms-ok); border-color:rgba(124,224,176,0.4);}
    .${ROOT_CLASS} .dms-pill.warn{background:rgba(255,195,106,0.14); color:var(--dms-warn); border-color:rgba(255,195,106,0.4);}
    .${ROOT_CLASS} .dms-toast{
      position:fixed; left:50%; bottom:calc(40px + env(safe-area-inset-bottom));
      transform:translateX(-50%); z-index:999;
      background:rgba(15,11,42,0.92); border:1px solid var(--dms-border);
      color:var(--dms-text); padding:10px 18px; border-radius:24px;
      backdrop-filter:blur(18px); font-size:13px;
      box-shadow:0 8px 32px rgba(0,0,0,0.4);
      opacity:0; pointer-events:none; transition:opacity .2s ease, transform .2s ease;
    }
    .${ROOT_CLASS} .dms-toast.show{opacity:1; transform:translateX(-50%) translateY(-4px);}
    .${ROOT_CLASS} .dms-loading{
      display:inline-block; width:14px; height:14px; border-radius:50%;
      border:2px solid rgba(255,255,255,0.25); border-top-color:#fff;
      animation:dms-spin 0.8s linear infinite;
    }
    @keyframes dms-spin{to{transform:rotate(360deg);}}
    .${ROOT_CLASS} .dms-history-item{
      padding:10px 12px; background:var(--dms-glass); border:1px solid var(--dms-border);
      border-radius:var(--dms-radius-sm); margin-bottom:8px; cursor:pointer;
    }
    .${ROOT_CLASS} .dms-history-item:hover{background:var(--dms-glass-strong);}
    .${ROOT_CLASS} .dms-history-head{display:flex; justify-content:space-between; gap:8px; margin-bottom:4px;}
    .${ROOT_CLASS} .dms-history-title{font-size:13px; font-weight:500;}
    .${ROOT_CLASS} .dms-history-date{font-size:11px; color:var(--dms-text-mute);}
    .${ROOT_CLASS} .dms-history-snippet{font-size:12px; color:var(--dms-text-dim); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;}
    .${ROOT_CLASS} .dms-tabs{display:flex; gap:6px; margin-bottom:14px; flex-wrap:wrap;}
    .${ROOT_CLASS} .dms-tab{
      padding:7px 14px; font-size:12px; border-radius:20px; cursor:pointer;
      background:var(--dms-glass); border:1px solid var(--dms-border); color:var(--dms-text-dim);
    }
    .${ROOT_CLASS} .dms-tab.active{
      background:linear-gradient(135deg, rgba(157,123,255,0.35), rgba(91,208,255,0.2));
      border-color:transparent; color:var(--dms-text);
    }
    .${ROOT_CLASS} .dms-warn-box{
      font-size:11px; padding:8px 12px; border-radius:8px; margin-top:10px;
      background:rgba(255,195,106,0.10); border:1px solid rgba(255,195,106,0.3); color:var(--dms-warn);
    }
    .${ROOT_CLASS} .dms-footer{
      position:fixed; left:0; right:0; bottom:0; z-index:30;
      padding:12px 18px calc(12px + env(safe-area-inset-bottom));
      background:linear-gradient(0deg, rgba(10,7,32,0.95), rgba(10,7,32,0.6));
      backdrop-filter:blur(20px); border-top:1px solid var(--dms-border);
      display:flex; gap:10px; justify-content:space-between; align-items:center;
    }
    .${ROOT_CLASS} .dms-footer .dms-foot-left{font-size:11px; color:var(--dms-text-mute);}
    `;
    root.appendChild(style);
    return style;
  }

  // 撒星点
  function scatterStars(root) {
    const wrap = el("div", { class: "dms-stars", style: { position: "absolute", inset: "0", pointerEvents: "none", overflow: "hidden", zIndex: "0" } });
    for (let i = 0; i < 26; i++) {
      const s = el("div", { class: "dms-star" });
      const size = Math.random() * 2 + 1;
      s.style.width = size + "px"; s.style.height = size + "px";
      s.style.left = Math.random() * 100 + "%";
      s.style.top = Math.random() * 100 + "%";
      s.style.opacity = (Math.random() * 0.5 + 0.2).toFixed(2);
      wrap.appendChild(s);
    }
    root.appendChild(wrap);
  }

  /* ---------- 主渲染 ---------- */
  function renderApp(roche, root, settings) {
    const state = {
      settings,
      conversations: [],
      selectedConvId: "",
      selectedConv: null,
      selectedDate: new Date(),
      coveredDays: [],
      worldbookTree: [],
      generating: false,
      lastResult: "",
      lastCtx: null,
      activeTab: "main" // main | history
    };

    function toast(msg) {
      let t = $(".dms-toast", root);
      if (!t) { t = el("div", { class: "dms-toast" }); root.appendChild(t); }
      t.textContent = msg;
      t.classList.add("show");
      clearTimeout(t._timer);
      t._timer = setTimeout(() => t.classList.remove("show"), 1800);
    }

    function switchTab(tab) {
      state.activeTab = tab;
      renderBody();
    }

    function renderTop() {
      return el("div", { class: "dms-top" },
        el("button", {
          class: "dms-btn dms-btn-icon dms-btn-ghost",
          "aria-label": "返回",
          onclick: () => roche.ui.closeApp()
        }, "←"),
        el("div", { style: { flex: "1" } },
          el("h1", {}, "每日记忆总结"),
          el("div", { class: "dms-sub" }, "按天分割短期记忆 · 自定义思维链与格式")
        ),
        el("button", {
          class: "dms-btn dms-btn-icon dms-btn-ghost",
          "aria-label": "刷新",
          onclick: async () => { toast("刷新中…"); await loadAll(); renderBody(); }
        }, "↻")
      );
    }

    function renderFooter() {
      const left = el("div", { class: "dms-foot-left" }, state.selectedConv
        ? `已选: ${convDisplay(state.selectedConv).name} · ${toDateKey(state.selectedDate)}`
        : "未选择会话");
      const right = el("div", { style: { display: "flex", gap: "8px" } },
        el("button", {
          class: "dms-btn",
          onclick: () => switchTab(state.activeTab === "main" ? "history" : "main")
        }, state.activeTab === "main" ? "历史总结" : "返回生成"),
        el("button", {
          class: "dms-btn dms-btn-primary",
          disabled: state.generating || !state.selectedConv,
          onclick: onGenerate
        }, state.generating ? el("span", {}, el("span", { class: "dms-loading" }), " 生成中…") : "生成总结")
      );
      return el("div", { class: "dms-footer" }, left, right);
    }

    function renderBody() {
      const body = $(".dms-body", root);
      if (!body) return;
      body.replaceChildren();
      if (state.activeTab === "history") {
        body.appendChild(renderHistory());
      } else {
        body.appendChild(renderMain());
      }
      const foot = $(".dms-footer", root);
      if (foot) foot.replaceWith(renderFooter());
      else root.appendChild(renderFooter());
    }

    /* ----- 主页 ----- */
    function renderMain() {
      const wrap = el("div", { class: "dms-wrap" });

      // 步骤1：会话
      const convCard = el("div", { class: "dms-card" },
        el("h2", {}, el("span", { class: "dms-step-badge" }, "1"), "选择会话"),
        el("div", { class: "dms-card-sub" }, "支持单聊与群聊，可读取对应短期记忆。")
      );
      const convList = el("div", { class: "dms-conv-list" });
      if (!state.conversations.length) {
        convList.appendChild(el("div", { class: "dms-empty" }, "暂无会话，点右上角刷新重试。"));
      } else {
        for (const c of state.conversations) {
          const info = convDisplay(c);
          const active = state.selectedConvId === (c.conversationId || c.id);
          const avatar = info.avatar
            ? el("div", { class: "dms-conv-avatar" }, el("img", { src: info.avatar, alt: "" }))
            : el("div", { class: "dms-conv-avatar" }, (info.name || "?").slice(0, 1));
          convList.appendChild(el("div", {
            class: "dms-conv-item" + (active ? " active" : ""),
            onclick: () => { state.selectedConvId = c.conversationId || c.id; state.selectedConv = c; renderBody(); }
          },
            el("div", { class: "dms-checkbox" }),
            avatar,
            el("div", { class: "dms-conv-info" },
              el("div", { class: "dms-conv-name" }, info.name),
              el("div", { class: "dms-conv-meta" },
                c.handle && !info.isGroup ? `@${c.handle}` : (c.memberProfiles ? `${c.memberProfiles.length} 位成员` : "会话"),
                " · ", (c.conversationId || c.id || "").slice(0, 8)
              )
            ),
            el("span", { class: "dms-tag" + (info.isGroup ? " group" : "") }, info.tag)
          ));
        }
      }
      convCard.appendChild(convList);
      wrap.appendChild(convCard);

      // 步骤2：日期
      const dateCard = el("div", { class: "dms-card" },
        el("h2", {}, el("span", { class: "dms-step-badge" }, "2"), "选择日期"),
        el("div", { class: "dms-card-sub" }, "按本地时区 00:00 ~ 次日 00:00 切割当天短期记忆。")
      );
      const dateInput = el("input", {
        type: "date", class: "dms-input",
        value: toDateInputValue(state.selectedDate),
        max: toDateInputValue(new Date()),
        onchange: (e) => {
          if (e.target.value) state.selectedDate = parseDateInputValue(e.target.value);
        }
      });
      const dateRow = el("div", { class: "dms-date-row" }, dateInput);
      // 快捷：覆盖到的日期
      if (state.coveredDays.length) {
        const quick = el("div", { style: { marginTop: "10px", display: "flex", gap: "6px", flexWrap: "wrap" } },
          el("span", { style: { fontSize: "11px", color: "var(--dms-text-mute)", alignSelf: "center" } }, "该会话有记录的日期:")
        );
        for (const dk of state.coveredDays.slice(0, 10)) {
          quick.appendChild(el("span", {
            class: "dms-pill",
            style: { cursor: "pointer" },
            onclick: () => {
              state.selectedDate = parseDateInputValue(dk);
              dateInput.value = dk;
              renderBody();
            }
          }, dk));
        }
        dateRow.appendChild(quick);
      }
      dateCard.appendChild(dateRow);
      wrap.appendChild(dateCard);

      // 步骤3：内容选项
      const optCard = el("div", { class: "dms-card" },
        el("h2", {}, el("span", { class: "dms-step-badge" }, "3"), "内容选项"),
        el("div", { class: "dms-card-sub" }, "选择要一并注入给 AI 的背景资料。")
      );
      optCard.appendChild(makeSwitch("显示已有核心记忆", "把核心记忆作为参考注入（参考，不照抄）。", state.settings.showCore, async (v) => {
        state.settings.showCore = v; await saveSettings(roche, state.settings);
      }));
      optCard.appendChild(makeSwitch("显示已有事实记忆", "把事实记忆作为参考注入（参考，不照抄）。", state.settings.showFacts, async (v) => {
        state.settings.showFacts = v; await saveSettings(roche, state.settings);
      }));
      optCard.appendChild(makeSwitch("启用世界书", "勾选后可在下方挑选分类/词条。", state.settings.useWorldbook, async (v) => {
        state.settings.useWorldbook = v; await saveSettings(roche, state.settings);
        if (v && !state.worldbookTree.length) { state.worldbookTree = await loadWorldbookTree(roche); }
        renderBody();
      }));
      if (state.settings.useWorldbook) {
        optCard.appendChild(renderWorldbookPicker());
      }
      wrap.appendChild(optCard);

      // 步骤4：思维链与格式
      const tplCard = el("div", { class: "dms-card" },
        el("h2", {}, el("span", { class: "dms-step-badge" }, "4"), "思维链与格式"),
        el("div", { class: "dms-card-sub" }, "自定义推理步骤与输出模板，支持占位符 {date} {conversation} {relation} {events} {pending} {inner}。")
      );
      const tc = el("textarea", { class: "dms-textarea", placeholder: "请输入思维链步骤…" });
      tc.value = state.settings.thinkingChain || "";
      tc.addEventListener("change", async () => {
        state.settings.thinkingChain = tc.value; await saveSettings(roche, state.settings); toast("思维链已保存");
      });
      tplCard.appendChild(el("div", { style: { marginBottom: "6px", fontSize: "12px", color: "var(--dms-text-dim)" } }, "思维链"));
      tplCard.appendChild(tc);

      const fmt = el("textarea", { class: "dms-textarea tall", placeholder: "请输入输出格式模板…" });
      fmt.value = state.settings.summaryFormat || "";
      fmt.addEventListener("change", async () => {
        state.settings.summaryFormat = fmt.value; await saveSettings(roche, state.settings); toast("格式模板已保存");
      });
      tplCard.appendChild(el("div", { style: { marginTop: "12px", marginBottom: "6px", fontSize: "12px", color: "var(--dms-text-dim)" } }, "输出格式"));
      tplCard.appendChild(fmt);

      // 同步选项
      tplCard.appendChild(el("div", { style: { marginTop: "14px" } },
        makeSwitch("生成后自动同步到该会话事实记忆", "注意：写入的是 Roche 主事实记忆，卸载插件不会自动删除。", state.settings.autoSyncAfterGenerate, async (v) => {
          state.settings.autoSyncAfterGenerate = v; await saveSettings(roche, state.settings);
        })
      ));
      if (state.settings.autoSyncAfterGenerate) {
        tplCard.appendChild(el("div", { class: "dms-warn-box" },
          "已开启自动同步：每次生成成功后会写入一条主事实记忆。主记忆不会随插件卸载而删除，请谨慎使用。"
        ));
      }
      wrap.appendChild(tplCard);

      // 步骤5：结果
      const resultCard = el("div", { class: "dms-card" },
        el("h2", {}, el("span", { class: "dms-step-badge" }, "5"), "总结结果")
      );
      if (state.lastResult) {
        const ctx = state.lastCtx;
        resultCard.appendChild(el("div", { class: "dms-result-meta" },
          el("span", { class: "dms-pill" }, ctx ? ctx.dateKey : ""),
          ctx ? el("span", { class: "dms-pill" }, ctx.isGroup ? "群聊" : "单聊") : null,
          ctx ? el("span", { class: "dms-pill" }, `消息 ${ctx.dayShort?.length || 0} 条`) : null
        ));
        resultCard.appendChild(el("div", { class: "dms-result" }, state.lastResult));
        const btnBox = el("div", { class: "dms-gen-box", style: { marginTop: "12px" } });
        btnBox.appendChild(el("button", {
          class: "dms-btn",
          onclick: async () => {
            try {
              await navigator.clipboard.writeText(state.lastResult);
              toast("已复制到剪贴板");
            } catch { toast("复制失败"); }
          }
        }, "复制"));
        btnBox.appendChild(el("button", {
          class: "dms-btn",
          onclick: async () => {
            if (!ctx) return;
            const ok = await roche.ui.confirm({
              title: "同步到事实记忆",
              message: "将把本次总结写入该会话的主事实记忆。主记忆不会随插件卸载而删除，是否继续？"
            });
            if (!ok) return;
            try {
              await syncToFactMemory(roche, ctx, state.lastResult, state.settings);
              toast("已写入事实记忆");
            } catch (e) { console.error(e); toast("写入失败: " + (e?.message || e)); }
          }
        }, "手动同步到事实记忆"));
        btnBox.appendChild(el("button", {
          class: "dms-btn",
          onclick: async () => {
            if (!ctx) return;
            await saveSummary(roche, `${ctx.conversationId}:${ctx.dateKey}:${Date.now()}`, {
              text: state.lastResult,
              conversationId: ctx.conversationId,
              conversationName: ctx.charName,
              date: ctx.dateKey,
              createdAt: Date.now()
            });
            toast("已保存到历史总结");
          }
        }, "保存到历史"));
        resultCard.appendChild(btnBox);
      } else {
        resultCard.appendChild(el("div", { class: "dms-empty" }, "尚未生成总结。选好会话与日期，点底部「生成总结」即可。"));
      }
      wrap.appendChild(resultCard);

      return wrap;
    }

    function makeSwitch(label, hint, value, onChange) {
      const sw = el("div", { class: "dms-switch" + (value ? " on" : ""), onclick: async () => {
        const v = !sw.classList.contains("on");
        sw.classList.toggle("on", v);
        await onChange(v);
      } });
      return el("div", { class: "dms-row" },
        el("div", { style: { flex: "1" } },
          el("div", { class: "dms-label" }, label),
          hint ? el("div", { class: "dms-label-hint" }, hint) : null
        ),
        sw
      );
    }

    function renderWorldbookPicker() {
      const box = el("div", { style: { marginTop: "12px" } },
        el("div", { style: { fontSize: "12px", color: "var(--dms-text-dim)", marginBottom: "6px" } }, "世界书分类 / 词条")
      );
      const treeBox = el("div", { class: "dms-wb-tree" });
      if (!state.worldbookTree.length) {
        treeBox.appendChild(el("div", { class: "dms-empty" }, "暂无世界书数据。"));
      } else {
        for (const cat of state.worldbookTree) {
          const catActive = state.settings.worldbookCategories.includes(cat.id);
          const catItem = el("div", { class: "dms-wb-cat" + (catActive ? " active" : "") });
          const head = el("div", { class: "dms-wb-cat-head" },
            el("div", { class: "dms-checkbox", style: catActive ? {} : { background: "transparent" } }),
            el("div", { class: "dms-wb-cat-name" }, cat.name || cat.title || "未命名分类"),
            el("span", { class: "dms-pill", style: { marginLeft: "auto" } }, `${(cat.entries || []).length}`)
          );
          catItem.appendChild(head);
          const entriesBox = el("div", { class: "dms-wb-entries", style: { display: "none" } });
          for (const en of (cat.entries || [])) {
            const enActive = state.settings.worldbookEntries.includes(en.id);
            const enItem = el("div", { class: "dms-wb-entry" + (enActive ? " active" : "") },
              en.name || en.title || en.id
            );
            enItem.addEventListener("click", async (ev) => {
              ev.stopPropagation();
              const arr = state.settings.worldbookEntries;
              const i = arr.indexOf(en.id);
              if (i >= 0) arr.splice(i, 1); else arr.push(en.id);
              await saveSettings(roche, state.settings);
              enItem.classList.toggle("active");
            });
            entriesBox.appendChild(enItem);
          }
          head.addEventListener("click", async () => {
            const arr = state.settings.worldbookCategories;
            const i = arr.indexOf(cat.id);
            if (i >= 0) arr.splice(i, 1); else arr.push(cat.id);
            await saveSettings(roche, state.settings);
            catItem.classList.toggle("active");
            // 展开词条
            entriesBox.style.display = entriesBox.style.display === "none" ? "flex" : "none";
          });
          catItem.appendChild(entriesBox);
          treeBox.appendChild(catItem);
        }
      }
      box.appendChild(treeBox);
      return box;
    }

    /* ----- 历史 ----- */
    async function renderHistory() {
      const wrap = el("div", { class: "dms-wrap" });
      const card = el("div", { class: "dms-card" },
        el("h2", {}, "历史总结"),
        el("div", { class: "dms-card-sub" }, "保存在本插件私有存储，卸载插件会一并清除。")
      );
      const all = await getSummaries(roche);
      const keys = Object.keys(all).sort((a, b) => (all[b].createdAt || 0) - (all[a].createdAt || 0));
      if (!keys.length) {
        card.appendChild(el("div", { class: "dms-empty" }, "暂无历史总结。"));
      } else {
        for (const k of keys) {
          const it = all[k];
          const item = el("div", { class: "dms-history-item" });
          item.appendChild(el("div", { class: "dms-history-head" },
            el("div", { class: "dms-history-title" }, `${it.conversationName || "会话"} · ${it.date || ""}`),
            el("div", { class: "dms-history-date" }, new Date(it.createdAt || 0).toLocaleString())
          ));
          item.appendChild(el("div", { class: "dms-history-snippet" }, (it.text || "").slice(0, 80)));
          item.appendChild(el("div", { style: { marginTop: "8px", display: "flex", gap: "6px" } },
            el("button", {
              class: "dms-btn",
              onclick: async (ev) => {
                ev.stopPropagation();
                state.lastResult = it.text || "";
                state.lastCtx = {
                  conversationId: it.conversationId,
                  conversationId2: it.conversationId,
                  charName: it.conversationName,
                  isGroup: false,
                  dateKey: it.date,
                  dayShort: []
                };
                state.activeTab = "main";
                renderBody();
              }
            }, "载入"),
            el("button", {
              class: "dms-btn",
              onclick: async (ev) => {
                ev.stopPropagation();
                const ok = await roche.ui.confirm({ title: "删除", message: "删除这条历史总结？" });
                if (!ok) return;
                delete all[k];
                await roche.storage.set(STORAGE_SUMMARIES, all);
                toast("已删除");
                renderBody();
              }
            }, "删除")
          ));
          card.appendChild(item);
        }
        card.appendChild(el("div", { style: { marginTop: "10px" } },
          el("button", {
            class: "dms-btn",
            onclick: async () => {
              const ok = await roche.ui.confirm({ title: "清空", message: "清空全部历史总结？此操作不可恢复。" });
              if (!ok) return;
              await roche.storage.set(STORAGE_SUMMARIES, {});
              toast("已清空"); renderBody();
            }
          }, "清空全部历史")
        ));
      }
      wrap.appendChild(card);
      return wrap;
    }

    /* ----- 生成 ----- */
    async function onGenerate() {
      if (state.generating) return;
      if (!state.selectedConv) { toast("请先选择会话"); return; }
      state.generating = true;
      renderBody();
      try {
        const ctx = await buildContext(roche, state, state.selectedDate);
        state.lastCtx = ctx;
        if (!ctx.dayShort.length) {
          state.lastResult = "（当日无短期聊天记录，已按空记录生成。若不合理可调整日期或会话。）";
          renderBody();
          toast("当日无消息");
          state.generating = false;
          renderBody();
          return;
        }
        const text = await generateSummary(roche, ctx, state.settings);
        state.lastResult = text || "（AI 未返回内容）";
        if (state.settings.autoSyncAfterGenerate) {
          try {
            await syncToFactMemory(roche, ctx, state.lastResult, state.settings);
            toast("已生成并同步到事实记忆");
          } catch (e) {
            console.error(e);
            toast("生成成功，但同步失败: " + (e?.message || e));
          }
        } else {
          toast("生成完成");
        }
      } catch (e) {
        console.error(e);
        state.lastResult = "生成失败：" + (e?.message || String(e));
        toast("生成失败");
      } finally {
        state.generating = false;
        renderBody();
      }
    }

    /* ----- 加载初始数据 ----- */
    async function loadAll() {
      state.conversations = await loadConversations(roche);
      if (state.conversations.length && !state.selectedConv) {
        // 默认不选，由用户选
      }
      // 预读世界书树（懒加载也行，这里轻量预读）
      if (state.settings.useWorldbook) {
        state.worldbookTree = await loadWorldbookTree(roche);
      }
      // 预读覆盖日期（取第一个会话作为预览）
      if (state.conversations.length) {
        const c0 = state.conversations[0];
        const id0 = c0.conversationId || c0.id;
        try {
          const short = await loadShortTerm(roche, id0, 500);
          state.coveredDays = coveredDays(short);
        } catch { state.coveredDays = []; }
      }
    }

    // 组装
    root.replaceChildren();
    scatterStars(root);
    root.appendChild(renderTop());
    const body = el("div", { class: "dms-body", style: { position: "relative", zIndex: "1" } });
    root.appendChild(body);
    body.appendChild(el("div", { class: "dms-wrap" }, el("div", { class: "dms-empty" }, "加载中…")));
    root.appendChild(renderFooter());

    loadAll().then(() => renderBody()).catch(e => {
      console.error(e);
      body.replaceChildren(el("div", { class: "dms-wrap" },
        el("div", { class: "dms-card" }, el("div", { class: "dms-empty" }, "加载失败: " + (e?.message || e)))
      ));
    });

    return state;
  }

  /* ============================================================
   *  注册
   * ============================================================ */
  window.RochePlugin.register({
    id: "daily-memory-summary",
    name: "每日记忆总结",
    version: "1.0.0",
    apps: [
      {
        id: "daily-memory-summary-home",
        name: "每日记忆总结",
        icon: "auto_stories",
        iconImage: "",
        async mount(container, roche) {
          const root = document.createElement("div");
          root.className = ROOT_CLASS;
          mountStyles(root);
          const settings = await getSettings(roche);
          renderApp(roche, root, settings);
          container.appendChild(root);
          // 记录引用便于卸载
          container._dms_root = root;
        },
        async unmount(container, roche) {
          const root = container._dms_root;
          if (root && root.parentNode) root.parentNode.removeChild(root);
          const style = document.getElementById(ROOT_CLASS + "-style");
          if (style) style.remove();
          container.replaceChildren();
          delete container._dms_root;
        }
      }
    ]
  });
})();

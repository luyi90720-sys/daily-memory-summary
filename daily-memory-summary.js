/*
 * 每日记忆总结 (daily-memory-summary) v1.1.0
 * 按天分割会话短期记忆，导入人设与世界书，自定义思维链与格式生成每日总结。
 * 风格：深色梦幻星河 + 毛玻璃，无廉价 emoji。
 */
(function () {
  "use strict";

  const ROOT_CLASS = "roche-plugin-dms";
  const STYLE_ID = ROOT_CLASS + "-style";
  const STORAGE_SETTINGS = "dms-settings";
  const STORAGE_SUMMARIES = "dms-summaries";

  /* ---------- 默认设置 ---------- */
  const DEFAULT_SETTINGS = {
    showFacts: false,
    showCore: false,
    useWorldbook: false,
    worldbookCategories: [],
    worldbookEntries: [],
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

  /* ---------- DOM 工具 ---------- */
  function qs(sel, root) { return (root || document).querySelector(sel); }

  function el(tag, props, children) {
    var node = document.createElement(tag);
    if (props) {
      for (var k in props) {
        if (!props.hasOwnProperty(k) || props[k] == null) continue;
        var v = props[k];
        if (k === "class") { node.className = v; continue; }
        if (k === "style" && typeof v === "object") { Object.assign(node.style, v); continue; }
        if (k === "html") { node.innerHTML = v; continue; }
        if (k === "text") { node.textContent = v; continue; }
        // DOM properties that must be set directly (not via setAttribute)
        if (k === "value" || k === "disabled" || k === "checked" || k === "selected" || k === "innerText") {
          node[k] = v; continue;
        }
        // Event handlers
        if (k.indexOf("on") === 0 && typeof v === "function") {
          node.addEventListener(k.slice(2).toLowerCase(), v);
          continue;
        }
        node.setAttribute(k, v);
      }
    }
    if (children) {
      if (!Array.isArray(children)) children = [children];
      for (var i = 0; i < children.length; i++) {
        var c = children[i];
        if (c == null || c === false) continue;
        if (typeof c === "string") c = document.createTextNode(c);
        node.appendChild(c);
      }
    }
    return node;
  }

  function pad2(n) { return String(n).padStart(2, "0"); }

  function startOfDay(d) {
    var x = new Date(d); x.setHours(0, 0, 0, 0); return x;
  }
  function endOfDay(d) { return startOfDay(d).getTime() + 86400000; }

  function toDateKey(d) {
    var x = new Date(d);
    return x.getFullYear() + "-" + pad2(x.getMonth() + 1) + "-" + pad2(x.getDate());
  }
  function fmtTime(ms) {
    var x = new Date(ms); return pad2(x.getHours()) + ":" + pad2(x.getMinutes());
  }
  function toDateInput(d) {
    var x = new Date(d); return x.getFullYear() + "-" + pad2(x.getMonth() + 1) + "-" + pad2(x.getDate());
  }
  function parseDateInput(v) {
    var p = v.split("-").map(Number); return new Date(p[0], p[1] - 1, p[2]);
  }
  function toMs(ts) { var n = Number(ts); if (!n) return Date.now(); return n < 1e12 ? n * 1000 : n; }

  /* ---------- 数据加载 ---------- */
  function loadConversations(roche) {
    return roche.conversation.list().catch(function (e) { console.warn("[DMS]", e); return []; });
  }
  function loadActiveUser(roche) {
    return roche.persona.getActiveUserPersona().catch(function () { return null; });
  }
  function loadChar(roche, id) {
    return roche.character.get(id).catch(function () { return null; });
  }
  function loadShort(roche, cid, limit) {
    return roche.memory.getShortTerm({ conversationId: cid, limit: limit }).then(function (r) {
      return Array.isArray(r) ? r : (r && r.messages || []);
    }).catch(function () { return []; });
  }
  function loadLong(roche, cid) {
    return roche.memory.getLongTerm({ conversationId: cid, limit: 100 })
      .catch(function () { return { core: null, facts: [], vectors: [] }; });
  }
  function loadWbTree(roche) {
    if (roche.worldbook.getCategoryTree) {
      return roche.worldbook.getCategoryTree().catch(function () { return []; });
    }
    return roche.worldbook.list().then(function (cats) {
      return Promise.all(cats.map(function (c) {
        return roche.worldbook.getEntries({ categoryId: c.id, scope: "global" })
          .then(function (entries) { return Object.assign({}, c, { entries: entries || [] }); })
          .catch(function () { return Object.assign({}, c, { entries: [] }); });
      }));
    }).catch(function () { return []; });
  }
  function loadWbText(roche, settings) {
    var catIds = settings.worldbookCategories || [];
    var entryIds = settings.worldbookEntries || [];
    if (!catIds.length && !entryIds.length) return Promise.resolve("");
    return loadWbTree(roche).then(function (tree) {
      var parts = [], seen = {};
      tree.forEach(function (cat) {
        if (catIds.indexOf(cat.id) >= 0) {
          (cat.entries || []).forEach(function (en) {
            var key = "c" + cat.id + "e" + en.id;
            if (seen[key]) return; seen[key] = 1;
            var t = en.content || en.text || en.description || "";
            if (t) parts.push("\u3010" + (cat.name || cat.title || "\u5206\u7c7b") + "\u3011" + (en.name || en.title || "") + "\n" + t);
          });
        }
      });
      tree.forEach(function (cat) {
        (cat.entries || []).forEach(function (en) {
          if (entryIds.indexOf(en.id) >= 0) {
            var key = "e" + en.id;
            if (seen[key]) return; seen[key] = 1;
            var t = en.content || en.text || en.description || "";
            if (t) parts.push("\u3010" + (cat.name || cat.title || "\u5206\u7c7b") + "\u3011" + (en.name || en.title || "") + "\n" + t);
          }
        });
      });
      return parts.join("\n\n");
    });
  }

  /* ---------- 按天分割 ---------- */
  function splitByDay(msgs, day) {
    var s = startOfDay(day).getTime(), e = endOfDay(day);
    return msgs.filter(function (m) { var t = toMs(m.timestamp); return t >= s && t < e; })
      .sort(function (a, b) { return toMs(a.timestamp) - toMs(b.timestamp); });
  }
  function coveredDays(msgs) {
    var s = {}; msgs.forEach(function (m) { s[toDateKey(toMs(m.timestamp))] = 1; });
    return Object.keys(s).sort().reverse();
  }

  /* ---------- 显示辅助 ---------- */
  function convInfo(c) {
    var isGroup = c.isGroup || c.type === "group";
    return {
      name: c.handle || c.name || c.title || "\u672a\u547d\u540d\u4f1a\u8bdd",
      isGroup: isGroup,
      tag: isGroup ? "\u7fa4\u804a" : "\u5355\u804a",
      avatar: c.avatar || ""
    };
  }
  function senderName(m) { return m.senderHandle || m.senderName || m.senderId || "\u672a\u77e5"; }
  function msgsToText(msgs) {
    return msgs.map(function (m) { return "[" + fmtTime(toMs(m.timestamp)) + "] " + senderName(m) + ": " + (m.text || m.content || ""); }).join("\n");
  }
  function factsToText(facts) {
    return (facts || []).map(function (f) { return f.summaryText || f.action || f.text || ""; }).filter(Boolean).join("\n");
  }
  function coreToText(core) {
    return core ? (core.summary || core.summaryText || core.text || "") : "";
  }

  /* ---------- 上下文拼装 ---------- */
  function buildCtx(roche, state, day) {
    var conv = state.selectedConv;
    var cid = conv.conversationId || conv.id;
    var info = convInfo(conv);

    return loadActiveUser(roche).then(function (user) {
      var uName = (user && (user.handle || user.name)) || "\u7528\u6237";
      var uPersona = (user && (user.persona || user.bio)) || "";

      var charP;
      if (!info.isGroup && conv.contactId) {
        charP = loadChar(roche, conv.contactId).then(function (ch) {
          return { name: ch ? (ch.handle || ch.name) : info.name, text: ch ? (ch.persona || ch.bio || "") : "" };
        });
      } else if (info.isGroup && conv.memberProfiles) {
        charP = Promise.resolve({
          name: info.name,
          text: conv.memberProfiles.map(function (p) {
            return "\u6210\u5458\u3010" + (p.handle || p.name) + "\u3011: " + (p.bio || p.description || "");
          }).join("\n")
        });
      } else {
        charP = Promise.resolve({ name: info.name, text: "" });
      }

      return charP.then(function (ch) {
        return loadShort(roche, cid, state.settings.messageLimit || 5000).then(function (all) {
          var dayMsgs = splitByDay(all, day);
          var shortT = msgsToText(dayMsgs);

          var memP;
          if (state.settings.showCore || state.settings.showFacts) {
            memP = loadLong(roche, cid).then(function (lt) {
              return { core: state.settings.showCore ? coreToText(lt.core) : "", facts: state.settings.showFacts ? factsToText(lt.facts) : "" };
            });
          } else { memP = Promise.resolve({ core: "", facts: "" }); }

          return memP.then(function (mem) {
            var wbP = state.settings.useWorldbook ? loadWbText(roche, state.settings) : Promise.resolve("");
            return wbP.then(function (wb) {
              return {
                conversationId: cid, isGroup: info.isGroup,
                userName: uName, userPersona: uPersona,
                charName: ch.name, charText: ch.text,
                dayShort: dayMsgs, shortText: shortT,
                coreText: mem.core, factsText: mem.facts,
                wbText: wb, dateKey: toDateKey(day)
              };
            });
          });
        });
      });
    });
  }

  /* ---------- AI ---------- */
  function buildMessages(ctx, settings) {
    var sys = [];
    sys.push("\u4f60\u662f\u4e00\u540d\u4e25\u8c28\u7684\u8bb0\u5fc6\u6574\u7406\u52a9\u624b\u3002\u4f60\u7684\u4efb\u52a1\u662f\u6839\u636e\u63d0\u4f9b\u7684\u5f53\u65e5\u804a\u5929\u8bb0\u5f55\u4e0e\u53ef\u9009\u80cc\u666f\u8d44\u6599\uff0c\u751f\u6210\u4e00\u4efd\u5f53\u65e5\u8bb0\u5fc6\u603b\u7ed3\u3002");
    if (ctx.userPersona) sys.push("\u3010\u7528\u6237\u4eba\u8bbe\u3011" + ctx.userName + "\n" + ctx.userPersona);
    if (ctx.charText) sys.push("\u3010\u89d2\u8272/\u4f1a\u8bdd\u4eba\u8bbe\u3011" + ctx.charName + "\n" + ctx.charText);
    if (ctx.wbText) sys.push("\u3010\u4e16\u754c\u4e66\u3011\n" + ctx.wbText);
    if (ctx.coreText) sys.push("\u3010\u5df2\u6709\u6838\u5fc3\u8bb0\u5fc6\uff08\u53c2\u8003\uff0c\u4e0d\u8981\u76f4\u63a5\u7167\u6284\uff09\u3011\n" + ctx.coreText);
    if (ctx.factsText) sys.push("\u3010\u5df2\u6709\u4e8b\u5b9e\u8bb0\u5fc6\uff08\u53c2\u8003\uff0c\u4e0d\u8981\u76f4\u63a5\u7167\u6284\uff09\u3011\n" + ctx.factsText);
    sys.push("\u3010\u5f85\u603b\u7ed3\u65e5\u671f\u3011" + ctx.dateKey);
    sys.push("\u3010\u5f53\u65e5\u804a\u5929\u8bb0\u5f55\u3011\n" + (ctx.shortText || "\uff08\u5f53\u65e5\u65e0\u804a\u5929\u8bb0\u5f55\uff09"));
    sys.push("\u7ea6\u675f\uff1a\n- \u53ea\u57fa\u4e8e\u4e0a\u8ff0\u8bb0\u5f55\u8fdb\u884c\u603b\u7ed3\uff0c\u4e0d\u8981\u634f\u9020\u7528\u6237\u672a\u8f93\u5165\u7684\u8a00\u884c\u3002\n- \u4e0d\u8981\u62a2\u8bdd\u7528\u6237\uff0c\u4e0d\u8981\u63e3\u6d4b\u7528\u6237\u6ca1\u6709\u8f93\u5165\u7684\u8bed\u8a00\u6216\u884c\u52a8\u3002\n- \u8f93\u51fa\u8bed\u8a00\u4e0e\u804a\u5929\u8bb0\u5f55\u4e3b\u8981\u8bed\u8a00\u4fdd\u6301\u4e00\u81f4\u3002");
    if (settings.thinkingChain && settings.thinkingChain.trim()) {
      sys.push("\u3010\u601d\u7ef4\u94fe\u3011\u8bf7\u5148\u5728\u5185\u90e8\u6309\u4ee5\u4e0b\u6b65\u9aa4\u63a8\u7406\uff0c\u518d\u8f93\u51fa\u6700\u7ec8\u603b\u7ed3\uff1a\n" + settings.thinkingChain);
    }
    var fmt = settings.summaryFormat && settings.summaryFormat.trim()
      ? "\u3010\u8f93\u51fa\u683c\u5f0f\u3011\u4e25\u683c\u6309\u4ee5\u4e0b\u6a21\u677f\u8f93\u51fa\uff0c\u672a\u88ab\u5360\u4f4d\u7b26\u5305\u542b\u7684\u63d0\u793a\u6587\u5b57\u4fdd\u7559\u539f\u6837\uff0c\u4e0d\u8981\u989d\u5916\u52a0\u524d\u540e\u8bf4\u660e\uff1a\n" + settings.summaryFormat
      : "\u3010\u8f93\u51fa\u683c\u5f0f\u3011\u81ea\u7531\u8f93\u51fa\u7ed3\u6784\u5316\u603b\u7ed3\u3002";
    var userMsg = fmt + "\n\n\u5360\u4f4d\u7b26\u53d8\u91cf\u53ef\u7528\uff1a{date} {conversation} {relation} {events} {pending} {inner}\u3002\u672a\u88ab\u5f15\u7528\u7684\u5360\u4f4d\u7b26\u81ea\u52a8\u5ffd\u7565\u3002";
    return [{ role: "system", content: sys.join("\n\n") }, { role: "user", content: userMsg }];
  }

  function generateSummary(roche, ctx, settings) {
    return roche.ai.chat({ messages: buildMessages(ctx, settings), temperature: 0.6 }).then(function (r) {
      var text = r && (r.text || r.content) || "";
      if (Array.isArray(text)) text = text.map(function (c) { return c && c.text || ""; }).join("");
      if (!text && typeof r === "string") text = r;
      return text;
    });
  }

  /* ---------- 同步到事实记忆 ---------- */
  function syncFact(roche, ctx, text) {
    return roche.memory.write({
      conversationId: ctx.conversationId,
      summaryText: text.slice(0, 2000),
      who: [ctx.userName, ctx.charName],
      action: "\u6bcf\u65e5\u603b\u7ed3 \u00b7 " + ctx.dateKey,
      when: ctx.dateKey,
      where: ctx.isGroup ? "\u7fa4\u804a" : "\u5355\u804a",
      source: "plugin:daily-memory-summary"
    });
  }

  /* ---------- 设置 ---------- */
  function getSettings(roche) {
    return roche.storage.get(STORAGE_SETTINGS).then(function (s) {
      return Object.assign({}, DEFAULT_SETTINGS, s || {});
    }).catch(function () { return Object.assign({}, DEFAULT_SETTINGS); });
  }
  function saveSettings(roche, s) { return roche.storage.set(STORAGE_SETTINGS, s); }
  function getSummaries(roche) {
    return roche.storage.get(STORAGE_SUMMARIES).then(function (s) { return s || {}; }).catch(function () { return {}; });
  }
  function saveSummary(roche, key, data) {
    return getSummaries(roche).then(function (all) { all[key] = data; return roche.storage.set(STORAGE_SUMMARIES, all); });
  }

  /* ============================================================
   *  样式 — 插入 document.head，不被 replaceChildren 影响
   * ============================================================ */
  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = [
      "." + ROOT_CLASS + "{",
      "  --dms-bg1:#0f0b2a;--dms-bg2:#1a1147;--dms-bg3:#2a1b5e;",
      "  --dms-glass:rgba(255,255,255,0.06);--dms-glass-strong:rgba(255,255,255,0.12);",
      "  --dms-border:rgba(255,255,255,0.14);",
      "  --dms-text:#EDE9FF;--dms-text-dim:#B8B0E0;--dms-text-mute:#7C75A8;",
      "  --dms-accent:#9D7BFF;--dms-accent2:#5BD0FF;--dms-accent3:#FF8AD8;",
      "  --dms-warn:#FFC36A;--dms-ok:#7CE0B0;",
      "  --dms-radius:16px;--dms-radius-sm:10px;",
      "  position:relative;width:100%;min-height:100%;color:var(--dms-text);",
      "  font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif;",
      "  background:",
      "    radial-gradient(1200px 700px at 15% -10%,rgba(157,123,255,0.30),transparent 60%),",
      "    radial-gradient(900px 600px at 95% 10%,rgba(91,208,255,0.22),transparent 60%),",
      "    radial-gradient(800px 700px at 50% 110%,rgba(255,138,216,0.18),transparent 60%),",
      "    linear-gradient(180deg,#0b0822 0%,#140c38 60%,#0a0720 100%);",
      "  padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left);",
      "}",
      "." + ROOT_CLASS + " *{box-sizing:border-box;margin:0;padding:0;}",
      "." + ROOT_CLASS + " .dms-top{",
      "  position:sticky;top:0;z-index:20;display:flex;align-items:center;gap:10px;",
      "  padding:12px 16px;",
      "  background:linear-gradient(180deg,rgba(15,11,42,0.92),rgba(15,11,42,0.35));",
      "  backdrop-filter:blur(18px) saturate(1.4);border-bottom:1px solid var(--dms-border);",
      "}",
      "." + ROOT_CLASS + " .dms-top h1{font-size:17px;font-weight:600;letter-spacing:1px;",
      "  background:linear-gradient(90deg,var(--dms-accent),var(--dms-accent2));",
      "  -webkit-background-clip:text;background-clip:text;color:transparent;}",
      "." + ROOT_CLASS + " .dms-top .dms-sub{font-size:11px;color:var(--dms-text-dim);margin-left:2px;}",
      "." + ROOT_CLASS + " .dms-close{",
      "  display:flex;align-items:center;justify-content:center;",
      "  width:32px;height:32px;border-radius:50%;flex-shrink:0;",
      "  background:rgba(255,255,255,0.08);border:1px solid var(--dms-border);",
      "  color:var(--dms-text);font-size:18px;cursor:pointer;",
      "  transition:all .15s ease;",
      "}",
      "." + ROOT_CLASS + " .dms-close:hover{background:rgba(255,255,255,0.18);border-color:rgba(255,255,255,0.3);}",
      "." + ROOT_CLASS + " .dms-btn{",
      "  appearance:none;border:1px solid var(--dms-border);cursor:pointer;",
      "  background:var(--dms-glass);color:var(--dms-text);",
      "  padding:8px 14px;border-radius:var(--dms-radius-sm);font-size:13px;",
      "  backdrop-filter:blur(8px);transition:all .2s ease;",
      "  display:inline-flex;align-items:center;gap:6px;font-family:inherit;",
      "}",
      "." + ROOT_CLASS + " .dms-btn:hover{background:var(--dms-glass-strong);border-color:rgba(255,255,255,0.28);}",
      "." + ROOT_CLASS + " .dms-btn:disabled{opacity:.5;cursor:not-allowed;}",
      "." + ROOT_CLASS + " .dms-btn-primary{",
      "  background:linear-gradient(135deg,rgba(157,123,255,0.85),rgba(91,208,255,0.65));",
      "  border-color:transparent;color:#0b0822;font-weight:600;}",
      "." + ROOT_CLASS + " .dms-btn-primary:hover{filter:brightness(1.1);}",
      "." + ROOT_CLASS + " .dms-wrap{padding:16px;max-width:860px;margin:0 auto;padding-bottom:100px;}",
      "." + ROOT_CLASS + " .dms-card{",
      "  background:var(--dms-glass);border:1px solid var(--dms-border);",
      "  border-radius:var(--dms-radius);padding:16px;margin-bottom:14px;",
      "  backdrop-filter:blur(16px) saturate(1.3);box-shadow:0 8px 32px rgba(0,0,0,0.25);}",
      "." + ROOT_CLASS + " .dms-card h2{font-size:14px;font-weight:600;color:var(--dms-text);display:flex;align-items:center;gap:8px;margin-bottom:4px;}",
      "." + ROOT_CLASS + " .dms-card .dms-card-sub{font-size:11px;color:var(--dms-text-mute);margin-bottom:12px;}",
      "." + ROOT_CLASS + " .dms-badge{",
      "  display:inline-flex;align-items:center;justify-content:center;",
      "  width:20px;height:20px;border-radius:50%;flex-shrink:0;",
      "  background:linear-gradient(135deg,var(--dms-accent),var(--dms-accent2));",
      "  color:#0b0822;font-size:11px;font-weight:700;}",
      "." + ROOT_CLASS + " .dms-conv-list{display:flex;flex-direction:column;gap:8px;max-height:320px;overflow:auto;}",
      "." + ROOT_CLASS + " .dms-conv-item{",
      "  display:flex;align-items:center;gap:10px;padding:10px 12px;",
      "  background:var(--dms-glass);border:1px solid var(--dms-border);",
      "  border-radius:var(--dms-radius-sm);cursor:pointer;transition:all .15s ease;}",
      "." + ROOT_CLASS + " .dms-conv-item:hover{background:var(--dms-glass-strong);}",
      "." + ROOT_CLASS + " .dms-conv-item.active{border-color:var(--dms-accent);background:linear-gradient(135deg,rgba(157,123,255,0.22),rgba(91,208,255,0.10));}",
      "." + ROOT_CLASS + " .dms-avatar{",
      "  width:36px;height:36px;border-radius:50%;flex-shrink:0;",
      "  background:linear-gradient(135deg,var(--dms-accent),var(--dms-accent2));",
      "  display:flex;align-items:center;justify-content:center;color:#0b0822;font-weight:600;overflow:hidden;}",
      "." + ROOT_CLASS + " .dms-avatar img{width:100%;height:100%;object-fit:cover;}",
      "." + ROOT_CLASS + " .dms-conv-info{flex:1;min-width:0;}",
      "." + ROOT_CLASS + " .dms-conv-name{font-size:13px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}",
      "." + ROOT_CLASS + " .dms-conv-meta{font-size:10px;color:var(--dms-text-mute);margin-top:2px;}",
      "." + ROOT_CLASS + " .dms-tag{",
      "  font-size:10px;padding:2px 8px;border-radius:10px;flex-shrink:0;",
      "  background:rgba(157,123,255,0.22);color:var(--dms-accent);border:1px solid rgba(157,123,255,0.4);}",
      "." + ROOT_CLASS + " .dms-tag.group{background:rgba(91,208,255,0.18);color:var(--dms-accent2);border-color:rgba(91,208,255,0.4);}",
      "." + ROOT_CLASS + " .dms-check{",
      "  width:18px;height:18px;border-radius:5px;border:1.5px solid var(--dms-text-mute);",
      "  display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:all .15s ease;}",
      "." + ROOT_CLASS + " .dms-conv-item.active .dms-check{",
      "  background:linear-gradient(135deg,var(--dms-accent),var(--dms-accent2));border-color:transparent;}",
      "." + ROOT_CLASS + " .dms-conv-item.active .dms-check::after{",
      "  content:'';width:5px;height:9px;border:solid #0b0822;border-width:0 2px 2px 0;transform:rotate(45deg) translate(-1px,-1px);}",
      "." + ROOT_CLASS + " .dms-row{display:flex;align-items:center;gap:12px;margin-bottom:10px;}",
      "." + ROOT_CLASS + " .dms-row:last-child{margin-bottom:0;}",
      "." + ROOT_CLASS + " .dms-label{font-size:13px;color:var(--dms-text-dim);}",
      "." + ROOT_CLASS + " .dms-hint{font-size:11px;color:var(--dms-text-mute);margin-top:2px;}",
      "." + ROOT_CLASS + " .dms-switch{",
      "  position:relative;width:42px;height:24px;border-radius:12px;flex-shrink:0;",
      "  background:rgba(255,255,255,0.12);border:1px solid var(--dms-border);cursor:pointer;transition:all .2s ease;}",
      "." + ROOT_CLASS + " .dms-switch::after{",
      "  content:'';position:absolute;top:2px;left:2px;width:18px;height:18px;border-radius:50%;background:#fff;transition:all .2s ease;}",
      "." + ROOT_CLASS + " .dms-switch.on{background:linear-gradient(135deg,var(--dms-accent),var(--dms-accent2));border-color:transparent;}",
      "." + ROOT_CLASS + " .dms-switch.on::after{left:21px;}",
      "." + ROOT_CLASS + " .dms-input,." + ROOT_CLASS + " .dms-textarea{",
      "  width:100%;padding:9px 12px;border-radius:var(--dms-radius-sm);",
      "  background:rgba(0,0,0,0.25);border:1px solid var(--dms-border);",
      "  color:var(--dms-text);font-size:13px;font-family:inherit;outline:none;}",
      "." + ROOT_CLASS + " .dms-input:focus,." + ROOT_CLASS + " .dms-textarea:focus{border-color:var(--dms-accent);}",
      "." + ROOT_CLASS + " .dms-textarea{resize:vertical;min-height:80px;line-height:1.5;white-space:pre-wrap;}",
      "." + ROOT_CLASS + " .dms-textarea.tall{min-height:140px;}",
      "." + ROOT_CLASS + " .dms-date-row{display:flex;gap:10px;align-items:center;flex-wrap:wrap;}",
      "." + ROOT_CLASS + " .dms-date-row .dms-input{max-width:180px;}",
      "." + ROOT_CLASS + " .dms-empty{text-align:center;padding:24px 12px;color:var(--dms-text-mute);font-size:13px;}",
      "." + ROOT_CLASS + " .dms-pill{",
      "  font-size:10px;padding:2px 8px;border-radius:10px;",
      "  background:rgba(255,255,255,0.08);border:1px solid var(--dms-border);color:var(--dms-text-dim);}",
      "." + ROOT_CLASS + " .dms-result{",
      "  background:rgba(0,0,0,0.3);border:1px solid var(--dms-border);",
      "  border-radius:var(--dms-radius-sm);padding:14px;",
      "  white-space:pre-wrap;word-break:break-word;font-size:13px;line-height:1.7;max-height:480px;overflow:auto;}",
      "." + ROOT_CLASS + " .dms-result-meta{font-size:11px;color:var(--dms-text-mute);margin-bottom:8px;display:flex;gap:8px;flex-wrap:wrap;}",
      "." + ROOT_CLASS + " .dms-warn-box{",
      "  font-size:11px;padding:8px 12px;border-radius:8px;margin-top:10px;",
      "  background:rgba(255,195,106,0.10);border:1px solid rgba(255,195,106,0.3);color:var(--dms-warn);}",
      "." + ROOT_CLASS + " .dms-footer{",
      "  position:fixed;left:0;right:0;bottom:0;z-index:30;",
      "  padding:10px 16px calc(10px + env(safe-area-inset-bottom));",
      "  background:linear-gradient(0deg,rgba(10,7,32,0.95),rgba(10,7,32,0.6));",
      "  backdrop-filter:blur(20px);border-top:1px solid var(--dms-border);",
      "  display:flex;gap:10px;justify-content:space-between;align-items:center;}",
      "." + ROOT_CLASS + " .dms-foot-left{font-size:11px;color:var(--dms-text-mute);}",
      "." + ROOT_CLASS + " .dms-toast{",
      "  position:fixed;left:50%;bottom:calc(50px + env(safe-area-inset-bottom));",
      "  transform:translateX(-50%);z-index:999;",
      "  background:rgba(15,11,42,0.92);border:1px solid var(--dms-border);",
      "  color:var(--dms-text);padding:10px 18px;border-radius:24px;",
      "  backdrop-filter:blur(18px);font-size:13px;box-shadow:0 8px 32px rgba(0,0,0,0.4);",
      "  opacity:0;pointer-events:none;transition:opacity .2s ease,transform .2s ease;}",
      "." + ROOT_CLASS + " .dms-toast.show{opacity:1;transform:translateX(-50%) translateY(-4px);}",
      "." + ROOT_CLASS + " .dms-loading{",
      "  display:inline-block;width:14px;height:14px;border-radius:50%;",
      "  border:2px solid rgba(255,255,255,0.25);border-top-color:#fff;",
      "  animation:dms-spin 0.8s linear infinite;vertical-align:middle;margin-right:4px;}",
      "@keyframes dms-spin{to{transform:rotate(360deg);}}",
      "." + ROOT_CLASS + " .dms-hist{padding:10px 12px;background:var(--dms-glass);border:1px solid var(--dms-border);border-radius:var(--dms-radius-sm);margin-bottom:8px;}",
      "." + ROOT_CLASS + " .dms-hist:hover{background:var(--dms-glass-strong);}",
      "." + ROOT_CLASS + " .dms-hist-head{display:flex;justify-content:space-between;gap:8px;margin-bottom:4px;}",
      "." + ROOT_CLASS + " .dms-hist-title{font-size:13px;font-weight:500;}",
      "." + ROOT_CLASS + " .dms-hist-date{font-size:11px;color:var(--dms-text-mute);}",
      "." + ROOT_CLASS + " .dms-hist-snippet{font-size:12px;color:var(--dms-text-dim);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}",
      "." + ROOT_CLASS + " .dms-wb-tree{max-height:260px;overflow:auto;}",
      "." + ROOT_CLASS + " .dms-wb-cat{padding:8px 10px;background:var(--dms-glass);border:1px solid var(--dms-border);border-radius:var(--dms-radius-sm);margin-bottom:6px;cursor:pointer;}",
      "." + ROOT_CLASS + " .dms-wb-cat.active{border-color:var(--dms-accent);background:rgba(157,123,255,0.18);}",
      "." + ROOT_CLASS + " .dms-wb-cat-head{display:flex;align-items:center;gap:8px;}",
      "." + ROOT_CLASS + " .dms-wb-name{font-size:13px;font-weight:500;}",
      "." + ROOT_CLASS + " .dms-wb-entries{margin-top:6px;padding-left:20px;display:flex;flex-direction:column;gap:4px;}",
      "." + ROOT_CLASS + " .dms-wb-entry{font-size:12px;padding:5px 8px;border-radius:6px;cursor:pointer;background:rgba(0,0,0,0.2);border:1px solid transparent;}",
      "." + ROOT_CLASS + " .dms-wb-entry.active{border-color:var(--dms-accent2);background:rgba(91,208,255,0.12);}",
      "." + ROOT_CLASS + " .dms-star{position:absolute;border-radius:50%;background:#fff;pointer-events:none;filter:blur(0.4px);}"
    ].join("\n");
    document.head.appendChild(style);
  }

  function removeStyle() {
    var s = document.getElementById(STYLE_ID);
    if (s) s.remove();
  }

  /* ---------- 主渲染 ---------- */
  function renderApp(roche, root, settings) {
    var state = {
      settings: settings,
      conversations: [],
      selectedConvId: "",
      selectedConv: null,
      selectedDate: new Date(),
      coveredDays: [],
      worldbookTree: [],
      generating: false,
      lastResult: "",
      lastCtx: null,
      tab: "main"
    };

    function toast(msg) {
      var t = qs(".dms-toast", root);
      if (!t) { t = el("div", { class: "dms-toast" }); root.appendChild(t); }
      t.textContent = msg;
      t.classList.add("show");
      clearTimeout(t._t);
      t._t = setTimeout(function () { t.classList.remove("show"); }, 1800);
    }

    function switchTab(tab) { state.tab = tab; renderContent(); }

    /* 顶栏 */
    function buildTop() {
      return el("div", { class: "dms-top" }, [
        el("button", { class: "dms-close", onclick: function () { roche.ui.closeApp(); } }, ["\u00d7"]),
        el("div", { style: { flex: "1" } }, [
          el("h1", {}, ["\u6bcf\u65e5\u8bb0\u5fc6\u603b\u7ed3"]),
          el("div", { class: "dms-sub" }, ["\u6309\u5929\u5206\u5272\u77ed\u671f\u8bb0\u5fc6 \u00b7 \u81ea\u5b9a\u4e49\u601d\u7ef4\u94fe\u4e0e\u683c\u5f0f"])
        ])
      ]);
    }

    /* 底栏 */
    function buildFooter() {
      var left = el("div", { class: "dms-foot-left" },
        [state.selectedConv ? "\u5df2\u9009: " + convInfo(state.selectedConv).name + " \u00b7 " + toDateKey(state.selectedDate) : "\u672a\u9009\u62e9\u4f1a\u8bdd"]);
      var right = el("div", { style: { display: "flex", gap: "8px" } }, [
        el("button", { class: "dms-btn", onclick: function () { switchTab(state.tab === "main" ? "history" : "main"); } },
          [state.tab === "main" ? "\u5386\u53f2\u603b\u7ed3" : "\u8fd4\u56de\u751f\u6210"]),
        el("button", {
          class: "dms-btn dms-btn-primary",
          disabled: !state.selectedConv || state.generating,
          onclick: function () { onGenerate(); }
        }, [state.generating ? "\u751f\u6210\u4e2d\u2026" : "\u751f\u6210\u603b\u7ed3"])
      ]);
      return el("div", { class: "dms-footer" }, [left, right]);
    }

    /* 主体 */
    function renderContent() {
      var body = qs(".dms-body", root);
      if (!body) return;
      body.innerHTML = "";
      if (state.tab === "history") {
        body.appendChild(buildHistory());
      } else {
        body.appendChild(buildMain());
      }
      var foot = qs(".dms-footer", root);
      if (foot) foot.remove();
      root.appendChild(buildFooter());
    }

    /* 主页 */
    function buildMain() {
      var wrap = el("div", { class: "dms-wrap" });

      // 步骤1: 会话
      var convCard = el("div", { class: "dms-card" }, [
        el("h2", {}, [el("span", { class: "dms-badge" }, ["1"]), " \u9009\u62e9\u4f1a\u8bdd"]),
        el("div", { class: "dms-card-sub" }, ["\u652f\u6301\u5355\u804a\u4e0e\u7fa4\u804a\uff0c\u53ef\u8bfb\u53d6\u5bf9\u5e94\u77ed\u671f\u8bb0\u5fc6\u3002"])
      ]);
      var convList = el("div", { class: "dms-conv-list" });
      if (!state.conversations.length) {
        convList.appendChild(el("div", { class: "dms-empty" }, ["\u6682\u65e0\u4f1a\u8bdd\uff0c\u70b9\u53f3\u4e0a\u89d2\u5237\u65b0\u91cd\u8bd5\u3002"]));
      } else {
        state.conversations.forEach(function (c) {
          var info = convInfo(c);
          var active = state.selectedConvId === (c.conversationId || c.id);
          var avatar = info.avatar
            ? el("div", { class: "dms-avatar" }, [el("img", { src: info.avatar })])
            : el("div", { class: "dms-avatar" }, [info.name.slice(0, 1)]);
          convList.appendChild(el("div", {
            class: "dms-conv-item" + (active ? " active" : ""),
            onclick: function () {
              state.selectedConvId = c.conversationId || c.id;
              state.selectedConv = c;
              // 加载该会话的覆盖日期
              loadShort(roche, state.selectedConvId, 500).then(function (msgs) {
                state.coveredDays = coveredDays(msgs);
                renderContent();
              });
              renderContent();
            }
          }, [
            el("div", { class: "dms-check" }),
            avatar,
            el("div", { class: "dms-conv-info" }, [
              el("div", { class: "dms-conv-name" }, [info.name]),
              el("div", { class: "dms-conv-meta" }, [
                c.handle && !info.isGroup ? "@" + c.handle : (c.memberProfiles ? c.memberProfiles.length + " \u4f4d\u6210\u5458" : "\u4f1a\u8bdd"),
                " \u00b7 " + (c.conversationId || c.id || "").slice(0, 8)
              ])
            ]),
            el("span", { class: "dms-tag" + (info.isGroup ? " group" : "") }, [info.tag])
          ]));
        });
      }
      convCard.appendChild(convList);
      wrap.appendChild(convCard);

      // 步骤2: 日期
      var dateCard = el("div", { class: "dms-card" }, [
        el("h2", {}, [el("span", { class: "dms-badge" }, ["2"]), " \u9009\u62e9\u65e5\u671f"]),
        el("div", { class: "dms-card-sub" }, ["\u6309\u672c\u5730\u65f6\u533a 00:00 ~ \u6b21\u65e5 00:00 \u5207\u5272\u5f53\u5929\u77ed\u671f\u8bb0\u5fc6\u3002"])
      ]);
      var dateInput = el("input", { type: "date", class: "dms-input" });
      dateInput.value = toDateInput(state.selectedDate);
      dateInput.max = toDateInput(new Date());
      dateInput.addEventListener("change", function () {
        if (this.value) state.selectedDate = parseDateInput(this.value);
      });
      var dateRow = el("div", { class: "dms-date-row" }, [dateInput]);
      if (state.coveredDays.length) {
        var quick = el("div", { style: { marginTop: "8px", display: "flex", gap: "6px", flexWrap: "wrap" } });
        quick.appendChild(el("span", { style: { fontSize: "11px", color: "var(--dms-text-mute)", alignSelf: "center" } }, ["\u6709\u8bb0\u5f55\u7684\u65e5\u671f:"]));
        state.coveredDays.slice(0, 10).forEach(function (dk) {
          var pill = el("span", { class: "dms-pill", style: { cursor: "pointer" } }, [dk]);
          pill.addEventListener("click", function () {
            state.selectedDate = parseDateInput(dk);
            dateInput.value = dk;
            renderContent();
          });
          quick.appendChild(pill);
        });
        dateRow.appendChild(quick);
      }
      dateCard.appendChild(dateRow);
      wrap.appendChild(dateCard);

      // 步骤3: 内容选项
      var optCard = el("div", { class: "dms-card" }, [
        el("h2", {}, [el("span", { class: "dms-badge" }, ["3"]), " \u5185\u5bb9\u9009\u9879"]),
        el("div", { class: "dms-card-sub" }, ["\u9009\u62e9\u8981\u6ce8\u5165\u7ed9 AI \u7684\u80cc\u666f\u8d44\u6599\u3002"])
      ]);
      optCard.appendChild(makeSwitch("\u663e\u793a\u5df2\u6709\u6838\u5fc3\u8bb0\u5fc6", "\u628a\u6838\u5fc3\u8bb0\u5fc6\u4f5c\u4e3a\u53c2\u8003\u6ce8\u5165\u3002", state.settings.showCore, function (v) {
        state.settings.showCore = v; saveSettings(roche, state.settings);
      }));
      optCard.appendChild(makeSwitch("\u663e\u793a\u5df2\u6709\u4e8b\u5b9e\u8bb0\u5fc6", "\u628a\u4e8b\u5b9e\u8bb0\u5fc6\u4f5c\u4e3a\u53c2\u8003\u6ce8\u5165\u3002", state.settings.showFacts, function (v) {
        state.settings.showFacts = v; saveSettings(roche, state.settings);
      }));
      optCard.appendChild(makeSwitch("\u542f\u7528\u4e16\u754c\u4e66", "\u52fe\u9009\u540e\u53ef\u5728\u4e0b\u65b9\u6311\u9009\u5206\u7c7b/\u8bcd\u6761\u3002", state.settings.useWorldbook, function (v) {
        state.settings.useWorldbook = v; saveSettings(roche, state.settings);
        if (v && !state.worldbookTree.length) { loadWbTree(roche).then(function (t) { state.worldbookTree = t; renderContent(); }); }
        else renderContent();
      }));
      if (state.settings.useWorldbook) optCard.appendChild(buildWbPicker());
      wrap.appendChild(optCard);

      // 步骤4: 思维链与格式
      var tplCard = el("div", { class: "dms-card" }, [
        el("h2", {}, [el("span", { class: "dms-badge" }, ["4"]), " \u601d\u7ef4\u94fe\u4e0e\u683c\u5f0f"]),
        el("div", { class: "dms-card-sub" }, ["\u81ea\u5b9a\u4e49\u63a8\u7406\u6b65\u9aa4\u4e0e\u8f93\u51fa\u6a21\u677f\uff0c\u5360\u4f4d\u7b26 {date} {conversation} {relation} {events} {pending} {inner}\u3002"])
      ]);
      tplCard.appendChild(el("div", { style: { marginBottom: "6px", fontSize: "12px", color: "var(--dms-text-dim)" } }, ["\u601d\u7ef4\u94fe"]));
      var tc = el("textarea", { class: "dms-textarea", placeholder: "\u8bf7\u8f93\u5165\u601d\u7ef4\u94fe\u6b65\u9aa4\u2026" });
      tc.value = state.settings.thinkingChain || "";
      tc.addEventListener("change", function () {
        state.settings.thinkingChain = this.value; saveSettings(roche, state.settings); toast("\u601d\u7ef4\u94fe\u5df2\u4fdd\u5b58");
      });
      tplCard.appendChild(tc);

      tplCard.appendChild(el("div", { style: { marginTop: "12px", marginBottom: "6px", fontSize: "12px", color: "var(--dms-text-dim)" } }, ["\u8f93\u51fa\u683c\u5f0f"]));
      var fmt = el("textarea", { class: "dms-textarea tall", placeholder: "\u8bf7\u8f93\u5165\u8f93\u51fa\u683c\u5f0f\u6a21\u677f\u2026" });
      fmt.value = state.settings.summaryFormat || "";
      fmt.addEventListener("change", function () {
        state.settings.summaryFormat = this.value; saveSettings(roche, state.settings); toast("\u683c\u5f0f\u6a21\u677f\u5df2\u4fdd\u5b58");
      });
      tplCard.appendChild(fmt);

      tplCard.appendChild(el("div", { style: { marginTop: "14px" } }, [
        makeSwitch("\u751f\u6210\u540e\u81ea\u52a8\u540c\u6b65\u5230\u4e8b\u5b9e\u8bb0\u5fc6", "\u6ce8\u610f\uff1a\u5199\u5165\u7684\u662f Roche \u4e3b\u4e8b\u5b9e\u8bb0\u5fc6\uff0c\u5378\u8f7d\u63d2\u4ef6\u4e0d\u4f1a\u81ea\u52a8\u5220\u9664\u3002", state.settings.autoSyncAfterGenerate, function (v) {
          state.settings.autoSyncAfterGenerate = v; saveSettings(roche, state.settings); renderContent();
        })
      ]));
      if (state.settings.autoSyncAfterGenerate) {
        tplCard.appendChild(el("div", { class: "dms-warn-box" },
          ["\u5df2\u5f00\u542f\u81ea\u52a8\u540c\u6b65\uff1a\u6bcf\u6b21\u751f\u6210\u6210\u529f\u540e\u4f1a\u5199\u5165\u4e00\u6761\u4e3b\u4e8b\u5b9e\u8bb0\u5fc6\u3002\u4e3b\u8bb0\u5fc6\u4e0d\u4f1a\u968f\u63d2\u4ef6\u5378\u8f7d\u800c\u5220\u9664\uff0c\u8bf7\u8c28\u614e\u4f7f\u7528\u3002"]));
      }
      wrap.appendChild(tplCard);

      // 步骤5: 结果
      var resultCard = el("div", { class: "dms-card" }, [
        el("h2", {}, [el("span", { class: "dms-badge" }, ["5"]), " \u603b\u7ed3\u7ed3\u679c"])
      ]);
      if (state.lastResult) {
        var ctx = state.lastCtx;
        var meta = el("div", { class: "dms-result-meta" });
        if (ctx) {
          meta.appendChild(el("span", { class: "dms-pill" }, [ctx.dateKey]));
          meta.appendChild(el("span", { class: "dms-pill" }, [ctx.isGroup ? "\u7fa4\u804a" : "\u5355\u804a"]));
          meta.appendChild(el("span", { class: "dms-pill" }, ["\u6d88\u606f " + (ctx.dayShort ? ctx.dayShort.length : 0) + " \u6761"]));
        }
        resultCard.appendChild(meta);
        resultCard.appendChild(el("div", { class: "dms-result" }, [state.lastResult]));
        var btnBox = el("div", { style: { marginTop: "10px", display: "flex", gap: "8px", flexWrap: "wrap" } });
        btnBox.appendChild(el("button", { class: "dms-btn", onclick: function () {
          navigator.clipboard.writeText(state.lastResult).then(function () { toast("\u5df2\u590d\u5236"); }).catch(function () { toast("\u590d\u5236\u5931\u8d25"); });
        } }, ["\u590d\u5236"]));
        btnBox.appendChild(el("button", { class: "dms-btn", onclick: function () {
          if (!ctx) return;
          roche.ui.confirm({ title: "\u540c\u6b65\u5230\u4e8b\u5b9e\u8bb0\u5fc6", message: "\u5c06\u628a\u672c\u6b21\u603b\u7ed3\u5199\u5165\u8be5\u4f1a\u8bdd\u7684\u4e3b\u4e8b\u5b9e\u8bb0\u5fc6\u3002\u4e3b\u8bb0\u5fc6\u4e0d\u4f1a\u968f\u63d2\u4ef6\u5378\u8f7d\u800c\u5220\u9664\uff0c\u662f\u5426\u7ee7\u7eed\uff1f" }).then(function (ok) {
            if (!ok) return;
            return syncFact(roche, ctx, state.lastResult).then(function () { toast("\u5df2\u5199\u5165\u4e8b\u5b9e\u8bb0\u5fc6"); });
          }).catch(function (e) { toast("\u5199\u5165\u5931\u8d25"); });
        } }, ["\u624b\u52a8\u540c\u6b65\u5230\u4e8b\u5b9e\u8bb0\u5fc6"]));
        btnBox.appendChild(el("button", { class: "dms-btn", onclick: function () {
          if (!ctx) return;
          saveSummary(roche, ctx.conversationId + ":" + ctx.dateKey + ":" + Date.now(), {
            text: state.lastResult, conversationId: ctx.conversationId,
            conversationName: ctx.charName, date: ctx.dateKey, createdAt: Date.now()
          }).then(function () { toast("\u5df2\u4fdd\u5b58\u5230\u5386\u53f2"); });
        } }, ["\u4fdd\u5b58\u5230\u5386\u53f2"]));
        resultCard.appendChild(btnBox);
      } else {
        resultCard.appendChild(el("div", { class: "dms-empty" }, ["\u5c1a\u672a\u751f\u6210\u603b\u7ed3\u3002\u9009\u597d\u4f1a\u8bdd\u4e0e\u65e5\u671f\uff0c\u70b9\u5e95\u90e8\u300c\u751f\u6210\u603b\u7ed3\u300d\u5373\u53ef\u3002"]));
      }
      wrap.appendChild(resultCard);
      return wrap;
    }

    function makeSwitch(label, hint, val, onChange) {
      var sw = el("div", { class: "dms-switch" + (val ? " on" : "") });
      sw.addEventListener("click", function () {
        var v = !sw.classList.contains("on");
        sw.classList.toggle("on", v);
        onChange(v);
      });
      return el("div", { class: "dms-row" }, [
        el("div", { style: { flex: "1" } }, [
          el("div", { class: "dms-label" }, [label]),
          hint ? el("div", { class: "dms-hint" }, [hint]) : null
        ]),
        sw
      ]);
    }

    function buildWbPicker() {
      var box = el("div", { style: { marginTop: "10px" } }, [
        el("div", { style: { fontSize: "12px", color: "var(--dms-text-dim)", marginBottom: "6px" } }, ["\u4e16\u754c\u4e66\u5206\u7c7b / \u8bcd\u6761"])
      ]);
      var treeBox = el("div", { class: "dms-wb-tree" });
      if (!state.worldbookTree.length) {
        treeBox.appendChild(el("div", { class: "dms-empty" }, ["\u6682\u65e0\u4e16\u754c\u4e66\u6570\u636e\u3002"]));
      } else {
        state.worldbookTree.forEach(function (cat) {
          var catActive = state.settings.worldbookCategories.indexOf(cat.id) >= 0;
          var catItem = el("div", { class: "dms-wb-cat" + (catActive ? " active" : "") });
          var head = el("div", { class: "dms-wb-cat-head" }, [
            el("div", { class: "dms-check" }),
            el("div", { class: "dms-wb-name" }, [cat.name || cat.title || "\u672a\u547d\u540d\u5206\u7c7b"]),
            el("span", { class: "dms-pill", style: { marginLeft: "auto" } }, [String((cat.entries || []).length)])
          ]);
          catItem.appendChild(head);
          var entriesBox = el("div", { class: "dms-wb-entries", style: { display: "none" } });
          (cat.entries || []).forEach(function (en) {
            var enActive = state.settings.worldbookEntries.indexOf(en.id) >= 0;
            var enItem = el("div", { class: "dms-wb-entry" + (enActive ? " active" : "") }, [en.name || en.title || en.id]);
            enItem.addEventListener("click", function (ev) {
              ev.stopPropagation();
              var arr = state.settings.worldbookEntries;
              var i = arr.indexOf(en.id);
              if (i >= 0) arr.splice(i, 1); else arr.push(en.id);
              saveSettings(roche, state.settings);
              enItem.classList.toggle("active");
            });
            entriesBox.appendChild(enItem);
          });
          head.addEventListener("click", function () {
            var arr = state.settings.worldbookCategories;
            var i = arr.indexOf(cat.id);
            if (i >= 0) arr.splice(i, 1); else arr.push(cat.id);
            saveSettings(roche, state.settings);
            catItem.classList.toggle("active");
            entriesBox.style.display = entriesBox.style.display === "none" ? "flex" : "none";
          });
          catItem.appendChild(entriesBox);
          treeBox.appendChild(catItem);
        });
      }
      box.appendChild(treeBox);
      return box;
    }

    /* 历史 */
    function buildHistory() {
      var wrap = el("div", { class: "dms-wrap" });
      var card = el("div", { class: "dms-card" }, [
        el("h2", {}, ["\u5386\u53f2\u603b\u7ed3"]),
        el("div", { class: "dms-card-sub" }, ["\u4fdd\u5b58\u5728\u672c\u63d2\u4ef6\u79c1\u6709\u5b58\u50a8\uff0c\u5378\u8f7d\u63d2\u4ef6\u4f1a\u4e00\u5e76\u6e05\u9664\u3002"])
      ]);
      wrap.appendChild(card);
      getSummaries(roche).then(function (all) {
        var keys = Object.keys(all).sort(function (a, b) { return (all[b].createdAt || 0) - (all[a].createdAt || 0); });
        if (!keys.length) {
          card.appendChild(el("div", { class: "dms-empty" }, ["\u6682\u65e0\u5386\u53f2\u603b\u7ed3\u3002"]));
        } else {
          keys.forEach(function (k) {
            var it = all[k];
            var item = el("div", { class: "dms-hist" });
            item.appendChild(el("div", { class: "dms-hist-head" }, [
              el("div", { class: "dms-hist-title" }, [(it.conversationName || "\u4f1a\u8bdd") + " \u00b7 " + (it.date || "")]),
              el("div", { class: "dms-hist-date" }, [new Date(it.createdAt || 0).toLocaleString()])
            ]));
            item.appendChild(el("div", { class: "dms-hist-snippet" }, [(it.text || "").slice(0, 80)]));
            var btns = el("div", { style: { marginTop: "8px", display: "flex", gap: "6px" } });
            btns.appendChild(el("button", { class: "dms-btn", onclick: function (ev) {
              ev.stopPropagation();
              state.lastResult = it.text || "";
              state.lastCtx = { conversationId: it.conversationId, charName: it.conversationName, isGroup: false, dateKey: it.date, dayShort: [] };
              state.tab = "main"; renderContent();
            } }, ["\u8f7d\u5165"]));
            btns.appendChild(el("button", { class: "dms-btn", onclick: function (ev) {
              ev.stopPropagation();
              roche.ui.confirm({ title: "\u5220\u9664", message: "\u5220\u9664\u8fd9\u6761\u5386\u53f2\u603b\u7ed3\uff1f" }).then(function (ok) {
                if (!ok) return;
                delete all[k]; return roche.storage.set(STORAGE_SUMMARIES, all).then(function () { toast("\u5df2\u5220\u9664"); renderContent(); });
              });
            } }, ["\u5220\u9664"]));
            item.appendChild(btns);
            card.appendChild(item);
          });
          card.appendChild(el("div", { style: { marginTop: "10px" } }, [
            el("button", { class: "dms-btn", onclick: function () {
              roche.ui.confirm({ title: "\u6e05\u7a7a", message: "\u6e05\u7a7a\u5168\u90e8\u5386\u53f2\u603b\u7ed3\uff1f" }).then(function (ok) {
                if (!ok) return;
                return roche.storage.set(STORAGE_SUMMARIES, {}).then(function () { toast("\u5df2\u6e05\u7a7a"); renderContent(); });
              });
            } }, ["\u6e05\u7a7a\u5168\u90e8\u5386\u53f2"])
          ]));
        }
      });
      return wrap;
    }

    /* 生成 */
    function onGenerate() {
      if (state.generating) return;
      if (!state.selectedConv) { toast("\u8bf7\u5148\u9009\u62e9\u4f1a\u8bdd"); return; }
      state.generating = true;
      renderContent();
      buildCtx(roche, state, state.selectedDate).then(function (ctx) {
        state.lastCtx = ctx;
        if (!ctx.dayShort.length) {
          state.lastResult = "\uff08\u5f53\u65e5\u65e0\u77ed\u671f\u804a\u5929\u8bb0\u5f55\uff0c\u8bf7\u8c03\u6574\u65e5\u671f\u6216\u4f1a\u8bdd\u3002\uff09";
          state.generating = false; renderContent(); return;
        }
        return generateSummary(roche, ctx, state.settings).then(function (text) {
          state.lastResult = text || "\uff08AI \u672a\u8fd4\u56de\u5185\u5bb9\uff09";
          if (state.settings.autoSyncAfterGenerate) {
            return syncFact(roche, ctx, state.lastResult).then(function () {
              toast("\u5df2\u751f\u6210\u5e76\u540c\u6b65\u5230\u4e8b\u5b9e\u8bb0\u5fc6");
            }).catch(function () { toast("\u751f\u6210\u6210\u529f\uff0c\u4f46\u540c\u6b65\u5931\u8d25"); });
          } else { toast("\u751f\u6210\u5b8c\u6210"); }
        });
      }).catch(function (e) {
        console.error(e);
        state.lastResult = "\u751f\u6210\u5931\u8d25\uff1a" + (e && e.message || e);
        toast("\u751f\u6210\u5931\u8d25");
      }).then(function () {
        state.generating = false;
        renderContent();
      });
    }

    /* 加载 */
    function loadAll() {
      return loadConversations(roche).then(function (convs) {
        state.conversations = convs;
        if (state.settings.useWorldbook) {
          return loadWbTree(roche).then(function (t) { state.worldbookTree = t; });
        }
      });
    }

    // ---- 组装 DOM（不清空已有 style） ----
    // root 里已有 class，直接追加子元素
    root.appendChild(buildTop());
    var body = el("div", { class: "dms-body", style: { position: "relative", zIndex: "1" } });
    root.appendChild(body);
    body.appendChild(el("div", { class: "dms-wrap" }, [el("div", { class: "dms-empty" }, ["\u52a0\u8f7d\u4e2d\u2026"])]));
    root.appendChild(buildFooter());

    // 撒星
    var starWrap = el("div", { style: { position: "absolute", inset: "0", pointerEvents: "none", overflow: "hidden", zIndex: "0" } });
    for (var i = 0; i < 20; i++) {
      var s = el("div", { class: "dms-star" });
      var sz = Math.random() * 2 + 1;
      s.style.width = sz + "px"; s.style.height = sz + "px";
      s.style.left = Math.random() * 100 + "%"; s.style.top = Math.random() * 100 + "%";
      s.style.opacity = (Math.random() * 0.5 + 0.2).toFixed(2);
      starWrap.appendChild(s);
    }
    root.appendChild(starWrap);

    loadAll().then(function () { renderContent(); }).catch(function (e) {
      console.error(e);
      var body = qs(".dms-body", root);
      if (body) body.innerHTML = "";
      body.appendChild(el("div", { class: "dms-wrap" }, [el("div", { class: "dms-card" }, [el("div", { class: "dms-empty" }, ["\u52a0\u8f7d\u5931\u8d25: " + (e && e.message || e)])])]));
    });
  }

  /* ============================================================
   *  注册
   * ============================================================ */
  window.RochePlugin.register({
    id: "daily-memory-summary",
    name: "\u6bcf\u65e5\u8bb0\u5fc6\u603b\u7ed3",
    version: "1.1.0",
    apps: [
      {
        id: "daily-memory-summary-home",
        name: "\u6bcf\u65e5\u8bb0\u5fc6\u603b\u7ed3",
        icon: "auto_stories",
        iconImage: "",
        mount: function (container, roche) {
          ensureStyle(); // 插入 document.head，不受 replaceChildren 影响
          var root = document.createElement("div");
          root.className = ROOT_CLASS;
          getSettings(roche).then(function (settings) {
            renderApp(roche, root, settings);
            container.appendChild(root);
            container._dms_root = root;
          });
        },
        unmount: function (container, roche) {
          var root = container._dms_root;
          if (root && root.parentNode) root.parentNode.removeChild(root);
          removeStyle();
          container.replaceChildren();
          delete container._dms_root;
        }
      }
    ]
  });
})();

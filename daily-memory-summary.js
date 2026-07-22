/*
 * 手账日记 (daily-memory-summary) v2.0.0
 * 手账本风格的每日日记 — char与user交换日记，互相批注涂鸦。
 * 风格：暖色纸张手账本 + 手写字体 + 和纸胶带装饰。
 */
(function () {
  "use strict";

  var ROOT_CLASS = "roche-plugin-dms";
  var STYLE_ID = ROOT_CLASS + "-style";
  var STORAGE_SETTINGS = "dms-settings";
  var STORAGE_DIARIES = "dms-diaries";

  /* ---------- 默认设置 ---------- */
  var DEFAULT_SETTINGS = {
    showFacts: false,
    showCore: false,
    useWorldbook: false,
    worldbookCategories: [],
    worldbookEntries: [],
    charThinkingChain: [
      "从现在起，你是 {{char}}。请严格依据之前的角色扮演对话内容，以 {{char}} 的第一人称写下这段剧情的私人记录。你必须严格遵守以下所有要求：",
      "",
      "1. 第一人称与口吻",
      "   - 完全使用“我”来叙述，仿佛 {{char}} 在亲自回忆、写日记、对自己嘟囔，或向某个无比信任的人倾诉。",
      "   - 语气、用词、句式和思考回路必须100%贴合 {{char}} 的人设。允许甚至鼓励口语化，包括口癖、倒装、碎碎念、突然的情绪爆发或欲言又止，怎么真就怎么来。",
      "",
      "2. 剧情时间（非现实时间）",
      "   - 在记录的开头或合适的显眼位置，务必写明当前所处的【时间】。写明这是谁的日记，什么时间，今天的情感变化。",
      "   - 需要出现至少一次任何现实时间（如2026年、具体日期钟点等），不能只使用剧情内部的时间坐标。",
      "",
      "3. 发生了什么（事件全貌）",
      "   - 把这段时间内发生的所有关键事情都记下来：重要的对话、做出的决定、地点转换、新人物登场、冲突、意外、离别、收获或失去。",
      "   - 按照剧情推进的方向或记忆深刻的顺序来整理，事件必须完整不要自己捏造。",
      "",
      "4. 心情如何（内心实录）",
      "   - 必须真诚地袒露 {{char}} 在每一件要紧事发生当时的真实情绪，以及事后回味起来的心情。",
      "   - 感受要随着事件变化而流动，有人设该有的深度，不装、不端、不矫情，允许自相矛盾和反复。",
      "",
      "5. 格式与氛围",
      "   - 直接以 {{char}} 的独白或日记形式开始，不要写“总结：”“剧情梗概：”这类标题。",
      "   - 整体读起来就像一段活生生的角色内心独白或回忆，保留情绪和悬念，别写成客观报告。",
      "",
      "其他要求：",
      "- 称呼user时，可以用ta",
      "- 在日记结尾，原样保留那些有趣或值得记下的、有情感价值的对话。提到了具体的歌名或作品的名字，也必须原样保留。",
      "- 必须自检是否捏造了不存在的互动。再次自检是否忽略了有趣的互动。",
      "- 不可捏造互动，不可省略互动，不可提及输赢，恋爱没有输赢。",
      "- 字数限定在800字左右，聊天记录不在字数限定范围。",
      "- 必须在生成日记前进行思考，哪些对话是char发的，哪些对话是user发的，以事件、话题与情感来记录。"
    ].join("\n"),
    charFormat: "请直接以 {{char}} 的第一人称写日记，不需要固定格式模板。按照思维链中的要求，写出一段800字左右的私人记录。",
    userThinkingChain: [
      "从现在起，你是 {{user}}。请依据之前的对话内容，以 {{user}} 的第一人称写下这段剧情的私人记录。",
      "",
      "1. 第一人称：完全使用“我”来叙述，语气贴合 {{user}} 的人设。",
      "2. 剧情时间：开头写明【时间】，需要出现至少一次现实时间。",
      "3. 事件全貌：记录关键事件，不捏造，不遗漏。",
      "4. 内心实录：真诚袒露真实情绪，允许自相矛盾。",
      "5. 格式：直接以独白/日记形式开始，保留情绪和悬念。",
      "",
      "称呼对方时可以用ta。结尾可保留有情感价值的对话原句。",
      "字数800字左右，聊天记录不计入字数。"
    ].join("\n"),
    userFormat: "请直接以 {{user}} 的第一人称写日记，不需要固定格式模板。写出一段800字左右的私人记录。",
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
        if (k === "value" || k === "disabled" || k === "checked" || k === "selected" || k === "innerText") {
          node[k] = v; continue;
        }
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

  function escapeHtml(text) {
    var div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }

  function pad2(n) { return String(n).padStart(2, "0"); }
  function startOfDay(d) { var x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
  function endOfDay(d) { return startOfDay(d).getTime() + 86400000; }
  function toDateKey(d) {
    var x = new Date(d);
    return x.getFullYear() + "-" + pad2(x.getMonth() + 1) + "-" + pad2(x.getDate());
  }
  function fmtTime(ms) { var x = new Date(ms); return pad2(x.getHours()) + ":" + pad2(x.getMinutes()); }
  function toDateInput(d) { var x = new Date(d); return x.getFullYear() + "-" + pad2(x.getMonth() + 1) + "-" + pad2(x.getDate()); }
  function parseDateInput(v) { var p = v.split("-").map(Number); return new Date(p[0], p[1] - 1, p[2]); }
  function toMs(ts) { var n = Number(ts); if (!n) return Date.now(); return n < 1e12 ? n * 1000 : n; }

  /* ---------- 数据加载 ---------- */
  function loadConversations(roche) { return roche.conversation.list().catch(function () { return []; }); }
  function loadActiveUser(roche) { return roche.persona.getActiveUserPersona().catch(function () { return null; }); }
  function loadChar(roche, id) { return roche.character.get(id).catch(function () { return null; }); }
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
  function coreToText(core) { return core ? (core.summary || core.summaryText || core.text || "") : ""; }

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

  /* ---------- AI 消息构建 ---------- */
  function fillTemplate(tpl, ctx) {
    return (tpl || "")
      .replace(/\{\{char\}\}/g, ctx.charName || "{{char}}")
      .replace(/\{\{user\}\}/g, ctx.userName || "{{user}}")
      .replace(/\{date\}/g, ctx.dateKey || "")
      .replace(/\{conversation\}/g, ctx.charName || "");
  }

  function buildCharDiaryMessages(ctx, settings) {
    var sys = [];
    sys.push("\u4f60\u662f\u4e00\u540d\u8bb0\u5fc6\u6574\u7406\u52a9\u624b\u3002\u4f60\u7684\u4efb\u52a1\u662f\u6839\u636e\u804a\u5929\u8bb0\u5f55\u751f\u6210\u4e00\u7bc7\u89d2\u8272\u65e5\u8bb0\u3002");
    if (ctx.userPersona) sys.push("\u3010\u7528\u6237\u4eba\u8bbe\u3011" + ctx.userName + "\n" + ctx.userPersona);
    if (ctx.charText) sys.push("\u3010\u89d2\u8272\u4eba\u8bbe\u3011" + ctx.charName + "\n" + ctx.charText);
    if (ctx.wbText) sys.push("\u3010\u4e16\u754c\u4e66\u3011\n" + ctx.wbText);
    if (ctx.coreText) sys.push("\u3010\u5df2\u6709\u6838\u5fc3\u8bb0\u5fc6\uff08\u53c2\u8003\uff09\u3011\n" + ctx.coreText);
    if (ctx.factsText) sys.push("\u3010\u5df2\u6709\u4e8b\u5b9e\u8bb0\u5fc6\uff08\u53c2\u8003\uff09\u3011\n" + ctx.factsText);
    sys.push("\u3010\u5f85\u603b\u7ed3\u65e5\u671f\u3011" + ctx.dateKey);
    sys.push("\u3010\u5f53\u65e5\u804a\u5929\u8bb0\u5f55\u3011\n" + (ctx.shortText || "\uff08\u5f53\u65e5\u65e0\u804a\u5929\u8bb0\u5f55\uff09"));

    var chain = fillTemplate(settings.charThinkingChain, ctx);
    if (chain.trim()) sys.push("\u3010\u601d\u7ef4\u94fe\u3011\n" + chain);

    var fmt = fillTemplate(settings.charFormat, ctx);
    var userMsg = (fmt.trim() ? fmt : "\u8bf7\u76f4\u63a5\u4ee5 {{char}} \u7684\u7b2c\u4e00\u4eba\u5199\u65e5\u8bb0\u3002") +
      "\n\n\u7ea6\u675f\uff1a\u4e0d\u634f\u9020\u7528\u6237\u672a\u8f93\u5165\u7684\u8a00\u884c\uff0c\u4e0d\u62a2\u8bdd\u7528\u6237\uff0c\u8f93\u51fa\u8bed\u8a00\u4e0e\u804a\u5929\u8bb0\u5f55\u4e00\u81f4\u3002";
    return [{ role: "system", content: sys.join("\n\n") }, { role: "user", content: userMsg }];
  }

  function buildUserDiaryMessages(ctx, settings) {
    var sys = [];
    sys.push("\u4f60\u7684\u4efb\u52a1\u662f\u6839\u636e\u804a\u5929\u8bb0\u5f55\u751f\u6210\u4e00\u7bc7\u7528\u6237\u65e5\u8bb0\u3002");
    if (ctx.userPersona) sys.push("\u3010\u7528\u6237\u4eba\u8bbe\u3011" + ctx.userName + "\n" + ctx.userPersona);
    if (ctx.charText) sys.push("\u3010\u5bf9\u65b9\u4eba\u8bbe\u3011" + ctx.charName + "\n" + ctx.charText);
    sys.push("\u3010\u5f53\u65e5\u804a\u5929\u8bb0\u5f55\u3011\n" + (ctx.shortText || "\uff08\u5f53\u65e5\u65e0\u804a\u5929\u8bb0\u5f55\uff09"));

    var chain = fillTemplate(settings.userThinkingChain, ctx);
    if (chain.trim()) sys.push("\u3010\u601d\u7ef4\u94fe\u3011\n" + chain);

    var fmt = fillTemplate(settings.userFormat, ctx);
    var userMsg = (fmt.trim() ? fmt : "\u8bf7\u76f4\u63a5\u4ee5 {{user}} \u7684\u7b2c\u4e00\u4eba\u5199\u65e5\u8bb0\u3002") +
      "\n\n\u7ea6\u675f\uff1a\u4e0d\u634f\u9020\u672a\u53d1\u751f\u7684\u4e8b\uff0c\u4ee5\u771f\u5b9e\u804a\u5929\u5185\u5bb9\u4e3a\u51c6\u3002";
    return [{ role: "system", content: sys.join("\n\n") }, { role: "user", content: userMsg }];
  }

  function buildCharAnnotationMessages(ctx, userDiaryText, settings) {
    var sys = [];
    sys.push("\u4f60\u662f " + (ctx.charName || "\u89d2\u8272") + "\u3002" + (ctx.userName || "\u7528\u6237") + "\u7ed9\u4f60\u770b\u4e86\u4e00\u7bc7TA\u5199\u7684\u65e5\u8bb0\uff0c\u8bf7\u9009\u62e9\u6709\u611f\u7684\u6bb5\u843d\u7559\u4e0b\u4f60\u7684\u60f3\u6cd5\u3002");
    if (ctx.charText) sys.push("\u3010\u4f60\u7684\u4eba\u8bbe\u3011\n" + ctx.charText);
    sys.push("\u3010" + (ctx.userName || "\u7528\u6237") + "\u7684\u65e5\u8bb0\u3011\n" + userDiaryText);
    sys.push("\u8bf7\u4ee5 " + (ctx.charName || "\u89d2\u8272") + "\u7684\u53e3\u543b\uff0c\u9009\u62e91-3\u4e2a\u6bb5\u843d\u8fdb\u884c\u6279\u6ce8\u3002\u4ee5JSON\u6570\u7ec4\u683c\u5f0f\u8f93\u51fa\uff1a");
    sys.push('[{"selectedText":"\u9009\u4e2d\u7684\u539f\u6587","comment":"\u4f60\u7684\u60f3\u6cd5","type":"comment"}]');
    sys.push("\ntype\u53ef\u9009: comment(\u6279\u6ce8) | crossout(\u5212\u6389) | heart(\u8868\u767d)\u3002");
    sys.push("\u8981\u6c42\uff1a\u5b8c\u5168\u8d34\u5408\u89d2\u8272\u4eba\u8bbe\uff0c\u53ef\u4ee5\u662f\u5410\u69fd\u3001\u5173\u5fc3\u3001\u8c03\u4f83\u3001\u8868\u767d\u7b49\u3002selectedText\u5fc5\u987b\u662f\u65e5\u8bb0\u4e2d\u51fa\u73b0\u7684\u539f\u6587\u3002\u4e0d\u8981\u6279\u6ce8\u6574\u6bb5\uff0c\u9009\u62e9\u6709\u611f\u7684\u53e5\u5b50\u3002");
    sys.push("\u53ea\u8f93\u51faJSON\u6570\u7ec4\uff0c\u4e0d\u8981\u8f93\u51fa\u5176\u4ed6\u5185\u5bb9\u3002");
    return [{ role: "system", content: sys.join("\n\n") }, { role: "user", content: "\u8bf7\u6279\u6ce8\u8fd9\u7bc7\u65e5\u8bb0\u3002" }];
  }

  function callAI(roche, messages, temperature) {
    return roche.ai.chat({ messages: messages, temperature: temperature || 0.7 }).then(function (r) {
      var text = r && (r.text || r.content) || "";
      if (Array.isArray(text)) text = text.map(function (c) { return c && c.text || ""; }).join("");
      if (!text && typeof r === "string") text = r;
      return text;
    });
  }

  function generateCharDiary(roche, ctx, settings) {
    return callAI(roche, buildCharDiaryMessages(ctx, settings), 0.7);
  }
  function generateUserDiary(roche, ctx, settings) {
    return callAI(roche, buildUserDiaryMessages(ctx, settings), 0.7);
  }
  function generateCharAnnotations(roche, ctx, userDiaryText, settings) {
    return callAI(roche, buildCharAnnotationMessages(ctx, userDiaryText, settings), 0.8).then(function (text) {
      try {
        var match = text.match(/\[[\s\S]*\]/);
        if (match) return JSON.parse(match[0]);
        return [];
      } catch (e) { return []; }
    });
  }

  /* ---------- 同步到事实记忆（修复版） ---------- */
  function syncFact(roche, ctx, text) {
    var title = "\u6bcf\u65e5\u603b\u7ed3 \u00b7 " + ctx.dateKey;
    return roche.memory.write({
      conversationId: ctx.conversationId,
      summaryText: text,
      who: [ctx.userName, ctx.charName],
      action: text.slice(0, 800),
      when: ctx.dateKey,
      where: ctx.isGroup ? "\u7fa4\u804a" : "\u5355\u804a",
      source: "plugin:daily-memory-summary"
    });
  }

  /* ---------- 设置存储 ---------- */
  function getSettings(roche) {
    return roche.storage.get(STORAGE_SETTINGS).then(function (s) {
      var merged = Object.assign({}, DEFAULT_SETTINGS, s || {});
      return merged;
    }).catch(function () { return Object.assign({}, DEFAULT_SETTINGS); });
  }
  function saveSettings(roche, s) { return roche.storage.set(STORAGE_SETTINGS, s); }

  /* ---------- 日记存储 ---------- */
  function getDiaries(roche) {
    return roche.storage.get(STORAGE_DIARIES).then(function (s) { return s || {}; }).catch(function () { return {}; });
  }
  function getDiary(roche, key) {
    return getDiaries(roche).then(function (all) { return all[key] || null; });
  }
  function saveDiary(roche, key, data) {
    return getDiaries(roche).then(function (all) {
      all[key] = data;
      return roche.storage.set(STORAGE_DIARIES, all);
    });
  }
  function deleteDiary(roche, key) {
    return getDiaries(roche).then(function (all) {
      delete all[key];
      return roche.storage.set(STORAGE_DIARIES, all);
    });
  }

  /* ============================================================
   *  样式 — 手账本风格
   * ============================================================ */
  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = [
      "@import url('https://fonts.googleapis.com/css2?family=Ma+Shan+Zheng&family=Noto+Serif+SC:wght@400;600;700&display=swap');",
      "",
      "/* ===== 手账本主容器 ===== */",
      "." + ROOT_CLASS + "{",
      "  --paper:#FAF3E3; --paper-2:#F5EDD0; --paper-3:#EDE0C8;",
      "  --line:rgba(180,160,110,0.25);",
      "  --ink:#4A3C28; --ink-dim:#7A6A50; --ink-mute:#B0A080;",
      "  --red:#C44536; --blue:#3A6B8A; --green:#7B8F5C; --purple:#8B5E83;",
      "  --tape-pink:rgba(232,160,160,0.65); --tape-blue:rgba(160,196,232,0.65);",
      "  --tape-green:rgba(196,232,160,0.65); --tape-yellow:rgba(232,210,160,0.65);",
      "  --shadow:0 2px 12px rgba(74,60,40,0.12);",
      "  --shadow-strong:0 4px 20px rgba(74,60,40,0.2);",
      "  --radius:6px; --radius-sm:4px;",
      "  position:relative;width:100%;height:100%;display:flex;flex-direction:column;overflow:hidden;",
      "  color:var(--ink);font-family:'Noto Serif SC','Songti SC','STSong',serif;",
      "  background:",
      "    radial-gradient(ellipse at 20% 0%,rgba(232,210,160,0.3),transparent 50%),",
      "    radial-gradient(ellipse at 80% 100%,rgba(232,160,160,0.15),transparent 50%),",
      "    var(--paper);",
      "  padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left);",
      "}",
      "." + ROOT_CLASS + " *{box-sizing:border-box;margin:0;padding:0;}",
      "." + ROOT_CLASS + " .dms-handwritten{font-family:'Ma Shan Zheng','KaiTi','STKaiti',cursive;}",
      "",
      "/* ===== 开场动画 ===== */",
      "." + ROOT_CLASS + " .dms-cover-anim{animation:dms-coverIn .6s ease-out both;}",
      "." + ROOT_CLASS + " .dms-page-anim{animation:dms-pageIn .5s ease-out .3s both;}",
      "." + ROOT_CLASS + " .dms-fade-in{animation:dms-fadeIn .4s ease-out both;}",
      "." + ROOT_CLASS + " .dms-fade-in-delay{animation:dms-fadeIn .4s ease-out .2s both;}",
      "@keyframes dms-coverIn{from{opacity:0;transform:scale(0.92) translateY(10px);}to{opacity:1;transform:scale(1) translateY(0);}}",
      "@keyframes dms-pageIn{from{opacity:0;transform:translateY(15px);}to{opacity:1;transform:translateY(0);}}",
      "@keyframes dms-fadeIn{from{opacity:0;}to{opacity:1;}}",
      "@keyframes dms-pulse{0%,100%{opacity:0.6;}50%{opacity:1;}}",
      "@keyframes dms-spin{to{transform:rotate(360deg);}}",
      "",
      "/* ===== 顶栏 ===== */",
      "." + ROOT_CLASS + " .dms-top{",
      "  flex-shrink:0;display:flex;align-items:center;gap:10px;padding:14px 18px;",
      "  background:linear-gradient(180deg,rgba(250,243,227,0.95),rgba(245,237,208,0.7));",
      "  backdrop-filter:blur(12px);border-bottom:1px solid var(--line);z-index:20;",
      "}",
      "." + ROOT_CLASS + " .dms-top h1{",
      "  font-size:18px;font-weight:600;color:var(--ink);letter-spacing:1px;",
      "  font-family:'Ma Shan Zheng','KaiTi',cursive;",
      "}",
      "." + ROOT_CLASS + " .dms-top .dms-sub{font-size:11px;color:var(--ink-mute);margin-top:1px;}",
      "." + ROOT_CLASS + " .dms-top .dms-spacer{flex:1;}",
      "." + ROOT_CLASS + " .dms-close{",
      "  width:30px;height:30px;border-radius:50%;flex-shrink:0;cursor:pointer;",
      "  background:var(--paper-2);border:1px solid var(--line);color:var(--ink-dim);",
      "  font-size:16px;display:flex;align-items:center;justify-content:center;transition:all .15s ease;",
      "}",
      "." + ROOT_CLASS + " .dms-close:hover{background:var(--paper-3);color:var(--red);}",
      "",
      "/* ===== 按钮 ===== */",
      "." + ROOT_CLASS + " .dms-btn{",
      "  appearance:none;cursor:pointer;font-family:inherit;",
      "  background:var(--paper-2);color:var(--ink);border:1px solid var(--line);",
      "  padding:8px 16px;border-radius:var(--radius-sm);font-size:13px;",
      "  transition:all .2s ease;display:inline-flex;align-items:center;gap:6px;",
      "  box-shadow:0 1px 3px rgba(74,60,40,0.08);",
      "}",
      "." + ROOT_CLASS + " .dms-btn:hover{background:var(--paper-3);box-shadow:0 2px 6px rgba(74,60,40,0.15);}",
      "." + ROOT_CLASS + " .dms-btn:disabled{opacity:.5;cursor:not-allowed;}",
      "." + ROOT_CLASS + " .dms-btn-primary{",
      "  background:linear-gradient(135deg,var(--red),#E06050);color:#FAF3E3;border-color:transparent;font-weight:600;",
      "  box-shadow:0 2px 8px rgba(196,69,54,0.3);",
      "}",
      "." + ROOT_CLASS + " .dms-btn-primary:hover{filter:brightness(1.08);box-shadow:0 3px 12px rgba(196,69,54,0.4);}",
      "." + ROOT_CLASS + " .dms-btn-ghost{background:transparent;border-color:transparent;color:var(--ink-dim);box-shadow:none;}",
      "." + ROOT_CLASS + " .dms-btn-ghost:hover{background:var(--paper-2);}",
      "." + ROOT_CLASS + " .dms-btn-sm{padding:5px 10px;font-size:12px;}",
      "." + ROOT_CLASS + " .dms-btn-icon{",
      "  width:32px;height:32px;padding:0;display:flex;align-items:center;justify-content:center;",
      "  border-radius:50%;font-size:15px;",
      "}",
      "",
      "/* ===== 内容区 ===== */",
      "." + ROOT_CLASS + " .dms-body{flex:1;overflow-y:auto;position:relative;z-index:1;-webkit-overflow-scrolling:touch;}",
      "." + ROOT_CLASS + " .dms-wrap{padding:16px 14px 24px;max-width:900px;margin:0 auto;}",
      "",
      "/* ===== 手账卡片 ===== */",
      "." + ROOT_CLASS + " .dms-card{",
      "  position:relative;background:var(--paper);border:1px solid var(--line);",
      "  border-radius:var(--radius);padding:18px 16px;margin-bottom:16px;",
      "  box-shadow:var(--shadow);",
      "}",
      "." + ROOT_CLASS + " .dms-card::before{",
      "  content:'';position:absolute;top:-6px;left:24px;width:52px;height:14px;",
      "  background:var(--tape-pink);transform:rotate(-2deg);opacity:0.8;border-radius:1px;",
      "  box-shadow:0 1px 2px rgba(0,0,0,0.06);",
      "}",
      "." + ROOT_CLASS + " .dms-card.tape-blue::before{background:var(--tape-blue);}",
      "." + ROOT_CLASS + " .dms-card.tape-green::before{background:var(--tape-green);}",
      "." + ROOT_CLASS + " .dms-card.tape-yellow::before{background:var(--tape-yellow);}",
      "." + ROOT_CLASS + " .dms-card h2{font-size:15px;font-weight:600;color:var(--ink);margin-bottom:6px;display:flex;align-items:center;gap:8px;}",
      "." + ROOT_CLASS + " .dms-card-sub{font-size:11px;color:var(--ink-mute);margin-bottom:12px;}",
      "." + ROOT_CLASS + " .dms-badge{",
      "  display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;",
      "  border-radius:50%;background:var(--red);color:#FAF3E3;font-size:11px;font-weight:700;flex-shrink:0;",
      "}",
      "",
      "/* ===== 会话列表 ===== */",
      "." + ROOT_CLASS + " .dms-conv-list{display:flex;flex-direction:column;gap:8px;}",
      "." + ROOT_CLASS + " .dms-conv-item{",
      "  display:flex;align-items:center;gap:10px;padding:10px 12px;cursor:pointer;",
      "  background:var(--paper-2);border:1px solid var(--line);border-radius:var(--radius-sm);transition:all .15s ease;",
      "}",
      "." + ROOT_CLASS + " .dms-conv-item:hover{background:var(--paper-3);}",
      "." + ROOT_CLASS + " .dms-conv-item.active{",
      "  border-color:var(--red);background:rgba(196,69,54,0.06);",
      "  box-shadow:0 2px 8px rgba(196,69,54,0.1);",
      "}",
      "." + ROOT_CLASS + " .dms-avatar{",
      "  width:34px;height:34px;border-radius:50%;flex-shrink:0;overflow:hidden;",
      "  background:linear-gradient(135deg,var(--tape-pink),var(--tape-blue));",
      "  display:flex;align-items:center;justify-content:center;color:var(--ink);font-weight:600;font-size:14px;",
      "}",
      "." + ROOT_CLASS + " .dms-avatar img{width:100%;height:100%;object-fit:cover;}",
      "." + ROOT_CLASS + " .dms-conv-info{flex:1;min-width:0;}",
      "." + ROOT_CLASS + " .dms-conv-name{font-size:13px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}",
      "." + ROOT_CLASS + " .dms-conv-meta{font-size:10px;color:var(--ink-mute);margin-top:2px;}",
      "." + ROOT_CLASS + " .dms-tag{",
      "  font-size:10px;padding:2px 8px;border-radius:10px;flex-shrink:0;",
      "  background:rgba(196,69,54,0.12);color:var(--red);border:1px solid rgba(196,69,54,0.25);",
      "}",
      "." + ROOT_CLASS + " .dms-tag.group{background:rgba(58,107,138,0.12);color:var(--blue);border-color:rgba(58,107,138,0.25);}",
      "." + ROOT_CLASS + " .dms-check{",
      "  width:18px;height:18px;border-radius:5px;border:1.5px solid var(--ink-mute);flex-shrink:0;",
      "  display:flex;align-items:center;justify-content:center;transition:all .15s ease;",
      "}",
      "." + ROOT_CLASS + " .dms-conv-item.active .dms-check{background:var(--red);border-color:transparent;}",
      "." + ROOT_CLASS + " .dms-conv-item.active .dms-check::after{",
      "  content:'';width:5px;height:9px;border:solid #FAF3E3;border-width:0 2px 2px 0;transform:rotate(45deg) translate(-1px,-1px);",
      "}",
      "",
      "/* ===== 日期选择 ===== */",
      "." + ROOT_CLASS + " .dms-date-row{display:flex;gap:10px;align-items:center;flex-wrap:wrap;}",
      "." + ROOT_CLASS + " .dms-input{",
      "  padding:8px 12px;border-radius:var(--radius-sm);background:var(--paper-2);",
      "  border:1px solid var(--line);color:var(--ink);font-size:13px;font-family:inherit;outline:none;",
      "}",
      "." + ROOT_CLASS + " .dms-input:focus{border-color:var(--red);}",
      "." + ROOT_CLASS + " .dms-textarea{",
      "  width:100%;padding:10px 12px;border-radius:var(--radius-sm);resize:vertical;min-height:80px;",
      "  background:var(--paper-2);border:1px solid var(--line);color:var(--ink);font-size:13px;",
      "  font-family:inherit;outline:none;line-height:1.6;",
      "}",
      "." + ROOT_CLASS + " .dms-textarea:focus{border-color:var(--red);}",
      "." + ROOT_CLASS + " .dms-textarea.tall{min-height:120px;}",
      "." + ROOT_CLASS + " .dms-pill{",
      "  font-size:10px;padding:3px 8px;border-radius:10px;cursor:pointer;",
      "  background:var(--paper-2);border:1px solid var(--line);color:var(--ink-dim);transition:all .15s ease;",
      "}",
      "." + ROOT_CLASS + " .dms-pill:hover{background:var(--paper-3);color:var(--red);}",
      "." + ROOT_CLASS + " .dms-empty{text-align:center;padding:20px 12px;color:var(--ink-mute);font-size:13px;}",
      "",
      "/* ===== 开关 ===== */",
      "." + ROOT_CLASS + " .dms-row{display:flex;align-items:center;gap:12px;margin-bottom:10px;}",
      "." + ROOT_CLASS + " .dms-row:last-child{margin-bottom:0;}",
      "." + ROOT_CLASS + " .dms-label{font-size:13px;color:var(--ink);}",
      "." + ROOT_CLASS + " .dms-hint{font-size:11px;color:var(--ink-mute);margin-top:2px;}",
      "." + ROOT_CLASS + " .dms-switch{",
      "  position:relative;width:40px;height:22px;border-radius:11px;flex-shrink:0;cursor:pointer;",
      "  background:var(--paper-3);border:1px solid var(--line);transition:all .2s ease;",
      "}",
      "." + ROOT_CLASS + " .dms-switch::after{",
      "  content:'';position:absolute;top:2px;left:2px;width:16px;height:16px;border-radius:50%;",
      "  background:var(--paper);box-shadow:0 1px 3px rgba(0,0,0,0.15);transition:all .2s ease;",
      "}",
      "." + ROOT_CLASS + " .dms-switch.on{background:var(--red);border-color:transparent;}",
      "." + ROOT_CLASS + " .dms-switch.on::after{left:21px;background:#FAF3E3;}",
      "",
      "/* ===== 底栏 ===== */",
      "." + ROOT_CLASS + " .dms-footer{",
      "  flex-shrink:0;z-index:30;display:flex;gap:10px;align-items:center;justify-content:space-between;",
      "  padding:10px 16px calc(10px + env(safe-area-inset-bottom));",
      "  background:linear-gradient(0deg,rgba(250,243,227,0.95),rgba(245,237,208,0.6));",
      "  backdrop-filter:blur(12px);border-top:1px solid var(--line);",
      "}",
      "." + ROOT_CLASS + " .dms-foot-left{font-size:11px;color:var(--ink-mute);}",
      "",
      "/* ===== Toast ===== */",
      "." + ROOT_CLASS + " .dms-toast{",
      "  position:fixed;left:50%;bottom:calc(60px + env(safe-area-inset-bottom));",
      "  transform:translateX(-50%);z-index:999;",
      "  background:var(--paper);border:1px solid var(--line);color:var(--ink);",
      "  padding:10px 18px;border-radius:20px;box-shadow:var(--shadow-strong);",
      "  font-size:13px;opacity:0;pointer-events:none;transition:opacity .2s ease,transform .2s ease;",
      "}",
      "." + ROOT_CLASS + " .dms-toast.show{opacity:1;transform:translateX(-50%) translateY(-4px);}",
      "." + ROOT_CLASS + " .dms-loading{",
      "  display:inline-block;width:14px;height:14px;border-radius:50%;",
      "  border:2px solid var(--paper-3);border-top-color:var(--red);",
      "  animation:dms-spin 0.8s linear infinite;vertical-align:middle;margin-right:6px;",
      "}",
      "",
      "/* ===== 日记页面 ===== */",
      "." + ROOT_CLASS + " .dms-diary-spread{display:flex;flex-direction:column;gap:16px;}",
      "  @media(min-width:768px){",
      "  ." + ROOT_CLASS + " .dms-diary-spread{flex-direction:row;}",
      "  }",
      "." + ROOT_CLASS + " .dms-diary-page{",
      "  position:relative;flex:1;min-width:0;background:var(--paper);",
      "  border:1px solid var(--line);border-radius:var(--radius);",
      "  box-shadow:var(--shadow);overflow:hidden;",
      "}",
      "." + ROOT_CLASS + " .dms-diary-page::before{",
      "  content:'';position:absolute;top:0;left:0;right:0;bottom:0;pointer-events:none;z-index:0;",
      "  background-image:linear-gradient(to bottom,transparent 0px,transparent 31px,rgba(180,160,110,0.15) 31px,rgba(180,160,110,0.15) 32px,transparent 32px);",
      "  background-size:100% 32px;",
      "}",
      "." + ROOT_CLASS + " .dms-page-header{",
      "  position:relative;z-index:2;padding:14px 16px 8px;border-bottom:1px dashed var(--line);",
      "  display:flex;align-items:center;justify-content:space-between;gap:8px;",
      "}",
      "." + ROOT_CLASS + " .dms-page-title{font-size:14px;font-weight:600;color:var(--ink);font-family:'Ma Shan Zheng','KaiTi',cursive;}",
      "." + ROOT_CLASS + " .dms-page-meta{font-size:10px;color:var(--ink-mute);}",
      "." + ROOT_CLASS + " .dms-page-body{position:relative;z-index:1;padding:14px 16px;min-height:200px;}",
      "." + ROOT_CLASS + " .dms-diary-text{",
      "  font-size:14px;line-height:32px;color:var(--ink);white-space:pre-wrap;word-break:break-word;",
      "  position:relative;",
      "}",
      "",
      "/* ===== 批注样式 ===== */",
      "." + ROOT_CLASS + " .dms-annot{position:relative;cursor:pointer;}",
      "." + ROOT_CLASS + " .dms-annot-comment{",
      "  border-bottom:1.5px dashed var(--blue);background:rgba(58,107,138,0.06);",
      "}",
      "." + ROOT_CLASS + " .dms-annot-comment:hover{background:rgba(58,107,138,0.12);}",
      "." + ROOT_CLASS + " .dms-annot-crossout{",
      "  text-decoration:line-through;text-decoration-color:var(--red);text-decoration-thickness:1.5px;",
      "  background:rgba(196,69,54,0.04);",
      "}",
      "." + ROOT_CLASS + " .dms-annot-heart{",
      "  color:var(--red);font-weight:600;background:rgba(196,69,54,0.08);",
      "  border-bottom:1px solid var(--red);",
      "}",
      "." + ROOT_CLASS + " .dms-annot-tooltip{",
      "  position:absolute;bottom:100%;left:50%;transform:translateX(-50%) translateY(-4px);",
      "  background:var(--paper);border:1px solid var(--line);border-radius:var(--radius-sm);",
      "  padding:8px 12px;font-size:12px;color:var(--ink);white-space:nowrap;max-width:240px;",
      "  box-shadow:var(--shadow-strong);z-index:100;opacity:0;pointer-events:none;transition:opacity .15s ease;",
      "  line-height:1.5;white-space:normal;width:max-content;max-width:200px;",
      "}",
      "." + ROOT_CLASS + " .dms-annot:hover .dms-annot-tooltip{opacity:1;}",
      "." + ROOT_CLASS + " .dms-annot::after{",
      "  content:attr(data-marker);font-size:9px;color:var(--red);vertical-align:super;margin-left:2px;",
      "}",
      "",
      "/* ===== 便签 ===== */",
      "." + ROOT_CLASS + " .dms-sticky{",
      "  position:absolute;z-index:5;max-width:180px;min-width:80px;padding:10px 12px;font-size:12px;",
      "  color:var(--ink);box-shadow:2px 3px 8px rgba(74,60,40,0.2);",
      "  border-radius:2px;cursor:move;line-height:1.5;",
      "  transform:rotate(-1deg);font-family:'Ma Shan Zheng','KaiTi',cursive;",
      "}",
      "." + ROOT_CLASS + " .dms-sticky-remove{",
      "  position:absolute;top:-6px;right:-6px;width:16px;height:16px;border-radius:50%;",
      "  background:var(--red);color:#FAF3E3;font-size:10px;display:flex;align-items:center;justify-content:center;",
      "  cursor:pointer;border:none;",
      "}",
      "",
      "/* ===== 涂鸦画布 ===== */",
      "." + ROOT_CLASS + " .dms-doodle-canvas{",
      "  position:absolute;top:0;left:0;width:100%;height:100%;z-index:4;pointer-events:none;",
      "}",
      "." + ROOT_CLASS + " .dms-doodle-canvas.active{pointer-events:auto;cursor:crosshair;}",
      "",
      "/* ===== 工具栏 ===== */",
      "." + ROOT_CLASS + " .dms-toolbar{",
      "  display:flex;gap:6px;align-items:center;flex-wrap:wrap;padding:8px 10px;",
      "  background:var(--paper-2);border-bottom:1px solid var(--line);",
      "}",
      "." + ROOT_CLASS + " .dms-tool-btn{",
      "  padding:5px 10px;font-size:12px;border-radius:var(--radius-sm);cursor:pointer;",
      "  background:var(--paper);border:1px solid var(--line);color:var(--ink-dim);transition:all .15s ease;",
      "}",
      "." + ROOT_CLASS + " .dms-tool-btn:hover{background:var(--paper-3);}",
      "." + ROOT_CLASS + " .dms-tool-btn.active{background:var(--red);color:#FAF3E3;border-color:transparent;}",
      "." + ROOT_CLASS + " .dms-color-dot{",
      "  width:20px;height:20px;border-radius:50%;cursor:pointer;border:2px solid transparent;",
      "  display:inline-block;transition:all .15s ease;",
      "}",
      "." + ROOT_CLASS + " .dms-color-dot.active{border-color:var(--ink);transform:scale(1.15);}",
      "",
      "/* ===== 批注弹出菜单 ===== */",
      "." + ROOT_CLASS + " .dms-annot-menu{",
      "  position:fixed;z-index:200;background:var(--paper);border:1px solid var(--line);",
      "  border-radius:var(--radius);box-shadow:var(--shadow-strong);padding:8px;",
      "  display:flex;gap:4px;align-items:center;flex-wrap:wrap;",
      "}",
      "." + ROOT_CLASS + " .dms-annot-menu .dms-tool-btn{font-size:12px;padding:6px 10px;}",
      "." + ROOT_CLASS + " .dms-annot-input{",
      "  width:100%;margin-top:6px;padding:6px 8px;font-size:12px;font-family:inherit;",
      "  border:1px solid var(--line);border-radius:var(--radius-sm);background:var(--paper-2);color:var(--ink);outline:none;",
      "  resize:vertical;min-height:50px;",
      "}",
      "." + ROOT_CLASS + " .dms-annot-input:focus{border-color:var(--red);}",
      "",
      "/* ===== 设置面板 ===== */",
      "." + ROOT_CLASS + " .dms-settings-panel{",
      "  position:fixed;top:0;right:-100%;width:340px;max-width:85%;height:100%;z-index:300;",
      "  background:var(--paper);box-shadow:var(--shadow-strong);",
      "  transition:right .3s ease;display:flex;flex-direction:column;overflow:hidden;",
      "}",
      "." + ROOT_CLASS + " .dms-settings-panel.open{right:0;}",
      "." + ROOT_CLASS + " .dms-settings-header{",
      "  padding:14px 16px;border-bottom:1px solid var(--line);display:flex;align-items:center;justify-content:space-between;",
      "  background:var(--paper-2);",
      "}",
      "." + ROOT_CLASS + " .dms-settings-body{flex:1;overflow-y:auto;padding:16px;}",
      "." + ROOT_CLASS + " .dms-settings-overlay{",
      "  position:fixed;inset:0;z-index:250;background:rgba(74,60,40,0.2);opacity:0;pointer-events:none;transition:opacity .3s ease;",
      "}",
      "." + ROOT_CLASS + " .dms-settings-overlay.open{opacity:1;pointer-events:auto;}",
      "." + ROOT_CLASS + " .dms-settings-section{margin-bottom:18px;}",
      "." + ROOT_CLASS + " .dms-settings-section h3{font-size:13px;font-weight:600;color:var(--ink);margin-bottom:8px;}",
      "." + ROOT_CLASS + " .dms-warn-box{",
      "  font-size:11px;padding:8px 12px;border-radius:var(--radius-sm);margin-top:8px;",
      "  background:rgba(196,69,54,0.06);border:1px solid rgba(196,69,54,0.2);color:var(--red);",
      "}",
      "",
      "/* ===== 世界书选择器 ===== */",
      "." + ROOT_CLASS + " .dms-wb-tree{max-height:200px;overflow:auto;margin-top:8px;}",
      "." + ROOT_CLASS + " .dms-wb-cat{padding:8px 10px;background:var(--paper-2);border:1px solid var(--line);border-radius:var(--radius-sm);margin-bottom:6px;cursor:pointer;}",
      "." + ROOT_CLASS + " .dms-wb-cat.active{border-color:var(--red);background:rgba(196,69,54,0.06);}",
      "." + ROOT_CLASS + " .dms-wb-cat-head{display:flex;align-items:center;gap:8px;}",
      "." + ROOT_CLASS + " .dms-wb-name{font-size:13px;flex:1;}",
      "." + ROOT_CLASS + " .dms-wb-entries{margin-top:6px;padding-left:20px;display:flex;flex-direction:column;gap:4px;}",
      "." + ROOT_CLASS + " .dms-wb-entry{font-size:12px;padding:5px 8px;border-radius:6px;cursor:pointer;background:var(--paper);border:1px solid transparent;}",
      "." + ROOT_CLASS + " .dms-wb-entry.active{border-color:var(--blue);background:rgba(58,107,138,0.08);}",
      "",
      "/* ===== 历史记录 ===== */",
      "." + ROOT_CLASS + " .dms-hist{padding:10px 12px;background:var(--paper-2);border:1px solid var(--line);border-radius:var(--radius-sm);margin-bottom:8px;cursor:pointer;transition:all .15s ease;}",
      "." + ROOT_CLASS + " .dms-hist:hover{background:var(--paper-3);}",
      "." + ROOT_CLASS + " .dms-hist-head{display:flex;justify-content:space-between;gap:8px;margin-bottom:4px;}",
      "." + ROOT_CLASS + " .dms-hist-title{font-size:13px;font-weight:500;}",
      "." + ROOT_CLASS + " .dms-hist-date{font-size:11px;color:var(--ink-mute);}",
      "." + ROOT_CLASS + " .dms-hist-snippet{font-size:12px;color:var(--ink-dim);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}",
      "",
      "/* ===== 用户日记编辑区 ===== */",
      "." + ROOT_CLASS + " .dms-user-diary-edit{",
      "  width:100%;min-height:280px;padding:12px;font-size:14px;line-height:32px;",
      "  background:transparent;border:none;outline:none;resize:none;color:var(--ink);",
      "  font-family:'Noto Serif SC','Songti SC',serif;",
      "}",
      "." + ROOT_CLASS + " .dms-user-diary-edit::placeholder{color:var(--ink-mute);font-style:italic;}",
      "",
      "/* ===== 装饰小元素 ===== */",
      "." + ROOT_CLASS + " .dms-deco-star{position:absolute;color:var(--tape-yellow);font-size:14px;opacity:0.6;pointer-events:none;}",
      "." + ROOT_CLASS + " .dms-divider{text-align:center;color:var(--ink-mute);font-size:12px;margin:10px 0;letter-spacing:4px;}"
    ].join("\n");
    document.head.appendChild(style);
  }

  function removeStyle() {
    var s = document.getElementById(STYLE_ID);
    if (s) s.remove();
  }

  /* ============================================================
   *  主渲染
   * ============================================================ */
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
      view: "cover",         // "cover" | "diary" | "history"
      currentDiary: null,
      diaryKey: "",
      doodleMode: false,
      doodleColor: "#C44536",
      doodleTool: "pen",
      annotMenuEl: null,
      settingsOpen: false
    };

    function toast(msg) {
      var t = qs(".dms-toast", root);
      if (!t) { t = el("div", { class: "dms-toast" }); root.appendChild(t); }
      t.textContent = msg;
      t.classList.add("show");
      clearTimeout(t._t);
      t._t = setTimeout(function () { t.classList.remove("show"); }, 2000);
    }

    /* ---------- 顶栏 ---------- */
    function buildTop() {
      var titleText = state.view === "diary" ? "\u624b\u8d26\u65e5\u8bb0" : "\u624b\u8d26\u65e5\u8bb0";
      var subTitle = state.selectedConv
        ? convInfo(state.selectedConv).name + " \u00b7 " + toDateKey(state.selectedDate)
        : "\u4ea4\u6362\u65e5\u8bb0 \u00b7 \u4e92\u76f8\u6279\u6ce8";
      return el("div", { class: "dms-top" }, [
        el("button", { class: "dms-close", onclick: function () {
          if (state.view !== "cover") { state.view = "cover"; renderContent(); }
          else roche.ui.closeApp();
        } }, [state.view !== "cover" ? "\u2039" : "\u00d7"]),
        el("div", { style: { flex: "1" } }, [
          el("h1", {}, [titleText]),
          el("div", { class: "dms-sub" }, [subTitle])
        ]),
        el("button", {
          class: "dms-btn dms-btn-ghost dms-btn-icon",
          title: "\u8bbe\u7f6e",
          onclick: function () { toggleSettings(true); }
        }, ["\u2699"])
      ]);
    }

    /* ---------- 底栏 ---------- */
    function buildFooter() {
      var leftText = state.selectedConv
        ? convInfo(state.selectedConv).name + " \u00b7 " + toDateKey(state.selectedDate)
        : "\u672a\u9009\u62e9\u4f1a\u8bdd";
      var rightBtns = [];

      if (state.view === "cover") {
        rightBtns.push(el("button", {
          class: "dms-btn dms-btn-primary",
          disabled: !state.selectedConv || state.generating,
          onclick: function () { onOpenDiary(); }
        }, [state.generating ? [el("span", { class: "dms-loading" }), "\u5199\u4e2d\u2026"] : "\u7ffb\u5f00\u8fd9\u4e00\u9875"]));
      } else if (state.view === "diary") {
        rightBtns.push(el("button", { class: "dms-btn dms-btn-sm", onclick: function () { state.view = "cover"; renderContent(); } }, ["\u5c01\u9762"]));
        rightBtns.push(el("button", {
          class: "dms-btn dms-btn-primary dms-btn-sm",
          disabled: state.generating,
          onclick: function () { onOpenDiary(); }
        }, [state.generating ? "\u5199\u4e2d\u2026" : "\u91cd\u5199"]));
      } else if (state.view === "history") {
        rightBtns.push(el("button", { class: "dms-btn dms-btn-sm", onclick: function () { state.view = "cover"; renderContent(); } }, ["\u8fd4\u56de"]));
      }

      return el("div", { class: "dms-footer" }, [
        el("div", { class: "dms-foot-left" }, [leftText]),
        el("div", { style: { display: "flex", gap: "8px" } }, rightBtns)
      ]);
    }

    /* ---------- 内容渲染 ---------- */
    function renderContent() {
      var body = qs(".dms-body", root);
      if (!body) return;
      body.innerHTML = "";
      if (state.view === "diary") {
        body.appendChild(buildDiaryView());
      } else if (state.view === "history") {
        body.appendChild(buildHistory());
      } else {
        body.appendChild(buildCover());
      }
      var foot = qs(".dms-footer", root);
      if (foot) foot.remove();
      root.appendChild(buildFooter());
      // 重新绑定设置面板
      var sp = qs(".dms-settings-panel", root);
      if (sp) sp.remove();
      var ov = qs(".dms-settings-overlay", root);
      if (ov) ov.remove();
      root.appendChild(buildSettingsPanel());
      root.appendChild(buildSettingsOverlay());
    }

    /* ---------- 封面页 ---------- */
    function buildCover() {
      var wrap = el("div", { class: "dms-wrap dms-cover-anim" });

      // 装饰：手账标题卡
      var heroCard = el("div", { class: "dms-card dms-fade-in", style: { textAlign: "center", padding: "28px 16px" } }, [
        el("div", { class: "dms-handwritten", style: { fontSize: "28px", color: "var(--red)", marginBottom: "6px" } }, ["\u624b\u8d26\u65e5\u8bb0"]),
        el("div", { style: { fontSize: "13px", color: "var(--ink-dim)" } }, ["\u4e0e TA \u4ea4\u6362\u5fc3\u58f0\uff0c\u5728\u5f7c\u6b64\u7684\u65e5\u8bb0\u91cc\u7559\u4e0b\u60f3\u6cd5"]),
        el("div", { class: "dms-divider" }, ["\u2767 \u2767 \u2767"])
      ]);
      wrap.appendChild(heroCard);

      // 选择会话
      var convCard = el("div", { class: "dms-card dms-fade-in-delay" }, [
        el("h2", {}, [el("span", { class: "dms-badge" }, ["1"]), " \u9009\u62e9\u7b14\u53cb"]),
        el("div", { class: "dms-card-sub" }, ["\u9009\u62e9\u4e00\u4e2a\u4f1a\u8bdd\uff0c\u5f00\u59cb\u4f60\u4eec\u7684\u4ea4\u6362\u65e5\u8bb0\u3002"])
      ]);
      var convList = el("div", { class: "dms-conv-list" });
      if (!state.conversations.length) {
        convList.appendChild(el("div", { class: "dms-empty" }, ["\u6682\u65e0\u4f1a\u8bdd\u3002"]));
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
                c.handle && !info.isGroup ? "@" + c.handle : (c.memberProfiles ? c.memberProfiles.length + " \u4f4d\u6210\u5458" : "\u4f1a\u8bdd")
              ])
            ]),
            el("span", { class: "dms-tag" + (info.isGroup ? " group" : "") }, [info.tag])
          ]));
        });
      }
      convCard.appendChild(convList);
      wrap.appendChild(convCard);

      // 选择日期
      var dateCard = el("div", { class: "dms-card tape-blue dms-fade-in-delay" }, [
        el("h2", {}, [el("span", { class: "dms-badge" }, ["2"]), " \u7ffb\u5230\u54ea\u4e00\u5929"]),
        el("div", { class: "dms-card-sub" }, ["\u6309\u672c\u5730\u65f6\u533a 00:00 ~ \u6b21\u65e5 00:00 \u5207\u5272\u5f53\u5929\u8bb0\u5f55\u3002"])
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
        quick.appendChild(el("span", { style: { fontSize: "11px", color: "var(--ink-mute)", alignSelf: "center" } }, ["\u6709\u8bb0\u5f55\u7684\u65e5\u671f:"]));
        state.coveredDays.slice(0, 8).forEach(function (dk) {
          var pill = el("span", { class: "dms-pill" }, [dk]);
          pill.addEventListener("click", function () {
            state.selectedDate = parseDateInput(dk);
            dateInput.value = dk;
          });
          quick.appendChild(pill);
        });
        dateRow.appendChild(quick);
      }
      dateCard.appendChild(dateRow);
      wrap.appendChild(dateCard);

      // 历史入口
      var histCard = el("div", { class: "dms-card tape-green dms-fade-in-delay", style: { cursor: "pointer" }, onclick: function () {
        state.view = "history"; renderContent();
      } }, [
        el("h2", {}, [el("span", { class: "dms-badge" }, ["\u270e"]), " \u5386\u53f2\u65e5\u8bb0"]),
        el("div", { class: "dms-card-sub" }, ["\u67e5\u770b\u4ee5\u524d\u5199\u8fc7\u7684\u65e5\u8bb0\u3002"])
      ]);
      wrap.appendChild(histCard);

      return wrap;
    }

    /* ---------- 日记视图 ---------- */
    function buildDiaryView() {
      var wrap = el("div", { class: "dms-wrap dms-page-anim" });
      if (!state.currentDiary) {
        wrap.appendChild(el("div", { class: "dms-empty" }, ["\u65e5\u8bb0\u52a0\u8f7d\u4e2d\u2026"]));
        return wrap;
      }

      var diary = state.currentDiary;
      var spread = el("div", { class: "dms-diary-spread" });

      // 左页：TA的日记
      var charPage = el("div", { class: "dms-diary-page" });
      charPage.appendChild(el("div", { class: "dms-page-header" }, [
        el("div", {}, [
          el("div", { class: "dms-page-title" }, [(diary.charName || "TA") + " \u7684\u65e5\u8bb0"]),
          el("div", { class: "dms-page-meta" }, [diary.dateKey])
        ]),
        el("div", { style: { display: "flex", gap: "4px" } }, [
          el("button", { class: "dms-tool-btn" + (state.doodleMode ? " active" : ""), onclick: function () { toggleDoodle(charPage); } }, ["\u6d82\u9e26"]),
          el("button", { class: "dms-tool-btn", onclick: function () { clearDoodles(charPage); } }, ["\u6e05\u9664"]),
          el("button", { class: "dms-tool-btn", onclick: function () { addStickyNote(charPage); } }, ["\u4fbf\u7b7e"])
        ])
      ]));

      // 涂鸦工具栏
      if (state.doodleMode) {
        charPage.appendChild(buildDoodleToolbar());
      }

      var charBody = el("div", { class: "dms-page-body" });
      var charTextEl = el("div", { class: "dms-diary-text", id: "charDiaryText" });
      renderAnnotatedText(charTextEl, diary.charDiary || "", diary.annotations || []);
      charBody.appendChild(charTextEl);

      // 涂鸦画布
      var canvas = el("canvas", { class: "dms-doodle-canvas" + (state.doodleMode ? " active" : "") });
      charBody.appendChild(canvas);

      // 便签层
      (diary.annotations || []).filter(function (a) { return a.type === "sticky"; }).forEach(function (a) {
        charBody.appendChild(makeStickyNote(a, charPage));
      });

      charPage.appendChild(charBody);
      setupDoodleCanvas(canvas, charBody, charPage);
      setupTextSelection(charTextEl, charPage);
      spread.appendChild(charPage);

      // 右页：我的日记
      var userPage = el("div", { class: "dms-diary-page" });
      userPage.appendChild(el("div", { class: "dms-page-header" }, [
        el("div", {}, [
          el("div", { class: "dms-page-title" }, [(diary.userName || "\u6211") + " \u7684\u65e5\u8bb0"]),
          el("div", { class: "dms-page-meta" }, [diary.dateKey])
        ]),
        el("div", { style: { display: "flex", gap: "4px" } }, [
          el("button", { class: "dms-tool-btn", onclick: function () { onGenerateUserDiary(); } }, ["AI\u4ee3\u5199"]),
          el("button", { class: "dms-tool-btn", onclick: function () { onCharAnnotate(); } }, ["\u8ba9TA\u6279\u6ce8"])
        ])
      ]));

      var userBody = el("div", { class: "dms-page-body" });
      var userTextEl = el("div", { class: "dms-diary-text", id: "userDiaryText" });
      if (diary.charAnnotations && diary.charAnnotations.length > 0) {
        renderAnnotatedText(userTextEl, diary.userDiary || "", diary.charAnnotations);
      } else {
        userTextEl.textContent = diary.userDiary || "";
        userTextEl.appendChild(el("div", { style: { marginTop: "12px", fontSize: "12px", color: "var(--ink-mute)", fontStyle: "italic" } }, ["\u70b9\u53f3\u4e0a\u89d2\u201cAI\u4ee3\u5199\u201d\u8ba9AI\u5e2e\u4f60\u5199\uff0c\u6216\u76f4\u63a5\u5728\u4e0b\u65b9\u5199\u4f60\u7684\u65e5\u8bb0\u2026"]));
      }

      var editArea = el("textarea", {
        class: "dms-user-diary-edit",
        placeholder: "\u5728\u8fd9\u91cc\u5199\u4e0b\u4f60\u7684\u65e5\u8bb0\u2026",
        oninput: function () {
          state.currentDiary.userDiary = this.value;
          state.currentDiary.userDiaryAt = Date.now();
          saveCurrentDiary();
        }
      });
      editArea.value = diary.userDiary || "";

      userBody.appendChild(userTextEl);
      userBody.appendChild(editArea);
      userPage.appendChild(userBody);
      spread.appendChild(userPage);

      wrap.appendChild(spread);

      // 底部操作
      var actionBar = el("div", { class: "dms-card", style: { marginTop: "16px" } }, [
        el("div", { style: { display: "flex", gap: "8px", flexWrap: "wrap" } }, [
          el("button", { class: "dms-btn dms-btn-sm", onclick: function () {
            navigator.clipboard.writeText(diary.charDiary || "").then(function () { toast("\u5df2\u590d\u5236TA\u7684\u65e5\u8bb0"); }).catch(function () { toast("\u590d\u5236\u5931\u8d25"); });
          } }, ["\u590d\u5236TA\u65e5\u8bb0"]),
          el("button", { class: "dms-btn dms-btn-sm", onclick: function () {
            if (!state.currentDiary) return;
            roche.ui.confirm({ title: "\u540c\u6b65\u5230\u4e8b\u5b9e\u8bb0\u5fc6", message: "\u5c06\u628aTA\u7684\u65e5\u8bb0\u5199\u5165\u4e3b\u4e8b\u5b9e\u8bb0\u5fc6\u3002\u4e3b\u8bb0\u5fc6\u4e0d\u4f1a\u968f\u63d2\u4ef6\u5378\u8f7d\u800c\u5220\u9664\uff0c\u662f\u5426\u7ee7\u7eed\uff1f" }).then(function (ok) {
              if (!ok) return;
              return syncFact(roche, state.currentDiary.ctx || {}, state.currentDiary.charDiary || "").then(function () { toast("\u5df2\u5199\u5165\u4e8b\u5b9e\u8bb0\u5fc6"); });
            }).catch(function () { toast("\u5199\u5165\u5931\u8d25"); });
          } }, ["\u540c\u6b65\u5230\u4e8b\u5b9e\u8bb0\u5fc6"]),
          el("button", { class: "dms-btn dms-btn-sm", onclick: function () {
            if (!state.currentDiary) return;
            roche.ui.confirm({ title: "\u5220\u9664\u65e5\u8bb0", message: "\u5220\u9664\u8fd9\u7bc7\u65e5\u8bb0\u53ca\u6240\u6709\u6279\u6ce8\uff1f" }).then(function (ok) {
              if (!ok) return;
              deleteDiary(roche, state.diaryKey).then(function () { toast("\u5df2\u5220\u9664"); state.view = "cover"; renderContent(); });
            });
          } }, ["\u5220\u9664\u65e5\u8bb0"])
        ])
      ]);
      wrap.appendChild(actionBar);

      return wrap;
    }

    /* ---------- 批注渲染 ---------- */
    function renderAnnotatedText(container, text, annotations) {
      container.innerHTML = "";
      if (!text) {
        container.appendChild(el("div", { class: "dms-empty" }, ["\uff08\u5c1a\u672a\u5199\u65e5\u8bb0\uff09"]));
        return;
      }

      var textAnnots = (annotations || []).filter(function (a) {
        return a.selectedText && a.type !== "sticky";
      }).map(function (a) {
        return {
          id: a.id, type: a.type, comment: a.comment,
          selectedText: a.selectedText,
          start: text.indexOf(a.selectedText),
          end: text.indexOf(a.selectedText) + a.selectedText.length
        };
      }).filter(function (a) { return a.start >= 0; })
        .sort(function (a, b) { return a.start - b.start; });

      // 合并重叠
      var merged = [];
      var lastEnd = -1;
      textAnnots.forEach(function (a) {
        if (a.start > lastEnd) { merged.push(a); lastEnd = a.end; }
      });

      var pos = 0;
      var markerIdx = 0;
      merged.forEach(function (a) {
        if (a.start > pos) {
          container.appendChild(document.createTextNode(text.slice(pos, a.start)));
        }
        var span = el("span", {
          class: "dms-annot dms-annot-" + a.type,
          "data-annot-id": a.id,
          "data-marker": a.type === "heart" ? "\u2665" : (a.type === "crossout" ? "~" : "*")
        });
        if (a.type === "crossout") {
          var del = el("del", { style: { textDecorationColor: "var(--red)" } });
          del.textContent = text.slice(a.start, a.end);
          span.appendChild(del);
        } else {
          span.textContent = text.slice(a.start, a.end);
        }
        if (a.comment) {
          var tooltip = el("div", { class: "dms-annot-tooltip" }, [
            el("span", { style: { fontWeight: "600", color: a.type === "heart" ? "var(--red)" : "var(--blue)" } },
              [a.type === "heart" ? "\u5fc3" : a.type === "crossout" ? "\u5212" : "\u6279"]),
            " " + a.comment
          ]);
          span.appendChild(tooltip);
        }
        container.appendChild(span);
        pos = a.end;
        markerIdx++;
      });
      if (pos < text.length) {
        container.appendChild(document.createTextNode(text.slice(pos)));
      }
    }

    /* ---------- 文字选择 → 批注菜单 ---------- */
    function setupTextSelection(textEl, pageEl) {
      textEl.addEventListener("mouseup", function () {
        if (state.doodleMode) return;
        setTimeout(function () {
          var sel = window.getSelection();
          if (!sel || sel.rangeCount === 0) { hideAnnotMenu(); return; }
          var selectedText = sel.toString().trim();
          if (selectedText.length < 1) { hideAnnotMenu(); return; }
          // 确认选区在 charDiaryText 内
          var range = sel.getRangeAt(0);
          if (!textEl.contains(range.commonAncestorContainer)) { hideAnnotMenu(); return; }
          showAnnotMenu(selectedText, range, pageEl);
        }, 10);
      });
      textEl.addEventListener("touchend", function () {
        if (state.doodleMode) return;
        setTimeout(function () {
          var sel = window.getSelection();
          if (!sel || sel.rangeCount === 0) { hideAnnotMenu(); return; }
          var selectedText = sel.toString().trim();
          if (selectedText.length < 1) { hideAnnotMenu(); return; }
          var range = sel.getRangeAt(0);
          if (!textEl.contains(range.commonAncestorContainer)) { hideAnnotMenu(); return; }
          showAnnotMenu(selectedText, range, pageEl);
        }, 200);
      });
    }

    function showAnnotMenu(selectedText, range, pageEl) {
      hideAnnotMenu();
      var rect = range.getBoundingClientRect();
      var menu = el("div", { class: "dms-annot-menu", style: {
        left: (rect.left + rect.width / 2) + "px",
        top: (rect.bottom + window.scrollY + 6) + "px",
        transform: "translateX(-50%)"
      }});

      var inputBox = el("textarea", { class: "dms-annot-input", placeholder: "\u5199\u4e0b\u4f60\u7684\u60f3\u6cd5\u2026" });

      function doAnnotate(type) {
        var comment = inputBox.value.trim();
        if (type !== "heart" && type !== "crossout" && !comment) {
          toast("\u8bf7\u5148\u5199\u4e0b\u60f3\u6cd5");
          return;
        }
        var annot = {
          id: crypto.randomUUID(),
          type: type,
          selectedText: selectedText,
          comment: comment,
          createdAt: Date.now()
        };
        if (!state.currentDiary.annotations) state.currentDiary.annotations = [];
        state.currentDiary.annotations.push(annot);
        saveCurrentDiary();
        window.getSelection().removeAllRanges();
        hideAnnotMenu();
        renderContent();
        toast(type === "comment" ? "\u5df2\u6279\u6ce8" : type === "crossout" ? "\u5df2\u5212\u6389" : type === "heart" ? "\u5df2\u8868\u767d" : "\u5df2\u6dfb\u52a0");
      }

      menu.appendChild(el("button", { class: "dms-tool-btn", onclick: function () { doAnnotate("comment"); } }, ["\u6279\u6ce8"]));
      menu.appendChild(el("button", { class: "dms-tool-btn", onclick: function () { doAnnotate("crossout"); } }, ["\u5212\u6389"]));
      menu.appendChild(el("button", { class: "dms-tool-btn", onclick: function () { doAnnotate("heart"); } }, ["\u8868\u7675"]));
      menu.appendChild(inputBox);
      menu.appendChild(el("button", { class: "dms-tool-btn", style: { alignSelf: "flex-end" }, onclick: function () { doAnnotate("comment"); } }, ["\u786e\u5b9a"]));

      document.body.appendChild(menu);
      state.annotMenuEl = menu;

      // 点击外部关闭
      setTimeout(function () {
        document.addEventListener("mousedown", closeAnnotOnOutside);
      }, 0);
    }

    function closeAnnotOnOutside(e) {
      if (state.annotMenuEl && !state.annotMenuEl.contains(e.target)) {
        hideAnnotMenu();
      }
    }

    function hideAnnotMenu() {
      if (state.annotMenuEl) {
        state.annotMenuEl.remove();
        state.annotMenuEl = null;
        document.removeEventListener("mousedown", closeAnnotOnOutside);
      }
    }

    /* ---------- 便签 ---------- */
    function addStickyNote(pageEl) {
      var colors = ["#FFE4A0", "#FFCDD2", "#C8E6C9", "#BBDEFB"];
      var color = colors[Math.floor(Math.random() * colors.length)];
      var annot = {
        id: crypto.randomUUID(),
        type: "sticky",
        comment: "",
        x: 20 + Math.random() * 100,
        y: 80 + Math.random() * 80,
        color: color,
        createdAt: Date.now()
      };
      if (!state.currentDiary.annotations) state.currentDiary.annotations = [];
      state.currentDiary.annotations.push(annot);
      saveCurrentDiary();
      renderContent();
    }

    function makeStickyNote(annot, pageEl) {
      var sticky = el("div", {
        class: "dms-sticky",
        style: { left: annot.x + "px", top: annot.y + "px", background: annot.color || "#FFE4A0" }
      });
      var text = el("div", { contentEditable: "true", style: { outline: "none", minHeight: "20px" } }, [annot.comment || "\u53cc\u51fb\u7f16\u8f91\u2026"]);
      text.addEventListener("blur", function () {
        annot.comment = text.textContent;
        saveCurrentDiary();
      });
      var removeBtn = el("button", { class: "dms-sticky-remove", onclick: function (ev) {
        ev.stopPropagation();
        var arr = state.currentDiary.annotations;
        var i = arr.indexOf(annot);
        if (i >= 0) arr.splice(i, 1);
        saveCurrentDiary();
        sticky.remove();
      } }, ["\u00d7"]);

      // 拖拽
      var dragging = false, offsetX = 0, offsetY = 0;
      sticky.addEventListener("pointerdown", function (e) {
        if (e.target === text || e.target === removeBtn) return;
        dragging = true;
        offsetX = e.clientX - sticky.offsetLeft;
        offsetY = e.clientY - sticky.offsetTop;
        sticky.setPointerCapture(e.pointerId);
      });
      sticky.addEventListener("pointermove", function (e) {
        if (!dragging) return;
        var body = pageEl.querySelector(".dms-page-body");
        if (!body) return;
        var rect = body.getBoundingClientRect();
        var nx = e.clientX - offsetX;
        var ny = e.clientY - offsetY;
        annot.x = Math.max(0, Math.min(nx, rect.width - 80));
        annot.y = Math.max(0, Math.min(ny, rect.height - 40));
        sticky.style.left = annot.x + "px";
        sticky.style.top = annot.y + "px";
      });
      sticky.addEventListener("pointerup", function () { if (dragging) { dragging = false; saveCurrentDiary(); } });

      sticky.appendChild(text);
      sticky.appendChild(removeBtn);
      return sticky;
    }

    /* ---------- 涂鸦系统 ---------- */
    function buildDoodleToolbar() {
      var toolbar = el("div", { class: "dms-toolbar" });
      var colors = [
        { color: "#C44536", name: "red" },
        { color: "#3A6B8A", name: "blue" },
        { color: "#7B8F5C", name: "green" },
        { color: "#4A3C28", name: "ink" }
      ];
      toolbar.appendChild(el("span", { style: { fontSize: "11px", color: "var(--ink-mute)" } }, ["\u989c\u8272:"]));
      colors.forEach(function (c) {
        var dot = el("span", {
          class: "dms-color-dot" + (state.doodleColor === c.color ? " active" : ""),
          style: { background: c.color },
          onclick: function () { state.doodleColor = c.color; renderContent(); }
        });
        toolbar.appendChild(dot);
      });
      toolbar.appendChild(el("span", { style: { width: "10px" } }));
      toolbar.appendChild(el("button", {
        class: "dms-tool-btn" + (state.doodleTool === "pen" ? " active" : ""),
        onclick: function () { state.doodleTool = "pen"; renderContent(); }
      }, ["\u753b\u7b14"]));
      toolbar.appendChild(el("button", {
        class: "dms-tool-btn" + (state.doodleTool === "highlighter" ? " active" : ""),
        onclick: function () { state.doodleTool = "highlighter"; renderContent(); }
      }, ["\u8367\u5149\u7b14"]));
      return toolbar;
    }

    function toggleDoodle(pageEl) {
      state.doodleMode = !state.doodleMode;
      renderContent();
    }

    function clearDoodles(pageEl) {
      if (!state.currentDiary) return;
      roche.ui.confirm({ title: "\u6e05\u9664\u6d82\u9e26", message: "\u786e\u5b9a\u6e05\u9664\u6240\u6709\u6d82\u9e26\uff1f" }).then(function (ok) {
        if (!ok) return;
        state.currentDiary.doodles = [];
        saveCurrentDiary();
        renderContent();
        toast("\u5df2\u6e05\u9664");
      });
    }

    function setupDoodleCanvas(canvas, container, pageEl) {
      var ctx = canvas.getContext("2d");
      var drawing = false;
      var currentStroke = null;
      var strokes = (state.currentDiary && state.currentDiary.doodles) || [];

      function resize() {
        canvas.width = container.offsetWidth;
        canvas.height = container.offsetHeight;
        redraw();
      }

      function redraw() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        strokes.forEach(function (stroke) {
          if (stroke.tool === "highlighter") {
            ctx.globalAlpha = 0.35;
          } else {
            ctx.globalAlpha = 1;
          }
          ctx.strokeStyle = stroke.color;
          ctx.lineWidth = stroke.tool === "highlighter" ? 12 : 2;
          ctx.lineCap = "round";
          ctx.lineJoin = "round";
          ctx.beginPath();
          stroke.points.forEach(function (p, i) {
            if (i === 0) ctx.moveTo(p[0], p[1]);
            else ctx.lineTo(p[0], p[1]);
          });
          ctx.stroke();
        });
        ctx.globalAlpha = 1;
      }

      function getPos(e) {
        var rect = canvas.getBoundingClientRect();
        return [e.clientX - rect.left, e.clientY - rect.top];
      }

      canvas.addEventListener("pointerdown", function (e) {
        if (!state.doodleMode) return;
        e.preventDefault();
        drawing = true;
        currentStroke = {
          points: [],
          color: state.doodleColor,
          tool: state.doodleTool,
          width: state.doodleTool === "highlighter" ? 12 : 2
        };
        currentStroke.points.push(getPos(e));
        canvas.setPointerCapture(e.pointerId);
      });

      canvas.addEventListener("pointermove", function (e) {
        if (!drawing) return;
        e.preventDefault();
        currentStroke.points.push(getPos(e));
        redraw();
        // 实时绘制当前笔触
        if (currentStroke.tool === "highlighter") {
          ctx.globalAlpha = 0.35;
        } else {
          ctx.globalAlpha = 1;
        }
        ctx.strokeStyle = currentStroke.color;
        ctx.lineWidth = currentStroke.width;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.beginPath();
        currentStroke.points.forEach(function (p, i) {
          if (i === 0) ctx.moveTo(p[0], p[1]);
          else ctx.lineTo(p[0], p[1]);
        });
        ctx.stroke();
        ctx.globalAlpha = 1;
      });

      canvas.addEventListener("pointerup", function (e) {
        if (!drawing) return;
        drawing = false;
        if (currentStroke && currentStroke.points.length > 1) {
          strokes.push(currentStroke);
          if (!state.currentDiary.doodles) state.currentDiary.doodles = [];
          state.currentDiary.doodles = strokes.slice();
          saveCurrentDiary();
        }
        currentStroke = null;
      });

      canvas.addEventListener("pointerleave", function (e) {
        if (drawing) {
          drawing = false;
          if (currentStroke && currentStroke.points.length > 1) {
            strokes.push(currentStroke);
            state.currentDiary.doodles = strokes.slice();
            saveCurrentDiary();
          }
          currentStroke = null;
        }
      });

      setTimeout(resize, 50);
      return { resize: resize, redraw: redraw };
    }

    /* ---------- 设置面板 ---------- */
    function buildSettingsPanel() {
      var panel = el("div", { class: "dms-settings-panel" + (state.settingsOpen ? " open" : "") });
      panel.appendChild(el("div", { class: "dms-settings-header" }, [
        el("div", { class: "dms-handwritten", style: { fontSize: "16px", color: "var(--red)" } }, ["\u8bbe\u7f6e"]),
        el("button", { class: "dms-btn dms-btn-ghost dms-btn-sm", onclick: function () { toggleSettings(false); } }, ["\u5173\u95ed"])
      ]));

      var body = el("div", { class: "dms-settings-body" });

      // 内容选项
      var sec1 = el("div", { class: "dms-settings-section" }, [
        el("h3", {}, ["\u5185\u5bb9\u9009\u9879"])
      ]);
      sec1.appendChild(makeSwitch("\u6ce8\u5165\u6838\u5fc3\u8bb0\u5fc6", "\u4f5c\u4e3a\u53c2\u8003\u6ce8\u5165\u7ed9AI", state.settings.showCore, function (v) {
        state.settings.showCore = v; saveSettings(roche, state.settings);
      }));
      sec1.appendChild(makeSwitch("\u6ce8\u5165\u4e8b\u5b9e\u8bb0\u5fc6", "\u4f5c\u4e3a\u53c2\u8003\u6ce8\u5165\u7ed9AI", state.settings.showFacts, function (v) {
        state.settings.showFacts = v; saveSettings(roche, state.settings);
      }));
      sec1.appendChild(makeSwitch("\u542f\u7528\u4e16\u754c\u4e66", "\u52fe\u9009\u540e\u53ef\u6311\u9009\u5206\u7c7b/\u8bcd\u6761", state.settings.useWorldbook, function (v) {
        state.settings.useWorldbook = v; saveSettings(roche, state.settings);
        if (v && !state.worldbookTree.length) { loadWbTree(roche).then(function (t) { state.worldbookTree = t; toggleSettings(true); renderContent(); }); }
        else { toggleSettings(true); renderContent(); }
      }));
      if (state.settings.useWorldbook) sec1.appendChild(buildWbPicker());
      body.appendChild(sec1);

      // TA的思维链
      var sec2 = el("div", { class: "dms-settings-section" }, [
        el("h3", {}, ["TA\u7684\u601d\u7ef4\u94fe"]),
        el("div", { class: "dms-hint", style: { marginBottom: "6px" } }, ["{{char}}\u4f1a\u88ab\u66ff\u6362\u4e3a\u89d2\u8272\u540d"])
      ]);
      var tc = el("textarea", { class: "dms-textarea", placeholder: "\u8bf7\u8f93\u5165\u601d\u7ef4\u94fe\u2026" });
      tc.value = state.settings.charThinkingChain || "";
      tc.addEventListener("change", function () {
        state.settings.charThinkingChain = this.value; saveSettings(roche, state.settings); toast("\u5df2\u4fdd\u5b58");
      });
      sec2.appendChild(tc);
      sec2.appendChild(el("div", { class: "dms-hint", style: { marginTop: "6px" } }, ["TA\u7684\u8f93\u51fa\u683c\u5f0f"]));
      var cf = el("textarea", { class: "dms-textarea", style: { minHeight: "60px" }, placeholder: "\u8f93\u51fa\u683c\u5f0f\u6307\u4ee4\u2026" });
      cf.value = state.settings.charFormat || "";
      cf.addEventListener("change", function () {
        state.settings.charFormat = this.value; saveSettings(roche, state.settings); toast("\u5df2\u4fdd\u5b58");
      });
      sec2.appendChild(cf);
      body.appendChild(sec2);

      // 我的思维链
      var sec3 = el("div", { class: "dms-settings-section" }, [
        el("h3", {}, ["\u6211\u7684\u601d\u7ef4\u94fe"]),
        el("div", { class: "dms-hint", style: { marginBottom: "6px" } }, ["{{user}}\u4f1a\u88ab\u66ff\u6362\u4e3a\u7528\u6237\u540d"])
      ]);
      var utc = el("textarea", { class: "dms-textarea", placeholder: "\u8bf7\u8f93\u5165\u601d\u7ef4\u94fe\u2026" });
      utc.value = state.settings.userThinkingChain || "";
      utc.addEventListener("change", function () {
        state.settings.userThinkingChain = this.value; saveSettings(roche, state.settings); toast("\u5df2\u4fdd\u5b58");
      });
      sec3.appendChild(utc);
      sec3.appendChild(el("div", { class: "dms-hint", style: { marginTop: "6px" } }, ["\u6211\u7684\u8f93\u51fa\u683c\u5f0f"]));
      var uf = el("textarea", { class: "dms-textarea", style: { minHeight: "60px" }, placeholder: "\u8f93\u51fa\u683c\u5f0f\u6307\u4ee4\u2026" });
      uf.value = state.settings.userFormat || "";
      uf.addEventListener("change", function () {
        state.settings.userFormat = this.value; saveSettings(roche, state.settings); toast("\u5df2\u4fdd\u5b58");
      });
      sec3.appendChild(uf);
      body.appendChild(sec3);

      // 记忆同步
      var sec4 = el("div", { class: "dms-settings-section" }, [
        el("h3", {}, ["\u8bb0\u5fc6\u540c\u6b65"])
      ]);
      sec4.appendChild(makeSwitch("\u751f\u6210\u540e\u81ea\u52a8\u540c\u6b65\u5230\u4e8b\u5b9e\u8bb0\u5fc6", "\u5199\u5165\u7684\u662fRoche\u4e3b\u4e8b\u5b9e\u8bb0\u5fc6\uff0c\u5378\u8f7d\u63d2\u4ef6\u4e0d\u4f1a\u81ea\u52a8\u5220\u9664\u3002", state.settings.autoSyncAfterGenerate, function (v) {
        state.settings.autoSyncAfterGenerate = v; saveSettings(roche, state.settings);
      }));
      if (state.settings.autoSyncAfterGenerate) {
        sec4.appendChild(el("div", { class: "dms-warn-box" }, ["\u5df2\u5f00\u542f\u81ea\u52a8\u540c\u6b65\uff1a\u6bcf\u6b21\u751f\u6210\u6210\u529f\u540e\u4f1a\u5199\u5165\u4e00\u6761\u4e3b\u4e8b\u5b9e\u8bb0\u5fc6\u3002\u4e3b\u8bb0\u5fc6\u4e0d\u4f1a\u968f\u63d2\u4ef6\u5378\u8f7d\u800c\u5220\u9664\uff0c\u8bf7\u8c28\u614e\u4f7f\u7528\u3002"]));
      }
      body.appendChild(sec4);

      // 消息上限
      var sec5 = el("div", { class: "dms-settings-section" }, [
        el("h3", {}, ["\u8bfb\u53d6\u4e0a\u9650"]),
        el("div", { class: "dms-hint", style: { marginBottom: "6px" } }, ["\u8bfb\u53d6\u591a\u5c11\u6761\u77ed\u671f\u8bb0\u5fc6\uff08\u9ed8\u8ba45000\uff09"])
      ]);
      var ml = el("input", { type: "number", class: "dms-input", value: state.settings.messageLimit || 5000, style: { width: "100%" } });
      ml.addEventListener("change", function () {
        state.settings.messageLimit = Math.max(100, Number(this.value) || 5000);
        saveSettings(roche, state.settings); toast("\u5df2\u4fdd\u5b58");
      });
      sec5.appendChild(ml);
      body.appendChild(sec5);

      panel.appendChild(body);
      return panel;
    }

    function buildSettingsOverlay() {
      return el("div", { class: "dms-settings-overlay" + (state.settingsOpen ? " open" : ""), onclick: function () { toggleSettings(false); } });
    }

    function toggleSettings(open) {
      state.settingsOpen = open;
      var panel = qs(".dms-settings-panel", root);
      var overlay = qs(".dms-settings-overlay", root);
      if (panel) panel.classList.toggle("open", open);
      if (overlay) overlay.classList.toggle("open", open);
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
      var box = el("div", { style: { marginTop: "10px" } });
      var treeBox = el("div", { class: "dms-wb-tree" });
      if (!state.worldbookTree.length) {
        treeBox.appendChild(el("div", { class: "dms-empty" }, ["\u6682\u65e0\u4e16\u754c\u4e66\u6570\u636e\u3002"]));
      } else {
        state.worldbookTree.forEach(function (cat) {
          var catActive = state.settings.worldbookCategories.indexOf(cat.id) >= 0;
          var catItem = el("div", { class: "dms-wb-cat" + (catActive ? " active" : "") });
          var head = el("div", { class: "dms-wb-cat-head" }, [
            el("div", { class: "dms-check" }),
            el("div", { class: "dms-wb-name" }, [cat.name || cat.title || "\u672a\u547d\u540d"]),
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

    /* ---------- 历史记录 ---------- */
    function buildHistory() {
      var wrap = el("div", { class: "dms-wrap dms-fade-in" });
      var card = el("div", { class: "dms-card" }, [
        el("h2", {}, ["\u5386\u53f2\u65e5\u8bb0"]),
        el("div", { class: "dms-card-sub" }, ["\u4fdd\u5b58\u5728\u672c\u63d2\u4ef6\u79c1\u6709\u5b58\u50a8\uff0c\u5378\u8f7d\u4f1a\u4e00\u5e76\u6e05\u9664\u3002"])
      ]);
      wrap.appendChild(card);
      getDiaries(roche).then(function (all) {
        var keys = Object.keys(all).sort(function (a, b) {
          return (all[b].updatedAt || all[b].createdAt || 0) - (all[a].updatedAt || all[a].createdAt || 0);
        });
        if (!keys.length) {
          card.appendChild(el("div", { class: "dms-empty" }, ["\u6682\u65e0\u65e5\u8bb0\u3002"]));
        } else {
          keys.forEach(function (k) {
            var it = all[k];
            var item = el("div", { class: "dms-hist", onclick: function () {
              state.diaryKey = k;
              state.currentDiary = it;
              state.selectedConvId = it.conversationId || "";
              state.selectedConv = { conversationId: it.conversationId, name: it.charName, handle: it.charName };
              state.selectedDate = parseDateInput(it.dateKey || toDateInput(new Date()));
              state.view = "diary";
              renderContent();
            } });
            item.appendChild(el("div", { class: "dms-hist-head" }, [
              el("div", { class: "dms-hist-title" }, [(it.charName || "\u672a\u77e5") + " \u00b7 " + (it.dateKey || "")]),
              el("div", { class: "dms-hist-date" }, [new Date(it.updatedAt || it.createdAt || 0).toLocaleString()])
            ]));
            item.appendChild(el("div", { class: "dms-hist-snippet" }, [(it.charDiary || "").slice(0, 60) + "\u2026"]));
            var annotCount = (it.annotations || []).length + (it.charAnnotations || []).length;
            if (annotCount > 0) {
              item.appendChild(el("div", { style: { fontSize: "11px", color: "var(--red)", marginTop: "4px" } }, [annotCount + " \u6761\u6279\u6ce8"]));
            }
            var btns = el("div", { style: { marginTop: "8px", display: "flex", gap: "6px" } });
            btns.appendChild(el("button", { class: "dms-btn dms-btn-sm", onclick: function (ev) {
              ev.stopPropagation();
              deleteDiary(roche, k).then(function () { toast("\u5df2\u5220\u9664"); renderContent(); });
            } }, ["\u5220\u9664"]));
            item.appendChild(btns);
            card.appendChild(item);
          });
          card.appendChild(el("div", { style: { marginTop: "10px" } }, [
            el("button", { class: "dms-btn dms-btn-sm", onclick: function () {
              roche.ui.confirm({ title: "\u6e05\u7a7a", message: "\u6e05\u7a7a\u5168\u90e8\u65e5\u8bb0\uff1f" }).then(function (ok) {
                if (!ok) return;
                return roche.storage.set(STORAGE_DIARIES, {}).then(function () { toast("\u5df2\u6e05\u7a7a"); renderContent(); });
              });
            } }, ["\u6e05\u7a7a\u5168\u90e8"])
          ]));
        }
      });
      return wrap;
    }

    /* ---------- 打开/生成日记 ---------- */
    function onOpenDiary() {
      if (state.generating) return;
      if (!state.selectedConv) { toast("\u8bf7\u5148\u9009\u62e9\u7b14\u53cb"); return; }
      state.generating = true;
      renderContent();

      var conv = state.selectedConv;
      var cid = conv.conversationId || conv.id;
      var info = convInfo(conv);
      state.diaryKey = cid + ":" + toDateKey(state.selectedDate);

      // 先检查是否已有日记
      getDiary(roche, state.diaryKey).then(function (existing) {
        if (existing && existing.charDiary) {
          // 已有日记，直接打开
          state.currentDiary = existing;
          state.generating = false;
          state.view = "diary";
          renderContent();
          return;
        }
        // 生成新日记
        return buildCtx(roche, state, state.selectedDate).then(function (ctx) {
          if (!ctx.dayShort.length) {
            state.generating = false;
            toast("\u5f53\u65e5\u65e0\u804a\u5929\u8bb0\u5f55\uff0c\u8bf7\u8c03\u6574\u65e5\u671f");
            renderContent();
            return;
          }
          return generateCharDiary(roche, ctx, state.settings).then(function (text) {
            var diaryData = {
              conversationId: cid,
              charName: ctx.charName,
              userName: ctx.userName,
              dateKey: ctx.dateKey,
              isGroup: ctx.isGroup,
              charDiary: text || "",
              userDiary: "",
              annotations: [],
              doodles: [],
              charAnnotations: [],
              ctx: ctx,
              createdAt: Date.now(),
              updatedAt: Date.now()
            };
            return saveDiary(roche, state.diaryKey, diaryData).then(function () {
              state.currentDiary = diaryData;
              if (state.settings.autoSyncAfterGenerate) {
                return syncFact(roche, ctx, text || "").catch(function () {});
              }
            }).then(function () {
              state.generating = false;
              state.view = "diary";
              renderContent();
              toast("\u65e5\u8bb0\u5df2\u5199\u597d");
            });
          });
        });
      }).catch(function (e) {
        console.error("[DMS]", e);
        state.generating = false;
        toast("\u751f\u6210\u5931\u8d25: " + (e && e.message || e));
        renderContent();
      });
    }

    /* ---------- AI代写用户日记 ---------- */
    function onGenerateUserDiary() {
      if (state.generating) return;
      if (!state.currentDiary || !state.currentDiary.ctx) { toast("\u65e0\u4e0a\u4e0b\u6587"); return; }
      state.generating = true;
      toast("\u5199\u4e2d\u2026");
      var ctx = state.currentDiary.ctx;
      generateUserDiary(roche, ctx, state.settings).then(function (text) {
        state.currentDiary.userDiary = text || "";
        state.currentDiary.userDiaryAt = Date.now();
        state.currentDiary.updatedAt = Date.now();
        return saveCurrentDiary();
      }).then(function () {
        toast("\u5df2\u5199\u597d");
      }).catch(function (e) {
        toast("\u5931\u8d25");
        console.error(e);
      }).then(function () {
        state.generating = false;
        renderContent();
      });
    }

    /* ---------- 让TA批注我的日记 ---------- */
    function onCharAnnotate() {
      if (state.generating) return;
      if (!state.currentDiary) return;
      var userText = state.currentDiary.userDiary || "";
      if (!userText.trim()) { toast("\u8bf7\u5148\u5199\u4e0b\u4f60\u7684\u65e5\u8bb0"); return; }
      state.generating = true;
      toast("TA\u6b63\u5728\u8bfb\u2026");
      var ctx = state.currentDiary.ctx;
      generateCharAnnotations(roche, ctx, userText, state.settings).then(function (annots) {
        if (!annots || !annots.length) {
          toast("TA\u6ca1\u6709\u4ec0\u4e48\u60f3\u8bf4\u7684\u2026");
        } else {
          state.currentDiary.charAnnotations = annots.map(function (a) {
            a.id = crypto.randomUUID();
            a.createdAt = Date.now();
            return a;
          });
          state.currentDiary.updatedAt = Date.now();
          return saveCurrentDiary().then(function () {
            toast("TA\u6279\u6ce8\u4e86 " + annots.length + " \u5904");
          });
        }
      }).catch(function (e) {
        toast("\u5931\u8d25");
        console.error(e);
      }).then(function () {
        state.generating = false;
        renderContent();
      });
    }

    /* ---------- 保存当前日记 ---------- */
    var saveTimer = null;
    function saveCurrentDiary() {
      if (!state.currentDiary || !state.diaryKey) return Promise.resolve();
      if (saveTimer) clearTimeout(saveTimer);
      return new Promise(function (resolve) {
        saveTimer = setTimeout(function () {
          state.currentDiary.updatedAt = Date.now();
          saveDiary(roche, state.diaryKey, state.currentDiary).then(resolve).catch(resolve);
        }, 500);
      });
    }

    /* ---------- 加载 ---------- */
    function loadAll() {
      return loadConversations(roche).then(function (convs) {
        state.conversations = convs;
        if (state.settings.useWorldbook) {
          return loadWbTree(roche).then(function (t) { state.worldbookTree = t; });
        }
      });
    }

    /* ---------- 组装 DOM ---------- */
    root.appendChild(buildTop());
    var body = el("div", { class: "dms-body" });
    root.appendChild(body);
    body.appendChild(el("div", { class: "dms-wrap" }, [el("div", { class: "dms-empty" }, ["\u52a0\u8f7d\u4e2d\u2026"])]));
    root.appendChild(buildFooter());
    root.appendChild(buildSettingsPanel());
    root.appendChild(buildSettingsOverlay());

    loadAll().then(function () { renderContent(); }).catch(function (e) {
      console.error("[DMS]", e);
      var b = qs(".dms-body", root);
      if (b) { b.innerHTML = ""; b.appendChild(el("div", { class: "dms-wrap" }, [el("div", { class: "dms-card" }, [el("div", { class: "dms-empty" }, ["\u52a0\u8f7d\u5931\u8d25: " + (e && e.message || e)])])])); }
    });
  }

  /* ============================================================
   *  注册
   * ============================================================ */
  window.RochePlugin.register({
    id: "daily-memory-summary",
    name: "\u624b\u8d26\u65e5\u8bb0",
    version: "2.0.0",
    apps: [
      {
        id: "daily-memory-summary-home",
        name: "\u624b\u8d26\u65e5\u8bb0",
        icon: "auto_stories",
        iconImage: "",
        mount: function (container, roche) {
          ensureStyle();
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

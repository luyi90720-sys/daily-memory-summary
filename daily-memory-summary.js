/*
 * 手账日记 (daily-memory-summary) v2.6.5
 * 手账本风格的交换日记 — user先写日记，再让TA回写，互相贴表情包/便签。
 * 风格：暖色纸张手账本 + 手写字体 + 和纸胶带装饰。
 * v2.2.0:
 *   - 删除绘画功能，保留便签与表情包
 *   - 新增表情包系统：URL导入、分组管理、会话挂载、贴到日记
 *   - 封面页新增"交换日记"开关，自选是否交换
 *   - 交换模式流程：user先写日记 → 写好后让TA回写 → user给TA日记贴表情包/便签
 *   - char日记分块（【块A】【块B】...），可针对块贴表情包/便签，方便后续char反应
 *   - 同步选项对话框：生成后弹多选（事实记忆/短期记忆），可选"记住选择"
 *   - 短期记忆同步：通过 RocheToolkit.simulateSystemNotice 把交换日记作为消息注入主聊天
 *   - 手机端适配：600px 以下单列布局，触摸友好
 *   - 修复事实记忆截断问题（不再 slice 到 800 字）
 *   - 历史日记按 cid:dateKey 存储，重新生成自动覆盖
 * v2.1.2: 优化封面交互—会话列表限高滚动、选会话后自动滚动到日期卡并高亮、未选会话时日期卡显示引导提示
 * v2.1.1: 修复appendChild嵌套数组错误、移除事实记忆条数选择
 * v2.1.0: 删除AI代写user日记、修复生成状态提示、修复翻页失败可重试、修复选会话不重建
 */
(function () {
  "use strict";

  var ROOT_CLASS = "roche-plugin-dms";
  var STYLE_ID = ROOT_CLASS + "-style";
  var STORAGE_SETTINGS = "dms-settings";
  var STORAGE_DIARIES = "dms-diaries";               // 旧版统一存储（启动时自动迁移到下面两个）
  var STORAGE_DIARIES_SWAP = "dms-diaries-swap";     // 交换日记存储（user 与 char 交互）
  var STORAGE_DIARIES_SOLO = "dms-diaries-solo";     // char 独自日记存储（只看char日记/整理记忆）
  var STORAGE_STICKERS = "dms-stickers";
  var STORAGE_CUSTOM_NOTES = "dms-custom-notes";   // user自定义便签样式（CSS）
  var STORAGE_PRESETS = "dms-presets";              // 思维链/格式预设
  var MIGRATED_KEY = "dms-migrated-v2.4";           // 旧数据迁移标记

  /* 根据 mode 返回对应存储键 */
  function storageKeyFor(mode) {
    return mode === "swap" ? STORAGE_DIARIES_SWAP : STORAGE_DIARIES_SOLO;
  }

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
      "   - 语气、用词、句式和思考回路必须100%贴合 {{char}} 的人设。允许甚至鼓励口语化，包括口癖、倒装、碎碎念、突然的情绪爆发或欲言欲止，怎么真就怎么来。",
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
      "6. 段落组织（重要）",
      "   - 用自然的换行分段来组织日记内容，每段聚焦一个事件、场景或情绪转折。",
      "   - 每段内容 100~200 字左右，段与段之间空一行，让日记像真实的手写日记那样自然流畅。",
      "   - 段落数量控制在 3~6 段，不要过碎或过长。",
      "   - 不要使用任何特殊标记（如【块A】），直接换行分段即可。",
      "",
      "其他要求：",
      "- 称呼user时，可以用ta",
      "- 在日记结尾，原样保留那些有趣或值得记下的、有情感价值的对话。提到了具体的歌名或作品的名字，也必须原样保留。",
      "- 必须自检是否捏造了不存在的互动。再次自检是否忽略了有趣的互动。",
      "- 不可捏造互动，不可省略互动，不可提及输赢，恋爱没有输赢。",
      "- 字数限定在800字左右，聊天记录不在字数限定范围。",
      "- 必须在生成日记前进行思考，哪些对话是char发的，哪些对话是user发的，以事件、话题与情感来记录。"
    ].join("\n"),
    charFormat: "请直接以 {{char}} 的第一人称写日记，按照思维链中的要求，用自然换行分段的方式组织 3~6 段，每段 100~200 字，段与段之间空一行。不要使用任何特殊标记。",
    syncToFactMemory: false,
    syncToShortTerm: false,
    rememberSyncChoice: false,
    autoSyncAfterGenerate: false,
    swapMode: true,
    messageLimit: 5000,
    defaultStickyStyle: null,       // user 自己添加便签时的默认样式（null=随机）
    defaultCharStickyStyle: null,   // char 给 user 写便签时的默认样式（null=随机）
    hideCharStickies: false,        // 隐藏 TA 给 user 贴的便签（避免遮挡）
    userThinkingChain: "",          // 兼容旧设置（已弃用，不再使用）
    userFormat: ""                  // 兼容旧设置（已弃用，不再使用）
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
    if (children != null) appendChildren(node, children);
    return node;
  }

  function appendChildren(node, children) {
    if (!Array.isArray(children)) children = [children];
    for (var i = 0; i < children.length; i++) {
      var c = children[i];
      if (c == null || c === false) continue;
      if (Array.isArray(c)) { appendChildren(node, c); continue; }
      if (typeof c === "string" || typeof c === "number" || typeof c === "boolean") {
        c = document.createTextNode(String(c));
      }
      node.appendChild(c);
    }
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
    return roche.memory.getLongTerm({ conversationId: cid, limit: 1000 })
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
  function generateCharAnnotations(roche, ctx, userDiaryText, settings) {
    return callAI(roche, buildCharAnnotationMessages(ctx, userDiaryText, settings), 0.8).then(function (text) {
      try {
        var match = text.match(/\[[\s\S]*\]/);
        if (match) return JSON.parse(match[0]);
        return [];
      } catch (e) { return []; }
    });
  }

  /* ---------- 同步到事实记忆（修复截断：使用完整文本） ---------- */
  function syncFact(roche, ctx, text) {
    return roche.memory.write({
      conversationId: ctx.conversationId,
      summaryText: text,
      who: [ctx.userName, ctx.charName],
      action: text,
      when: ctx.dateKey,
      where: ctx.isGroup ? "\u7fa4\u804a" : "\u5355\u804a",
      source: "plugin:daily-memory-summary"
    });
  }

  /* ---------- 设置存储 ---------- */
  function getSettings(roche) {
    return roche.storage.get(STORAGE_SETTINGS).then(function (s) {
      return Object.assign({}, DEFAULT_SETTINGS, s || {});
    }).catch(function () { return Object.assign({}, DEFAULT_SETTINGS); });
  }
  function saveSettings(roche, s) { return roche.storage.set(STORAGE_SETTINGS, s); }

  /* ---------- 日记存储 ----------
   * 两种存储分别保存「交换日记」和「char独自日记」
   * 通过 mode 参数区分：mode="swap" → 交换日记；mode="solo" → char独自日记
   * 旧数据（STORAGE_DIARIES）在启动时自动迁移到对应存储
   */
  function getDiariesByMode(roche, mode) {
    var key = storageKeyFor(mode);
    return roche.storage.get(key).then(function (s) { return s || {}; }).catch(function () { return {}; });
  }
  function getDiaryByMode(roche, mode, diaryKey) {
    return getDiariesByMode(roche, mode).then(function (all) { return all[diaryKey] || null; });
  }
  function saveDiaryByMode(roche, mode, diaryKey, data) {
    return getDiariesByMode(roche, mode).then(function (all) {
      all[diaryKey] = data;
      return roche.storage.set(storageKeyFor(mode), all);
    });
  }
  function deleteDiaryByMode(roche, mode, diaryKey) {
    return getDiariesByMode(roche, mode).then(function (all) {
      delete all[diaryKey];
      return roche.storage.set(storageKeyFor(mode), all);
    });
  }

  /* 获取两种模式全部日记（历史列表用）—— 返回 {swap: {...}, solo: {...}} */
  function getAllDiariesBothModes(roche) {
    return Promise.all([
      getDiariesByMode(roche, "swap"),
      getDiariesByMode(roche, "solo")
    ]).then(function (results) {
      return { swap: results[0], solo: results[1] };
    });
  }

  /* ---------- 旧数据迁移 ---------- */
  function migrateOldDiariesIfNeeded(roche) {
    return roche.storage.get(MIGRATED_KEY).then(function (done) {
      if (done) return;  // 已迁移过
      return roche.storage.get(STORAGE_DIARIES).then(function (oldAll) {
        if (!oldAll || typeof oldAll !== "object") {
          return roche.storage.set(MIGRATED_KEY, true);
        }
        var swapAll = {}, soloAll = {};
        Object.keys(oldAll).forEach(function (k) {
          var it = oldAll[k];
          // 旧日记没有 mode 字段：根据 userDiary 是否有内容判断
          // 有 userDiary 的归交换日记，否则归 char 独自日记
          var mode = (it.userDiary && it.userDiary.trim()) ? "swap" : "solo";
          it.mode = mode;
          if (mode === "swap") swapAll[k] = it;
          else soloAll[k] = it;
        });
        return Promise.all([
          roche.storage.set(STORAGE_DIARIES_SWAP, swapAll),
          roche.storage.set(STORAGE_DIARIES_SOLO, soloAll),
          roche.storage.set(MIGRATED_KEY, true)
        ]);
      });
    }).catch(function () {});
  }

  /* ---------- 周期整理存储（按周/半月/月整理的日记） ----------
   * 独立存储键，与 solo/swap 分开
   * key 格式: "<cid>:<periodKey>"，periodKey 如 "2026-W30"、"2026-H2-07"、"2026-07"
   * 数据结构: { ..., period: "week"|"halfmonth"|"month", periodKey, dateRange: [startKey, endKey], source: "chat"|"daily", sourceDiaries: [dateKey,...] }
   */
  var STORAGE_DIARIES_PERIOD = "dms-diaries-period";

  function getPeriodDiaries(roche) {
    return roche.storage.get(STORAGE_DIARIES_PERIOD).then(function (s) { return s || {}; }).catch(function () { return {}; });
  }
  function savePeriodDiary(roche, key, data) {
    return getPeriodDiaries(roche).then(function (all) {
      all[key] = data;
      return roche.storage.set(STORAGE_DIARIES_PERIOD, all);
    });
  }
  function deletePeriodDiary(roche, key) {
    return getPeriodDiaries(roche).then(function (all) {
      delete all[key];
      return roche.storage.set(STORAGE_DIARIES_PERIOD, all);
    });
  }

  /* 计算 periodKey 和日期范围 */
  function getWeekKey(d) {
    // ISO 周序号
    var x = new Date(d);
    x.setHours(0, 0, 0, 0);
    var day = x.getDay() || 7;  // 周日=7
    var thursday = new Date(x);
    thursday.setDate(x.getDate() + (4 - day));
    var yearStart = new Date(thursday.getFullYear(), 0, 1);
    var weekNum = Math.ceil(((thursday - yearStart) / 86400000 + 1) / 7);
    return thursday.getFullYear() + "-W" + pad2(weekNum);
  }
  function getMonthKey(d) {
    var x = new Date(d);
    return x.getFullYear() + "-" + pad2(x.getMonth() + 1);
  }
  function getHalfMonthKey(d) {
    var x = new Date(d);
    var day = x.getDate();
    var half = day <= 15 ? 1 : 2;
    return x.getFullYear() + "-H" + half + "-" + pad2(x.getMonth() + 1);
  }
  function getPeriodRange(period, dateRef, days) {
    // 返回 [startDateKey, endDateKey] 闭区间
    var d = new Date(dateRef);
    var start, end;
    if (period === "week") {
      var day = d.getDay() || 7;
      start = new Date(d); start.setDate(d.getDate() - day + 1); start.setHours(0,0,0,0);
      end = new Date(start); end.setDate(start.getDate() + 6);
    } else if (period === "halfmonth") {
      var day2 = d.getDate();
      if (day2 <= 15) {
        start = new Date(d.getFullYear(), d.getMonth(), 1);
        end = new Date(d.getFullYear(), d.getMonth(), 15);
      } else {
        start = new Date(d.getFullYear(), d.getMonth(), 16);
        end = new Date(d.getFullYear(), d.getMonth() + 1, 0); // 月末
      }
    } else if (period === "dayN") {
      // 自定义 N 天：以基准日期为终点，向前推 days-1 天
      var n = Math.max(1, parseInt(days, 10) || 1);
      end = new Date(d); end.setHours(0,0,0,0);
      start = new Date(end); start.setDate(end.getDate() - (n - 1));
    } else { // month
      start = new Date(d.getFullYear(), d.getMonth(), 1);
      end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    }
    return [toDateKey(start), toDateKey(end)];
  }
  function getPeriodLabel(period, days) {
    if (period === "dayN") return (parseInt(days, 10) || 1) + "\u5929";
    return period === "week" ? "\u6309\u5468" : period === "halfmonth" ? "\u6309\u534a\u6708" : "\u6309\u6708";
  }

  /* ---------- 周期整理生成函数 ----------
   * period: "week" | "halfmonth" | "month" | "dayN"
   * source: "chat"=整理聊天记录 | "daily"=整理已生成的按日日记
   * dateRef: 基准日期（用于确定周期范围）
   * days: 自定义天数（period="dayN" 时有效）
   */
  function generatePeriodDiary(roche, state, period, source, dateRef, days) {
    var conv = state.selectedConv;
    if (!conv) return Promise.reject(new Error("\u8bf7\u5148\u9009\u62e9\u7b14\u53cb"));
    var cid = conv.conversationId || conv.id;
    var range = getPeriodRange(period, dateRef, days);
    var startKey = range[0], endKey = range[1];
    var periodKey;
    if (period === "dayN") {
      // 自定义天数：直接用起止日期作为 key
      periodKey = startKey + "~" + endKey;
    } else {
      periodKey = period === "week" ? getWeekKey(dateRef)
                  : period === "halfmonth" ? getHalfMonthKey(dateRef)
                  : getMonthKey(dateRef);
    }
    var diaryKey = cid + ":" + periodKey;

    // 构造 ctx（复用 buildCtx，但 dayShort 按范围聚合）
    return buildCtxForRange(roche, state, startKey, endKey, source).then(function (ctx) {
      if (!ctx.dayShort.length && source === "chat") {
        return Promise.reject(new Error("\u8be5\u5468\u671f\u5185\u65e0\u804a\u5929\u8bb0\u5f55"));
      }
      if (source === "daily" && (!ctx.dailyDiaries || !ctx.dailyDiaries.length)) {
        return Promise.reject(new Error("\u8be5\u5468\u671f\u5185\u65e0\u5df2\u751f\u6210\u7684\u6309\u65e5\u65e5\u8bb0"));
      }
      var msgs = buildPeriodDiaryMessages(ctx, state.settings, period, source, startKey, endKey, days);
      return callAI(roche, msgs, 0.7).then(function (text) {
        var diaryData = {
          conversationId: cid,
          charName: ctx.charName,
          userName: ctx.userName,
          dateKey: ctx.dateKey,
          isGroup: ctx.isGroup,
          mode: "period",
          period: period,
          periodDays: (period === "dayN") ? (parseInt(days, 10) || 1) : undefined,
          periodKey: periodKey,
          dateRange: range,
          source: source,
          sourceDiaries: ctx.dailyDiaries ? ctx.dailyDiaries.map(function (d) { return d.dateKey; }) : [],
          charDiary: text || "",
          userDiary: "",
          annotations: [],
          stickers: [],
          charAnnotations: [],
          ctx: ctx,
          createdAt: Date.now(),
          updatedAt: Date.now()
        };
        return savePeriodDiary(roche, diaryKey, diaryData).then(function () {
          return { diaryData: diaryData, diaryKey: diaryKey };
        });
      });
    });
  }

  /* 构造周期范围上下文：聚合聊天记录或已生成的按日日记 */
  function buildCtxForRange(roche, state, startKey, endKey, source) {
    var conv = state.selectedConv;
    var cid = conv.conversationId || conv.id;
    var info = convInfo(conv);
    var startDate = parseDateInput(startKey);
    var endDate = parseDateInput(endKey);

    return Promise.all([
      loadShort(roche, cid, state.settings.messageLimit || 5000),
      loadChar(roche, conv),
      loadPersona(roche, conv),
      loadLong(roche, cid),
      state.settings.useWorldbook ? loadWbText(roche, state.settings) : Promise.resolve(""),
      source === "daily" ? getDiariesByMode(roche, "solo") : Promise.resolve({})
    ]).then(function (results) {
      var allMsgs = results[0];
      var ch = results[1];
      var persona = results[2];
      var mem = results[3];
      var wb = results[4];
      var soloDiaries = results[5] || {};

      // 按日期范围过滤消息
      var startTime = startOfDay(startDate).getTime();
      var endTime = endOfDay(endDate);
      var rangeMsgs = (allMsgs || []).filter(function (m) {
        var t = toMs(m.timestamp);
        return t >= startTime && t < endTime;
      }).sort(function (a, b) { return toMs(a.timestamp) - toMs(b.timestamp); });

      var shortText = msgsToText(rangeMsgs);

      // 收集范围内的按日日记
      var dailyDiaries = [];
      if (source === "daily") {
        Object.keys(soloDiaries).forEach(function (key) {
          var parts = key.split(":");
          if (parts[0] === cid) {
            var dk = parts[1];
            if (dk >= startKey && dk <= endKey) {
              var dd = soloDiaries[key];
              if (dd && dd.charDiary && dd.charDiary.trim()) {
                dailyDiaries.push({ dateKey: dk, charDiary: dd.charDiary, charName: dd.charName });
              }
            }
          }
        });
        dailyDiaries.sort(function (a, b) { return a.dateKey < b.dateKey ? -1 : 1; });
      }

      return {
        conversationId: cid,
        isGroup: info.isGroup,
        userName: persona.name || info.name || "\u7528\u6237",
        userPersona: persona.text || "",
        charName: ch.name || info.name,
        charText: ch.text || "",
        dayShort: rangeMsgs,
        shortText: shortText,
        coreText: mem.core ? coreToText(mem.core) : "",
        factsText: mem.facts ? factsToText(mem.facts) : "",
        wbText: wb || "",
        dateKey: startKey + "~" + endKey,
        dailyDiaries: dailyDiaries
      };
    });
  }

  /* 构造周期整理的 messages */
  function buildPeriodDiaryMessages(ctx, settings, period, source, startKey, endKey, days) {
    var periodLabel = getPeriodLabel(period, days);
    var sys = [];
    sys.push("\u4f60\u662f " + (ctx.charName || "\u89d2\u8272") + "\u3002\u8bf7\u4ee5\u7b2c\u4e00\u4eba\u79f0\u5199\u4e00\u7bc7" + periodLabel + " (" + startKey + " \u81f3 " + endKey + ") \u7684\u65e5\u8bb0\u603b\u7ed3\u3002");
    if (ctx.userPersona) sys.push("\u3010\u7528\u6237\u4eba\u8bbe\u3011" + ctx.userPersona);
    if (ctx.charText) sys.push("\u3010\u89d2\u8272\u4eba\u8bbe\u3011" + ctx.charText);
    if (settings.showCore && ctx.coreText) sys.push("\u3010\u6838\u5fc3\u8bb0\u5fc6\u3011" + ctx.coreText);
    if (settings.showFacts && ctx.factsText) sys.push("\u3010\u4e8b\u5b9e\u8bb0\u5fc6\u3011" + ctx.factsText);
    if (settings.useWorldbook && ctx.wbText) sys.push("\u3010\u4e16\u754c\u4e66\u3011" + ctx.wbText);

    var userMsg = "";
    if (source === "chat") {
      userMsg = "\u3010" + periodLabel + "\u804a\u5929\u8bb0\u5f55 (" + startKey + " \u2014 " + endKey + ")\u3011\n" + (ctx.shortText || "\uff08\u65e0\u8bb0\u5f55\uff09");
    } else {
      userMsg = "\u3010" + periodLabel + "\u6309\u65e5\u65e5\u8bb0\u96c6 (" + startKey + " \u2014 " + endKey + ")\u3011\n";
      (ctx.dailyDiaries || []).forEach(function (d) {
        userMsg += "\n\u3010" + d.dateKey + " " + (d.charName || "") + "\u7684\u65e5\u8bb0\u3011\n" + d.charDiary + "\n";
      });
    }

    if (settings.charThinkingChain) {
      sys.push("\u3010\u601d\u7ef4\u94fe\u3011" + settings.charThinkingChain);
    }
    sys.push("\u8bf7\u7528 " + (ctx.charName || "\u4f60") + " \u7684\u53e3\u543b\u5199\u4e0b\u8fd9\u6bb5\u65f6\u95f4\u7684\u603b\u7ed3\uff0c\u6309\u4e8b\u4ef6\u987a\u5e8f\u6574\u7406\uff0c\u4fdd\u7559\u60c5\u611f\u4e0e\u7ec6\u8282\u3002\u6bcf\u6bb5100~200\u5b57\uff0c3~6\u6bb5\u3002");

    return [
      { role: "system", content: sys.join("\n\n") },
      { role: "user", content: userMsg }
    ];
  }

  /* ---------- 从长期记忆（事实记忆）挑选按日日记 ----------
   * 读取事实记忆，按 when 字段判断是否为按日日记
   * 放宽限制：when 可以是 YYYY-MM-DD、YYYY/MM/DD、YYYY-MM 等格式
   * 按 user 设置的最低字数过滤
   */
  function pickDailyDiariesFromFactMemory(roche, cid, minChars) {
    return loadLong(roche, cid).then(function (lt) {
      var facts = (lt && lt.facts) || [];
      minChars = minChars || 0;
      var picked = [];
      facts.forEach(function (f) {
        var text = f.summaryText || f.action || f.text || "";
        var when = f.when || f.date || f.dateKey || f.createdAt || "";
        // 尝试从 when 中提取 YYYY-MM-DD 格式
        var dateKey = normalizeDateKey(when);
        // 过滤：有日期、文本长度达标
        if (dateKey && text.length >= minChars) {
          picked.push({
            dateKey: dateKey,
            text: text,
            fact: f
          });
        }
      });
      // 按日期排序（新到旧）
      picked.sort(function (a, b) { return a.dateKey > b.dateKey ? -1 : 1; });
      return picked;
    });
  }

  /* 将各种日期格式统一为 YYYY-MM-DD */
  function normalizeDateKey(when) {
    if (!when) return "";
    var s = String(when);
    // 时间戳（毫秒或秒）
    if (/^\d{10,13}$/.test(s)) {
      var ms = s.length === 10 ? parseInt(s, 10) * 1000 : parseInt(s, 10);
      var d = new Date(ms);
      if (!isNaN(d.getTime())) return toDateKey(d);
    }
    // YYYY-MM-DD 或 YYYY/MM/DD
    var m = s.match(/(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/);
    if (m) return m[1] + "-" + pad2(parseInt(m[2], 10)) + "-" + pad2(parseInt(m[3], 10));
    // YYYY-MM
    m = s.match(/(\d{4})[-\/](\d{1,2})/);
    if (m) return m[1] + "-" + pad2(parseInt(m[2], 10)) + "-01";
    // YYYY
    if (/^\d{4}$/.test(s)) return s + "-01-01";
    return "";
  }

  /* ---------- 轮询批量生成按日日记 ----------
   * dates: Array<"YYYY-MM-DD"> 要生成的日期列表
   * onProgress: 可选回调 (currentIndex, total, success, errorMsg)
   * 依次生成，避免并发导致 API 限流
   */
  function batchGenerateDailyDiaries(roche, state, dates, onProgress) {
    var conv = state.selectedConv;
    if (!conv) return Promise.reject(new Error("\u8bf7\u5148\u9009\u62e9\u7b14\u53cb"));
    var cid = conv.conversationId || conv.id;
    var results = [];
    var idx = 0;

    function next() {
      if (idx >= dates.length) {
        return Promise.resolve(results);
      }
      var currentDate = dates[idx];
      var diaryKey = cid + ":" + currentDate;
      var dateObj = parseDateInput(currentDate);

      // 先检查是否已存在
      return getDiaryByMode(roche, "solo", diaryKey).then(function (existing) {
        if (existing && existing.charDiary && !state.overwriteExisting) {
          results.push({ dateKey: currentDate, success: true, skipped: true, msg: "\u5df2\u5b58\u5728\uff0c\u8df3\u8fc7" });
          if (onProgress) onProgress(idx, dates.length, true, "\u5df2\u5b58\u5728\uff0c\u8df3\u8fc7");
          idx++;
          return next();
        }
        // 构造临时 state
        var tempState = Object.assign({}, state);
        tempState.selectedDate = dateObj;
        return buildCtx(roche, tempState, dateObj).then(function (ctx) {
          if (!ctx.dayShort.length) {
            results.push({ dateKey: currentDate, success: false, msg: "\u5f53\u65e5\u65e0\u804a\u5929\u8bb0\u5f55" });
            if (onProgress) onProgress(idx, dates.length, false, "\u5f53\u65e5\u65e0\u804a\u5927\u8bb0\u5f55");
            idx++;
            return next();
          }
          return generateCharDiary(roche, ctx, state.settings).then(function (text) {
            var diaryData = {
              conversationId: ctx.conversationId,
              charName: ctx.charName,
              userName: ctx.userName,
              dateKey: ctx.dateKey,
              isGroup: ctx.isGroup,
              mode: "solo",
              charDiary: text || "",
              userDiary: "",
              annotations: [],
              stickers: [],
              charAnnotations: [],
              ctx: ctx,
              createdAt: Date.now(),
              updatedAt: Date.now()
            };
            return saveDiaryByMode(roche, "solo", diaryKey, diaryData).then(function () {
              results.push({ dateKey: currentDate, success: true, msg: "\u751f\u6210\u6210\u529f" });
              if (onProgress) onProgress(idx, dates.length, true, "\u751f\u6210\u6210\u529f");
              idx++;
              return next();
            });
          });
        }).catch(function (e) {
          results.push({ dateKey: currentDate, success: false, msg: e && e.message || String(e) });
          if (onProgress) onProgress(idx, dates.length, false, e && e.message || String(e));
          idx++;
          return next();
        });
      });
    }

    return next();
  }

  /* 辅助：列出会话中有聊天记录的日期（用于轮询选天） */
  function listAvailableDates(roche, state) {
    var conv = state.selectedConv;
    if (!conv) return Promise.resolve([]);
    var cid = conv.conversationId || conv.id;
    return loadShort(roche, cid, state.settings.messageLimit || 5000).then(function (msgs) {
      return coveredDays(msgs);
    });
  }

  /* ---------- 表情包库存储 ----------
   * 结构:
   * { groups: [{id, name, stickers:[{id,url,caption}]}],
   *   sessionGroups: { "<cid>": [groupId, ...] } }
   * 一个会话可挂载多个组，被挂载组的表情包合并显示
   */
  function defaultStickerLib() {
    return { groups: [], sessionGroups: {} };
  }
  function getStickerLib(roche) {
    return roche.storage.get(STORAGE_STICKERS).then(function (s) {
      return s || defaultStickerLib();
    }).catch(function () { return defaultStickerLib(); });
  }
  function saveStickerLib(roche, lib) {
    return roche.storage.set(STORAGE_STICKERS, lib);
  }
  // 取某会话挂载的所有组的表情包（合并）
  function getStickersForConv(lib, cid) {
    var ids = (lib.sessionGroups && lib.sessionGroups[cid]) || [];
    var out = [];
    ids.forEach(function (gid) {
      var g = lib.groups.filter(function (x) { return x.id === gid; })[0];
      if (g) out = out.concat(g.stickers || []);
    });
    return out;
  }

  /* ---------- user自定义便签样式存储 ----------
   * 结构: [{ id, name, css }]
   * css 是 user 输入的 CSS 字符串，应用时为 .dms-sticky.custom-{id} 注入
   */
  function getCustomNoteStyles(roche) {
    return roche.storage.get(STORAGE_CUSTOM_NOTES).then(function (s) {
      return s || [];
    }).catch(function () { return []; });
  }
  function saveCustomNoteStyles(roche, list) {
    return roche.storage.set(STORAGE_CUSTOM_NOTES, list);
  }
  // 注入自定义便签 CSS 到 <style>
  function applyCustomNoteStyles(list) {
    var tag = document.getElementById(STYLE_ID + "-custom-notes");
    if (!tag) {
      tag = document.createElement("style");
      tag.id = STYLE_ID + "-custom-notes";
      document.head.appendChild(tag);
    }
    var prefix = "." + ROOT_CLASS + " .dms-sticky.custom-";
    var css = (list || []).map(function (s) {
      return prefix + s.id + "{" + (s.css || "") + "}";
    }).join("\n");
    tag.textContent = css;
  }

  /* ---------- 思维链/格式预设存储 ----------
   * 结构: { charPresets: [{id, name, chain, format}], userPresets: [{id, name, chain, format}] }
   */
  function getPresets(roche) {
    return roche.storage.get(STORAGE_PRESETS).then(function (s) {
      return s || { charPresets: [], userPresets: [] };
    }).catch(function () { return { charPresets: [], userPresets: [] }; });
  }
  function savePresets(roche, p) {
    return roche.storage.set(STORAGE_PRESETS, p);
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
      "/* ===== 全局变量（保证挂在 body 上的弹窗也能拿到）===== */",
      ":root.dms-vars{",
      "  --paper:#FAF3E3; --paper-2:#F5EDD0; --paper-3:#EDE0C8;",
      "  --line:rgba(180,160,110,0.25);",
      "  --ink:#4A3C28; --ink-dim:#7A6A50; --ink-mute:#B0A080;",
      "  --red:#C44536; --blue:#3A6B8A; --green:#7B8F5C; --purple:#8B5E83;",
      "  --tape-pink:rgba(232,160,160,0.65); --tape-blue:rgba(160,196,232,0.65);",
      "  --tape-green:rgba(196,232,160,0.65); --tape-yellow:rgba(232,210,160,0.65);",
      "  --shadow:0 2px 12px rgba(74,60,40,0.12);",
      "  --shadow-strong:0 4px 20px rgba(74,60,40,0.2);",
      "  --radius:6px; --radius-sm:4px;",
      "  --font-serif:'Noto Serif SC','Songti SC','STSong',serif;",
      "  --font-hand:'Ma Shan Zheng','Noto Serif SC',serif;",
      "}",
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
      "",
      "/* ===== 弹窗组件全局样式（挂在 body 上，不依赖 ROOT_CLASS）===== */",
      ".dms-sticker-picker.dms-float, .dms-sticky-style-popup.dms-float, .dms-annot-menu.dms-float, .dms-sync-overlay.dms-float, .dms-mount-dialog.dms-float, .dms-toast.dms-float{",
      "  color:var(--ink);font-family:var(--font-serif);box-sizing:border-box;position:fixed;",
      "}",
      ".dms-sticker-picker.dms-float{",
      "  background:var(--paper);border:1px solid var(--line);border-radius:var(--radius);box-shadow:var(--shadow-strong);",
      "  left:50%;bottom:16px;transform:translateX(-50%);z-index:300;",
      "}",
      ".dms-sticky-style-popup.dms-float{",
      "  background:var(--paper);border:1px solid var(--line);border-radius:var(--radius);box-shadow:var(--shadow-strong);",
      "  z-index:220;",
      "}",
      ".dms-annot-menu.dms-float{",
      "  background:var(--paper);border:1px solid var(--line);border-radius:var(--radius);box-shadow:var(--shadow-strong);",
      "  padding:8px;display:flex;gap:4px;align-items:center;flex-wrap:wrap;z-index:200;",
      "}",
      ".dms-sync-overlay.dms-float{",
      "  background:rgba(74,60,40,0.45);backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);",
      "  display:flex;align-items:center;justify-content:center;padding:16px;inset:0;z-index:250;",
      "}",
      ".dms-sync-overlay.dms-float .dms-card{",
      "  background:var(--paper);border-radius:var(--radius);box-shadow:var(--shadow-strong);padding:18px;max-width:420px;width:92%;max-height:85vh;overflow-y:auto;",
      "  border:1px solid var(--line);",
      "}",
      ".dms-mount-dialog.dms-float{",
      "  background:var(--paper);border-radius:var(--radius);box-shadow:var(--shadow-strong);padding:16px;",
      "  border:1px solid var(--line);color:var(--ink);",
      "  left:50%;top:50%;transform:translate(-50%,-50%);z-index:260;",
      "}",
      ".dms-toast.dms-float{",
      "  background:rgba(74,60,40,0.92);color:var(--paper);padding:8px 14px;border-radius:var(--radius-sm);",
      "  font-size:12px;font-family:var(--font-serif);box-shadow:var(--shadow-strong);",
      "}",
      ".dms-float .dms-btn{",
      "  font-family:var(--font-serif);cursor:pointer;border-radius:var(--radius-sm);transition:all .15s ease;",
      "}",
      ".dms-float .dms-btn-primary{background:var(--red);color:#FAF3E3;border:1px solid var(--red);padding:6px 12px;font-size:12px;}",
      ".dms-float .dms-btn-primary:hover{filter:brightness(1.05);}",
      ".dms-float .dms-btn-ghost{background:transparent;color:var(--ink);border:1px solid var(--line);padding:6px 12px;font-size:12px;}",
      ".dms-float .dms-btn-ghost:hover{background:var(--paper-2);}",
      ".dms-float .dms-btn-sm{padding:4px 8px;font-size:11px;}",
      ".dms-float .dms-tool-btn{",
      "  background:var(--paper-2);color:var(--ink);border:1px solid var(--line);padding:6px 10px;font-size:12px;",
      "  border-radius:var(--radius-sm);cursor:pointer;font-family:var(--font-serif);",
      "}",
      ".dms-float .dms-tool-btn:hover{background:var(--paper-3);border-color:var(--red);color:var(--red);}",
      ".dms-float .dms-textarea, .dms-float .dms-annot-input{",
      "  font-family:var(--font-serif);color:var(--ink);background:var(--paper-2);",
      "  border:1px solid var(--line);border-radius:var(--radius-sm);padding:8px 10px;font-size:13px;outline:none;width:100%;",
      "}",
      ".dms-float .dms-textarea:focus, .dms-float .dms-annot-input:focus{border-color:var(--red);}",
      ".dms-float .dms-hint{color:var(--ink-mute);font-size:11px;line-height:1.5;}",
      ".dms-float .dms-page-title{font-size:15px;font-weight:600;color:var(--ink);}",
      ".dms-float h3{font-size:14px;font-weight:600;color:var(--ink);margin:0 0 8px 0;}",
      "/* 便签/表情操作菜单（拖拽/换样式/删除）*/",
      ".dms-sticky-action-menu.dms-float{",
      "  background:var(--paper);border:1px solid var(--line);border-radius:var(--radius);box-shadow:var(--shadow-strong);",
      "  padding:8px;min-width:120px;z-index:220;",
      "}",
      ".dms-sticky-action-menu .dms-sticky-action-title{font-size:11px;color:var(--ink-mute);margin-bottom:6px;text-align:center;}",
      ".dms-sticky-action-menu .dms-sticky-action-btns{display:flex;flex-direction:column;gap:4px;}",
      ".dms-sticky-action-menu .dms-btn{width:100%;text-align:center;}",
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
      "." + ROOT_CLASS + " .dms-conv-list{display:flex;flex-direction:column;gap:8px;max-height:240px;overflow-y:auto;padding:2px;}",
      "." + ROOT_CLASS + " .dms-conv-list::-webkit-scrollbar{width:6px;}",
      "." + ROOT_CLASS + " .dms-conv-list::-webkit-scrollbar-thumb{background:var(--tape-pink);border-radius:3px;}",
      "." + ROOT_CLASS + " .dms-conv-list::-webkit-scrollbar-track{background:transparent;}",
      "@keyframes dms-flash-anim{0%,100%{box-shadow:0 0 0 0 rgba(196,69,54,0);}50%{box-shadow:0 0 0 4px rgba(196,69,54,0.35);}}",
      "." + ROOT_CLASS + " .dms-flash{animation:dms-flash-anim 1.2s ease-out 1;border-radius:var(--radius);}",
      "." + ROOT_CLASS + " .dms-hint-box{",
      "  font-size:12px;padding:8px 12px;border-radius:var(--radius-sm);margin-top:6px;",
      "  background:rgba(196,69,54,0.06);border:1px dashed rgba(196,69,54,0.3);color:var(--red);",
      "}",
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
      "/* 手账风底栏按钮：透明背景+墨色文字，悬停浮起 */",
      "." + ROOT_CLASS + " .dms-foot-btn{",
      "  display:inline-flex;align-items:center;gap:4px;cursor:pointer;font-family:inherit;",
      "  background:transparent;border:none;color:var(--ink);font-size:12px;",
      "  padding:6px 10px;border-radius:var(--radius-sm);transition:all .2s ease;",
      "  position:relative;",
      "}",
      "." + ROOT_CLASS + " .dms-foot-btn::after{",
      "  content:'';position:absolute;left:8px;right:8px;bottom:2px;height:1px;",
      "  background:currentColor;opacity:0.25;transition:opacity .2s ease;",
      "}",
      "." + ROOT_CLASS + " .dms-foot-btn:hover{background:rgba(196,69,54,0.06);}",
      "." + ROOT_CLASS + " .dms-foot-btn:hover::after{opacity:0.6;}",
      "." + ROOT_CLASS + " .dms-foot-btn.disabled{opacity:.4;cursor:not-allowed;}",
      "." + ROOT_CLASS + " .dms-foot-btn-icon{font-size:14px;line-height:1;color:var(--ink);}",
      "." + ROOT_CLASS + " .dms-foot-btn-label{font-size:12px;letter-spacing:0.5px;}",
      "/* 主按钮：墨红色描边+胶带感底色 */",
      "." + ROOT_CLASS + " .dms-foot-btn-primary{",
      "  color:var(--red);font-weight:600;",
      "  background:rgba(196,69,54,0.06);",
      "  padding:6px 14px;",
      "}",
      "." + ROOT_CLASS + " .dms-foot-btn-primary::after{background:var(--red);opacity:0.4;}",
      "." + ROOT_CLASS + " .dms-foot-btn-primary:hover{",
      "  background:rgba(196,69,54,0.12);box-shadow:0 1px 4px rgba(196,69,54,0.2);",
      "}",
      "." + ROOT_CLASS + " .dms-foot-btn-primary:hover::after{opacity:0.8;}",
      "." + ROOT_CLASS + " .dms-loading-sm{width:12px;height:12px;border-width:2px;margin-right:2px;}",
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
      "/* ===== 生成状态条 ===== */",
      "." + ROOT_CLASS + " .dms-gen-status{",
      "  display:flex;align-items:center;gap:10px;padding:16px 20px;margin-bottom:16px;",
      "  background:rgba(196,69,54,0.06);border:1px dashed rgba(196,69,54,0.3);border-radius:var(--radius);",
      "  font-size:14px;color:var(--red);",
      "}",
      "." + ROOT_CLASS + " .dms-gen-status .dms-loading{width:18px;height:18px;border-width:2.5px;margin-right:2px;}",
      "." + ROOT_CLASS + " .dms-gen-error{",
      "  display:flex;flex-direction:column;align-items:center;gap:12px;padding:32px 20px;margin-bottom:16px;",
      "  background:rgba(196,69,54,0.04);border:1px solid rgba(196,69,54,0.15);border-radius:var(--radius);",
      "  text-align:center;",
      "}",
      "." + ROOT_CLASS + " .dms-gen-error-msg{font-size:14px;color:var(--red);}",
      "." + ROOT_CLASS + " .dms-gen-error-hint{font-size:12px;color:var(--ink-mute);}",
      "",
      "/* ===== 日记页面 ===== */",
      "." + ROOT_CLASS + " .dms-diary-spread{display:flex;flex-direction:column;gap:16px;}",
      "  @media(min-width:900px){",
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
      "  position:relative;-webkit-user-select:text;user-select:text;-webkit-touch-callout:default;",
      "}",
      "/* 块：自然段落感，不显示块号标签 */",
      "." + ROOT_CLASS + " .dms-block{position:relative;margin-bottom:10px;padding:2px 4px;transition:background .15s ease;-webkit-user-select:text;user-select:text;}",
      "." + ROOT_CLASS + " .dms-block-gap{margin-top:14px;padding-top:12px;border-top:1px dashed rgba(180,160,110,0.18);}",
      "." + ROOT_CLASS + " .dms-block-text{font-size:14px;line-height:32px;-webkit-user-select:text;user-select:text;}",
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
      // 叠加组合（同一原句多批注）：表白+划掉去下边框，有批注时用蓝色虚线边框
      "." + ROOT_CLASS + " .dms-annot-heart.dms-annot-crossout{border-bottom:none;}",
      "." + ROOT_CLASS + " .dms-annot-heart.dms-annot-comment{border-bottom:1.5px dashed var(--blue);}",
      "." + ROOT_CLASS + " .dms-annot-tooltip{",
      "  position:absolute;bottom:100%;left:50%;transform:translateX(-50%) translateY(-4px);",
      "  background:var(--paper);border:1px solid var(--line);border-radius:var(--radius-sm);",
      "  padding:8px 12px;font-size:12px;color:var(--ink);white-space:nowrap;max-width:240px;",
      "  box-shadow:var(--shadow-strong);z-index:100;opacity:0;pointer-events:none;transition:opacity .15s ease;",
      "  line-height:1.5;white-space:normal;width:max-content;max-width:200px;",
      "}",
      "." + ROOT_CLASS + " .dms-annot:hover .dms-annot-tooltip{opacity:1;}",
      "." + ROOT_CLASS + " .dms-annot .dms-annot-tip-show{opacity:1;pointer-events:auto;}",
      "." + ROOT_CLASS + " .dms-annot::after{",
      "  content:attr(data-marker);font-size:9px;color:var(--red);vertical-align:super;margin-left:2px;",
      "}",
      "",
      "/* ===== 便签 ===== */",
      "." + ROOT_CLASS + " .dms-sticky{",
      "  position:absolute;z-index:5;max-width:180px;min-width:80px;padding:10px 12px;font-size:12px;",
      "  color:var(--ink);box-shadow:2px 3px 8px rgba(74,60,40,0.2);",
      "  border-radius:2px;cursor:move;line-height:1.5;touch-action:none;",
      "  transform:rotate(-1deg);font-family:'Ma Shan Zheng','KaiTi',cursive;",
      "  word-wrap:break-word;word-break:break-word;",
      "  -webkit-user-select:none;user-select:none;",
      "}",
      // 编辑区允许选中文字，但手势仍归便签（不抢滚动）
      "." + ROOT_CLASS + " .dms-sticky [contenteditable]{-webkit-user-select:text;user-select:text;touch-action:none;}",
      "." + ROOT_CLASS + " .dms-sticky.dragging{z-index:20;}",
      "/* 10款内置便签样式 - 每款完全不同的风格 */",
      // 0. 经典便利贴 - 暖黄纸+胶带感
      "." + ROOT_CLASS + " .dms-sticky.note-0{background:linear-gradient(180deg,#FFE4A0 0%,#FFD478 100%);transform:rotate(-1.5deg);border-radius:2px;border-top:6px solid #E6B655;box-shadow:2px 3px 10px rgba(230,182,85,0.3),inset 0 0 0 1px rgba(255,255,255,0.3);}",
      // 1. 樱花信纸 - 粉色+圆角+蕾丝边
      "." + ROOT_CLASS + " .dms-sticky.note-1{background:#FFE0E6;transform:rotate(1.5deg);border-radius:18px 4px 18px 4px;border:2px dashed #E89AAA;box-shadow:0 2px 8px rgba(232,154,154,0.3);position:relative;}",
      // 2. 复古标签 - 牛皮纸+左色带
      "." + ROOT_CLASS + " .dms-sticky.note-2{background:#D4B896;transform:rotate(-2.5deg);border-left:8px solid #5A3825;border-radius:0 4px 4px 0;color:#3D2817;font-family:'Courier New',monospace;box-shadow:2px 3px 8px rgba(90,56,37,0.3);}",
      // 3. 拍立得相纸 - 白底+下宽边
      "." + ROOT_CLASS + " .dms-sticky.note-3{background:#FAF8F0;transform:rotate(1deg);border:1px solid #D8D0B8;border-bottom:18px solid #F0E8D0;border-radius:2px;padding:10px 12px 4px;box-shadow:0 4px 12px rgba(0,0,0,0.12);font-size:11px;color:#5A4632;}",
      // 4. 胶带便条 - 半透明+胶带顶
      "." + ROOT_CLASS + " .dms-sticky.note-4{background:rgba(255,249,196,0.85);backdrop-filter:blur(2px);transform:rotate(-0.5deg);border-radius:2px;box-shadow:0 2px 6px rgba(0,0,0,0.08);}",
      "." + ROOT_CLASS + " .dms-sticky.note-4::before{content:'';position:absolute;top:-6px;left:50%;transform:translateX(-50%) rotate(-3deg);width:60px;height:14px;background:rgba(170,200,150,0.5);border-radius:1px;}",
      // 5. 圆形糖果 - 大圆角+渐变粉
      "." + ROOT_CLASS + " .dms-sticky.note-5{background:radial-gradient(circle at 30% 30%,#FFE0EC,#F8BBD0);transform:rotate(2deg);border-radius:24px;padding:14px 16px;color:#8B3A52;box-shadow:0 3px 10px rgba(139,58,82,0.25);}",
      // 6. 紫色印泥 - 紫底+粗顶边
      "." + ROOT_CLASS + " .dms-sticky.note-6{background:#E1D5F0;transform:rotate(-1.5deg);border-top:5px solid #7B1FA2;border-radius:2px 2px 8px 8px;color:#4A2862;box-shadow:0 2px 8px rgba(123,31,162,0.25);font-style:italic;}",
      // 7. 珊瑚童趣 - 橙底+波浪边
      "." + ROOT_CLASS + " .dms-sticky.note-7{background:#FFCCBC;transform:rotate(0.8deg);border-radius:8px 16px 8px 16px;color:#BF4A2A;box-shadow:2px 3px 10px rgba(255,87,34,0.25);font-weight:500;}",
      // 8. 薄荷药签 - 青底+左侧折角
      "." + ROOT_CLASS + " .dms-sticky.note-8{background:linear-gradient(135deg,#B2DFDB 0%,#80CBC4 100%);transform:rotate(-1deg);border-radius:0 12px 12px 0;color:#1A4A44;padding:10px 14px 10px 16px;box-shadow:0 2px 8px rgba(26,74,68,0.3);}",
      "." + ROOT_CLASS + " .dms-sticky.note-8::before{content:'';position:absolute;top:0;left:0;width:10px;height:50%;background:rgba(255,255,255,0.3);border-radius:0 0 8px 0;}",
      // 9. 柠黄信封 - 黄底+双线边
      "." + ROOT_CLASS + " .dms-sticky.note-9{background:#F5F4C3;transform:rotate(1deg);border:1px solid #827717;outline:2px solid #827717;outline-offset:-5px;border-radius:2px;color:#3D3517;box-shadow:3px 3px 0 #827717,5px 5px 10px rgba(130,119,23,0.25);}",
      // user 自定义样式：.dms-sticky.custom-{id}
      "." + ROOT_CLASS + " .dms-sticky-remove{",
      "  position:absolute;top:-6px;right:-6px;width:16px;height:16px;border-radius:50%;",
      "  background:var(--red);color:#FAF3E3;font-size:10px;display:flex;align-items:center;justify-content:center;",
      "  cursor:pointer;border:none;z-index:10;",
      "}",
      "." + ROOT_CLASS + " .dms-sticky-style-picker{display:flex;gap:6px;flex-wrap:wrap;padding:6px;align-items:center;}",
      "." + ROOT_CLASS + " .dms-sticky-style-item{width:30px;height:30px;border-radius:4px;cursor:pointer;border:2px solid transparent;transition:all .15s;position:relative;overflow:hidden;font-size:9px;display:flex;align-items:center;justify-content:center;text-align:center;}",
      "." + ROOT_CLASS + " .dms-sticky-style-item.active{border-color:var(--red);transform:scale(1.15);}",
      "." + ROOT_CLASS + " .dms-sticky-style-item.custom-item{background:var(--paper-2);border:2px dashed var(--ink-mute);color:var(--ink-dim);font-size:10px;}",
      "." + ROOT_CLASS + " .dms-sticky-style-item.custom-item.active{border-color:var(--red);border-style:solid;}",
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
      "",
      "/* ===== 表情包库 ===== */",
      "." + ROOT_CLASS + " .dms-sticker-box{margin-top:8px;}",
      "." + ROOT_CLASS + " .dms-sticker-group{background:var(--paper-2);border:1px solid var(--line);border-radius:var(--radius-sm);padding:10px;margin-bottom:8px;}",
      "." + ROOT_CLASS + " .dms-sticker-group-head{display:flex;gap:6px;align-items:center;margin-bottom:8px;}",
      "." + ROOT_CLASS + " .dms-sticker-group-name{padding:4px 8px;}",
      "." + ROOT_CLASS + " .dms-sticker-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(72px,1fr));gap:6px;}",
      "." + ROOT_CLASS + " .dms-sticker-cell{position:relative;background:var(--paper);border:1px solid var(--line);border-radius:var(--radius-sm);padding:4px;display:flex;flex-direction:column;align-items:center;gap:2px;}",
      "." + ROOT_CLASS + " .dms-sticker-img{width:56px;height:56px;object-fit:contain;}",
      "." + ROOT_CLASS + " .dms-sticker-caption{font-size:10px;color:var(--ink-mute);text-align:center;line-height:1.2;word-break:break-all;max-height:24px;overflow:hidden;}",
      "." + ROOT_CLASS + " .dms-sticker-cell-del{position:absolute;top:2px;right:2px;width:16px;height:16px;border-radius:50%;background:var(--red);color:#FAF3E3;font-size:10px;border:none;cursor:pointer;display:none;}",
      "." + ROOT_CLASS + " .dms-sticker-cell:hover .dms-sticker-cell-del{display:block;}",
      "",
      "/* ===== 日记贴纸（贴到日记上的表情包）===== */",
      "." + ROOT_CLASS + " .dms-sticker{position:absolute;width:64px;height:64px;cursor:grab;z-index:6;user-select:none;touch-action:none;}",
      "." + ROOT_CLASS + " .dms-sticker img{width:100%;height:100%;object-fit:contain;pointer-events:none;}",
      "." + ROOT_CLASS + " .dms-sticker-cap{position:absolute;bottom:-14px;left:50%;transform:translateX(-50%);font-size:9px;color:var(--ink-mute);background:var(--paper);padding:0 4px;border-radius:3px;white-space:nowrap;max-width:80px;overflow:hidden;text-overflow:ellipsis;}",
      "." + ROOT_CLASS + " .dms-sticker-del{position:absolute;top:-6px;right:-6px;width:16px;height:16px;border-radius:50%;background:var(--red);color:#FAF3E3;font-size:10px;border:none;cursor:pointer;opacity:0;transition:opacity .15s ease;}",
      "." + ROOT_CLASS + " .dms-sticker:hover .dms-sticker-del{opacity:1;}",
      "",
      "/* ===== 表情包选择器（贴表情包弹层）===== */",
      "." + ROOT_CLASS + " .dms-sticker-picker{",
      "  position:fixed;left:50%;bottom:16px;transform:translateX(-50%);z-index:300;",
      "  background:var(--paper);border:1px solid var(--line);border-radius:var(--radius);box-shadow:var(--shadow-strong);",
      "  padding:10px;max-width:90vw;max-height:240px;overflow-y:auto;width:420px;",
      "}",
      "." + ROOT_CLASS + " .dms-sticker-picker-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;}",
      "." + ROOT_CLASS + " .dms-sticker-picker-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(56px,1fr));gap:6px;}",
      "." + ROOT_CLASS + " .dms-sticker-pick{padding:4px;background:var(--paper-2);border:1px solid var(--line);border-radius:var(--radius-sm);cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:2px;}",
      "." + ROOT_CLASS + " .dms-sticker-pick:hover{border-color:var(--red);background:var(--paper-3);}",
      "." + ROOT_CLASS + " .dms-sticker-pick img{width:40px;height:40px;object-fit:contain;}",
      "." + ROOT_CLASS + " .dms-sticker-pick-cap{font-size:9px;color:var(--ink-mute);max-width:56px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}",
      "",
      "/* ===== 批注弹出菜单 ===== */",
      "." + ROOT_CLASS + " .dms-annot-menu{",
      "  position:fixed;z-index:200;background:var(--paper);border:1px solid var(--line);",
      "  border-radius:var(--radius);box-shadow:var(--shadow-strong);padding:8px;",
      "  display:flex;gap:4px;align-items:center;flex-wrap:wrap;",
      "}",
      "." + ROOT_CLASS + " .dms-annot-menu .dms-tool-btn{font-size:12px;padding:6px 10px;}",
      "." + ROOT_CLASS + " .dms-btn-on{background:var(--red)!important;color:#FFF8EC!important;border-color:var(--red)!important;}",
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
      "." + ROOT_CLASS + " .dms-divider{text-align:center;color:var(--ink-mute);font-size:12px;margin:10px 0;letter-spacing:4px;}",
      "",
      "/* ===== 手机端适配 ===== */",
      "@media(max-width:600px){",
      "  ." + ROOT_CLASS + " .dms-wrap{padding:12px 10px 20px;}",
      "  ." + ROOT_CLASS + " .dms-card{padding:14px 12px;margin-bottom:12px;}",
      "  ." + ROOT_CLASS + " .dms-card::before{left:18px;width:44px;}",
      "  ." + ROOT_CLASS + " .dms-card h2{font-size:14px;}",
      "  ." + ROOT_CLASS + " .dms-page-header{padding:10px 12px 6px;flex-wrap:wrap;gap:6px;}",
      "  ." + ROOT_CLASS + " .dms-page-title{font-size:13px;}",
      "  ." + ROOT_CLASS + " .dms-page-body{padding:10px 12px;min-height:160px;}",
      "  ." + ROOT_CLASS + " .dms-diary-text{font-size:13px;line-height:28px;}",
      "  ." + ROOT_CLASS + " .dms-block-text{font-size:13px;line-height:28px;}",
      "  ." + ROOT_CLASS + " .dms-user-diary-edit{font-size:13px;line-height:28px;min-height:200px;padding:8px 10px;}",
      "  ." + ROOT_CLASS + " .dms-btn{padding:8px 14px;font-size:13px;}",
      "  ." + ROOT_CLASS + " .dms-btn-sm{padding:6px 10px;font-size:11px;}",
      "  ." + ROOT_CLASS + " .dms-tool-btn{padding:4px 8px;font-size:11px;}",
      "  ." + ROOT_CLASS + " .dms-annot-menu{min-width:160px;}",
      "  ." + ROOT_CLASS + " .dms-annot-input{font-size:12px;}",
      "  ." + ROOT_CLASS + " .dms-sticker{width:48px;height:48px;}",
      "  ." + ROOT_CLASS + " .dms-sticker img{width:40px;height:40px;}",
      "  ." + ROOT_CLASS + " .dms-sticker-cap{font-size:8px;max-width:64px;}",
      "  ." + ROOT_CLASS + " .dms-sync-dialog{padding:16px;}",
      "  ." + ROOT_CLASS + " .dms-sticker-pick-grid{grid-template-columns:repeat(auto-fill,minmax(56px,1fr));gap:6px;}",
      "  ." + ROOT_CLASS + " .dms-sticker-pick-item{width:56px;height:56px;}",
      "  ." + ROOT_CLASS + " .dms-panel{width:100%;max-width:100%;}",
      "}"
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
      generatingMsg: "",
      lastError: "",
      view: "cover",
      subView: null,        // 交换模式子视图: null(非交换/默认双页) | "userWrite" | "charDiary"
      diaryMode: "solo",     // "swap"=交换日记 | "solo"=char独自日记（决定使用哪个存储）
      periodDialog: null,   // 周期整理对话框: null | "period" | "batch" | "pickFromMemory"
      batchProgress: null,  // 轮询进度: null | {current, total, msg, running}
      currentDiary: null,
      diaryKey: "",
      annotMenuEl: null,
      annotMode: false,     // 批注模式：点亮后点段落即可批注
      undoStack: [],        // 撤销栈：批注/便签/表情修改前的快照
      settingsOpen: false,
      stickerLib: null,
      stickerPickerOpen: false,
      syncDialogShown: false
    };

    /* 10款内置便签样式配置 - 每款完全不同的风格（提前定义，供 buildSettingsPanel 等同步调用使用） */
    var STICKY_STYLES = [
      { id: 0, name: "便利贴", color: "#FFE4A0", css: "note-0", desc: "经典暖黄+胶带感" },
      { id: 1, name: "樱花笺", color: "#FFE0E6", css: "note-1", desc: "粉色圆角+蕾丝边" },
      { id: 2, name: "牛皮纸", color: "#D4B896", css: "note-2", desc: "复古棕底+左色带" },
      { id: 3, name: "拍立得", color: "#FAF8F0", css: "note-3", desc: "白底+下宽边相纸" },
      { id: 4, name: "胶带条", color: "#FFF9C4", css: "note-4", desc: "半透明+顶胶带" },
      { id: 5, name: "糖果圆", color: "#F8BBD0", css: "note-5", desc: "大圆角+渐变粉" },
      { id: 6, name: "紫印泥", color: "#E1D5F0", css: "note-6", desc: "紫底+粗顶边斜体" },
      { id: 7, name: "童趣橙", color: "#FFCCBC", css: "note-7", desc: "橙底+波浪圆角" },
      { id: 8, name: "药签", color: "#B2DFDB", css: "note-8", desc: "青底+左侧折角" },
      { id: 9, name: "柠信封", color: "#F5F4C3", css: "note-9", desc: "黄底+双线边" }
    ];

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
      var subTitle = state.selectedConv
        ? convInfo(state.selectedConv).name + " \u00b7 " + toDateKey(state.selectedDate)
        : "\u4ea4\u6362\u65e5\u8bb0 \u00b7 \u4e92\u76f8\u6279\u6ce8";
      return el("div", { class: "dms-top" }, [
        el("button", { class: "dms-close", onclick: function () {
          if (state.view !== "cover") { state.view = "cover"; state.lastError = ""; renderContent(); }
          else roche.ui.closeApp();
        } }, [state.view !== "cover" ? "\u2039" : "\u00d7"]),
        el("div", { style: { flex: "1" } }, [
          el("h1", {}, ["\u624b\u8d26\u65e5\u8bb0"]),
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

      // 手账风格图标按钮：用小符号代替大块按钮，更融入整体
      function iconBtn(opts) {
        var cls = "dms-foot-btn " + (opts.primary ? "dms-foot-btn-primary" : "") + (opts.disabled ? " disabled" : "");
        var children = [];
        if (opts.loading) children.push(el("span", { class: "dms-loading dms-loading-sm" }));
        else if (opts.icon) children.push(el("span", { class: "dms-foot-btn-icon" }, [opts.icon]));
        if (opts.label) children.push(el("span", { class: "dms-foot-btn-label" }, [opts.label]));
        var btn = el("button", { class: cls, disabled: !!opts.disabled, onclick: opts.onclick }, children);
        return btn;
      }

      if (state.view === "cover") {
        if (state.settings.swapMode) {
          rightBtns.push(iconBtn({
            primary: true,
            disabled: !state.selectedConv || state.generating,
            loading: state.generating,
            icon: state.generating ? null : "\u270d",
            label: state.generating ? (state.generatingMsg || "\u5199\u4e2d") : "\u5199\u6211\u7684\u65e5\u8bb0",
            onclick: function () { onOpenDiary(); }
          }));
        } else {
          rightBtns.push(iconBtn({
            primary: true,
            disabled: !state.selectedConv || state.generating,
            loading: state.generating,
            icon: state.generating ? null : "\u27a7",
            label: state.generating ? (state.generatingMsg || "\u5199\u4e2d") : "\u7ffb\u5f00\u8fd9\u4e00\u9875",
            onclick: function () { onOpenDiary(); }
          }));
        }
      } else if (state.view === "diary") {
        // 交换模式 userWrite 子视图
        if (state.settings.swapMode && state.subView === "userWrite") {
          rightBtns.push(iconBtn({
            icon: "\u2630",
            label: "\u5c01\u9762",
            onclick: function () {
              state.view = "cover"; state.lastError = ""; state.subView = null;
              renderContent();
            }
          }));
          rightBtns.push(iconBtn({
            primary: true,
            disabled: state.generating,
            loading: state.generating,
            icon: state.generating ? null : "\u27a8",
            label: state.generating ? (state.generatingMsg || "\u5199\u4e2d") : "\u5199\u597d\u4e86\uff0c\u7ed9TA\u770b",
            onclick: function () { onUserDiaryDone(); }
          }));
        } else if (state.settings.swapMode && state.subView === "charDiary") {
          rightBtns.push(iconBtn({
            icon: "\u2630",
            label: "\u5c01\u9762",
            onclick: function () {
              state.view = "cover"; state.lastError = ""; state.subView = null; renderContent();
            }
          }));
          rightBtns.push(iconBtn({
            primary: true,
            disabled: state.generating,
            loading: state.generating,
            icon: state.generating ? null : "\u21bb",
            label: state.generating ? (state.generatingMsg || "\u5199\u4e2d") : "\u91cd\u5199TA\u65e5\u8bb0",
            onclick: function () { onOpenDiary(true); }
          }));
        } else {
          // 非交换模式日记视图
          rightBtns.push(iconBtn({
            icon: "\u2630",
            label: "\u5c01\u9762",
            onclick: function () { state.view = "cover"; state.lastError = ""; state.subView = null; renderContent(); }
          }));
          rightBtns.push(iconBtn({
            primary: true,
            disabled: state.generating,
            loading: state.generating,
            icon: state.generating ? null : "\u21bb",
            label: state.generating ? (state.generatingMsg || "\u5199\u4e2d") : "\u91cd\u5199",
            onclick: function () { onOpenDiary(true); }
          }));
        }
      } else if (state.view === "history") {
        rightBtns.push(iconBtn({
          icon: "\u2039",
          label: "\u8fd4\u56de",
          onclick: function () { state.view = "cover"; renderContent(); }
        }));
      }

      return el("div", { class: "dms-footer" }, [
        el("div", { class: "dms-foot-left" }, [leftText]),
        el("div", { style: { display: "flex", gap: "8px" } }, rightBtns)
      ]);
    }

    /* ---------- 内容渲染 ---------- */
    function renderContent() {
      // 清理可能残留在 document.body 上的浮层（便签样式选择器、表情包选择器、批注菜单、同步对话框）
      [".dms-sticky-style-popup", ".dms-sticker-picker", ".dms-annot-menu", ".dms-sync-overlay", ".dms-sticky-action-menu"].forEach(function (sel) {
        var nodes = document.querySelectorAll(sel);
        nodes.forEach(function (n) { n.remove(); });
      });
      var body = qs(".dms-body", root);
      if (!body) return;
      body.innerHTML = "";
      if (state.view === "diary") {
        body.appendChild(buildDiaryView());
      } else if (state.view === "history") {
        body.appendChild(buildHistory());
      } else if (state.view === "periodDialog") {
        body.appendChild(buildPeriodDialogView());
      } else if (state.view === "batchDialog") {
        body.appendChild(buildBatchDialogView());
      } else if (state.view === "pickFromMemoryDialog") {
        body.appendChild(buildPickFromMemoryView());
      } else if (state.view === "periodDiaryView") {
        body.appendChild(buildPeriodDiaryDisplayView());
      } else {
        body.appendChild(buildCover());
      }
      var foot = qs(".dms-footer", root);
      if (foot) foot.remove();
      root.appendChild(buildFooter());
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

      var heroCard = el("div", { class: "dms-card dms-fade-in", style: { textAlign: "center", padding: "28px 16px" } }, [
        el("div", { class: "dms-handwritten", style: { fontSize: "28px", color: "var(--red)", marginBottom: "6px" } }, ["\u624b\u8d26\u65e5\u8bb0"]),
        el("div", { style: { fontSize: "13px", color: "var(--ink-dim)" } }, ["\u4e0e TA \u4ea4\u6362\u5fc3\u58f0\uff0c\u5728\u5f7c\u6b64\u7684\u65e5\u8bb0\u91cc\u7559\u4e0b\u60f3\u6cd5"]),
        el("div", { class: "dms-divider" }, ["\u2767 \u2767 \u2767"])
      ]);
      wrap.appendChild(heroCard);

      // 交换日记开关卡
      var swapCard = el("div", { class: "dms-card dms-fade-in", style: { padding: "14px 16px" } });
      var swapSwitch = makeSwitch(
        "\u4ea4\u6362\u65e5\u8bb0\u6a21\u5f0f",
        "\u5f00\u542f\u540e\uff1a\u4f60\u5148\u5199\u65e5\u8bb0\uff0c\u518d\u8ba9TA\u770b\u5e76\u56de\u5199\uff1b\u5173\u95ed\u5219\u53ea\u770bTA\u7684\u65e5\u8bb0\u3002",
        state.settings.swapMode,
        function (v) {
          state.settings.swapMode = v;
          saveSettings(roche, state.settings);
          var foot = qs(".dms-footer", root);
          if (foot) foot.remove();
          root.appendChild(buildFooter());
        }
      );
      swapCard.appendChild(swapSwitch);
      wrap.appendChild(swapCard);

      // 选择会话
      var convCard = el("div", { class: "dms-card dms-fade-in-delay" }, [
        el("h2", {}, [el("span", { class: "dms-badge" }, ["1"]), " \u9009\u62e9\u7b14\u53cb"]),
        el("div", { class: "dms-card-sub" }, ["\u9009\u62e9\u4e00\u4e2a\u4f1a\u8bdd\uff0c\u5f00\u59cb\u4f60\u4eec\u7684\u4ea4\u6362\u65e5\u8bb0\u3002"])
      ]);
      var convList = el("div", { class: "dms-conv-list", id: "convList" });
      if (!state.conversations.length) {
        convList.appendChild(el("div", { class: "dms-empty" }, ["\u6682\u65e0\u4f1a\u8bdd\u3002"]));
      } else {
        state.conversations.forEach(function (c) {
          var info = convInfo(c);
          var cid = c.conversationId || c.id;
          var active = state.selectedConvId === cid;
          var avatar = info.avatar
            ? el("div", { class: "dms-avatar" }, [el("img", { src: info.avatar })])
            : el("div", { class: "dms-avatar" }, [info.name.slice(0, 1)]);
          convList.appendChild(el("div", {
            class: "dms-conv-item" + (active ? " active" : ""),
            "data-cid": cid,
            onclick: function () {
              if (state.generating) return;
              state.selectedConvId = cid;
              state.selectedConv = c;
              // 只更新选中样式，不全量重建
              var items = convList.querySelectorAll(".dms-conv-item");
              items.forEach(function (it) { it.classList.toggle("active", it.getAttribute("data-cid") === cid); });
              // 异步加载有记录的日期，只更新日期快捷区
              loadShort(roche, cid, 500).then(function (msgs) {
                state.coveredDays = coveredDays(msgs);
                updateDatePills();
              }).catch(function () {});
              // 更新底栏
              var foot = qs(".dms-footer", root);
              if (foot) foot.remove();
              root.appendChild(buildFooter());
              // 启用日期输入并移除"未选会话"提示
              var di = qs("input[type=date]", root);
              if (di) di.disabled = false;
              var hintBox = qs(".dms-hint-box", root);
              if (hintBox) hintBox.remove();
              // 自动滚动到日期卡，让用户看到下一步
              var dateCardEl = qs("#dateRow", root);
              if (dateCardEl && dateCardEl.closest) {
                var card = dateCardEl.closest(".dms-card");
                if (card && card.scrollIntoView) {
                  setTimeout(function () {
                    card.scrollIntoView({ behavior: "smooth", block: "center" });
                    // 高亮提示
                    card.classList.add("dms-flash");
                    setTimeout(function () { card.classList.remove("dms-flash"); }, 1200);
                  }, 80);
                }
              }
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
      // 挂载表情包组入口
      var mountBtn = el("button", { class: "dms-btn dms-btn-sm dms-btn-ghost", style: { marginTop: "8px" }, onclick: function () {
        if (!state.selectedConv) { toast("\u8bf7\u5148\u9009\u62e9\u7b14\u53cb"); return; }
        openStickerMountDialog(state.selectedConv);
      } }, ["\u6302\u8f7d\u8868\u60c5\u5305\u7ec4"]);
      convCard.appendChild(mountBtn);
      wrap.appendChild(convCard);

      // 选择日期
      var dateCard = el("div", { class: "dms-card tape-blue dms-fade-in-delay" }, [
        el("h2", {}, [el("span", { class: "dms-badge" }, ["2"]), " \u7ffb\u5230\u54ea\u4e00\u5929"]),
        el("div", { class: "dms-card-sub" }, ["\u6309\u672c\u5730\u65f6\u533a 00:00 ~ \u6b21\u65e5 00:00 \u5207\u5272\u5f53\u5929\u8bb0\u5f55\u3002"])
      ]);
      // 未选会话时的提示
      if (!state.selectedConv) {
        dateCard.appendChild(el("div", { class: "dms-hint-box" }, ["\u2191 \u8bf7\u5148\u5728\u4e0a\u9762\u9009\u62e9\u7b14\u53cb\uff0c\u9009\u597d\u540e\u8fd9\u91cc\u4f1a\u51fa\u73b0\u65e5\u671f\u9009\u62e9\u3002"]));
      }
      var dateInput = el("input", { type: "date", class: "dms-input" });
      dateInput.value = toDateInput(state.selectedDate);
      dateInput.max = toDateInput(new Date());
      dateInput.disabled = !state.selectedConv;
      dateInput.addEventListener("change", function () {
        if (this.value) state.selectedDate = parseDateInput(this.value);
      });
      var dateRow = el("div", { class: "dms-date-row", id: "dateRow" }, [dateInput]);
      var pillsContainer = el("div", { id: "datePills", style: { marginTop: "8px", display: "flex", gap: "6px", flexWrap: "wrap" } });
      dateRow.appendChild(pillsContainer);
      dateCard.appendChild(dateRow);
      wrap.appendChild(dateCard);
      updateDatePills();

      // 历史入口
      var histCard = el("div", { class: "dms-card tape-green dms-fade-in-delay", style: { cursor: "pointer" }, onclick: function () {
        state.view = "history"; renderContent();
      } }, [
        el("h2", {}, [el("span", { class: "dms-badge" }, ["\u270e"]), " \u5386\u53f2\u65e5\u8bb0"]),
        el("div", { class: "dms-card-sub" }, ["\u67e5\u770b\u4ee5\u524d\u5199\u8fc7\u7684\u65e5\u8bb0\u3002"])
      ]);
      wrap.appendChild(histCard);

      // 高级功能入口
      var advCard = el("div", { class: "dms-card tape-red dms-fade-in-delay" }, [
        el("h2", {}, [el("span", { class: "dms-badge" }, ["\u2605"]), " \u8bb0\u5fc6\u6574\u7406"]),
        el("div", { class: "dms-card-sub" }, ["\u6309\u5468\u671f\u6216\u6279\u91cf\u751f\u6210\u65e5\u8bb0\uff0c\u4ece\u957f\u671f\u8bb0\u5fc6\u6311\u9009\u7d20\u6750\u3002"])
      ]);

      // 周期整理入口
      advCard.appendChild(el("button", {
        class: "dms-btn dms-btn-sm dms-btn-ghost",
        style: { width: "100%", marginTop: "8px", justifyContent: "flex-start" },
        onclick: function () {
          if (!state.selectedConv) { toast("\u8bf7\u5148\u9009\u62e9\u7b14\u53cb"); return; }
          state.view = "periodDialog"; renderContent();
        }
      }, ["\u25cb \u6309\u5468/\u534a\u6708/\u6708\u6574\u7406"]));

      // 轮询生成入口
      advCard.appendChild(el("button", {
        class: "dms-btn dms-btn-sm dms-btn-ghost",
        style: { width: "100%", marginTop: "6px", justifyContent: "flex-start" },
        onclick: function () {
          if (!state.selectedConv) { toast("\u8bf7\u5148\u9009\u62e9\u7b14\u53cb"); return; }
          state.view = "batchDialog"; renderContent();
        }
      }, ["\u25cb \u8f6e\u8be2\u6279\u91cf\u751f\u6210\u6309\u65e5\u65e5\u8bb0"]));

      // 从长期记忆挑选入口
      advCard.appendChild(el("button", {
        class: "dms-btn dms-btn-sm dms-btn-ghost",
        style: { width: "100%", marginTop: "6px", justifyContent: "flex-start" },
        onclick: function () {
          if (!state.selectedConv) { toast("\u8bf7\u5148\u9009\u62e9\u7b14\u53cb"); return; }
          state.view = "pickFromMemoryDialog"; renderContent();
        }
      }, ["\u25cb \u4ece\u957f\u671f\u8bb0\u5fc6\u6311\u9009\u6309\u65e5\u65e5\u8bb0"]));

      wrap.appendChild(advCard);

      return wrap;
    }

    function updateDatePills() {
      var pillsContainer = qs("#datePills", root);
      if (!pillsContainer) return;
      pillsContainer.innerHTML = "";
      if (!state.coveredDays.length) return;
      pillsContainer.appendChild(el("span", { style: { fontSize: "11px", color: "var(--ink-mute)", alignSelf: "center" } }, ["\u6709\u8bb0\u5f55\u7684\u65e5\u671f:"]));
      state.coveredDays.slice(0, 8).forEach(function (dk) {
        var pill = el("span", { class: "dms-pill" }, [dk]);
        pill.addEventListener("click", function () {
          state.selectedDate = parseDateInput(dk);
          var di = qs("input[type=date]", root);
          if (di) di.value = dk;
        });
        pillsContainer.appendChild(pill);
      });
    }

    /* ---------- 日记视图 ---------- */
    function buildDiaryView() {
      var wrap = el("div", { class: "dms-wrap dms-page-anim" });

      // 生成中状态
      if (state.generating) {
        wrap.appendChild(el("div", { class: "dms-gen-status" }, [
          el("span", { class: "dms-loading" }),
          el("span", { class: "dms-handwritten", style: { fontSize: "16px" } }, [state.generatingMsg || "\u6b63\u5728\u4e66\u5199\u4e2d\u2026"]),
          el("span", { style: { fontSize: "12px", color: "var(--ink-mute)", marginLeft: "auto" } }, ["\u8bf7\u7a0d\u5019\uff0cTA \u6b63\u5728\u56de\u5fc6\u4eca\u5929"])
        ]));
        return wrap;
      }

      // 生成失败，显示重试
      if (state.lastError && !state.currentDiary) {
        wrap.appendChild(el("div", { class: "dms-gen-error" }, [
          el("div", { class: "dms-gen-error-msg" }, ["\u26a0 \u4e66\u5199\u5931\u8d25"]),
          el("div", { class: "dms-gen-error-hint" }, [state.lastError]),
          el("button", { class: "dms-btn dms-btn-primary", onclick: function () { onOpenDiary(true); } }, ["\u91cd\u65b0\u4e66\u5199"])
        ]));
        return wrap;
      }

      if (!state.currentDiary) {
        wrap.appendChild(el("div", { class: "dms-empty" }, ["\u65e5\u8bb0\u52a0\u8f7d\u4e2d\u2026"]));
        return wrap;
      }

      // 交换模式第一步：user 先写日记
      if (state.settings.swapMode && state.subView === "userWrite") {
        return buildUserWriteView();
      }

      // 默认（非交换 或 charDiary）：双页视图
      return buildDiarySpreadView();
    }

    /* ---------- 交换模式 - user 写日记视图 ---------- */
    function buildUserWriteView() {
      var wrap = el("div", { class: "dms-wrap dms-page-anim" });
      var diary = state.currentDiary;

      // 引导卡片
      var intro = el("div", { class: "dms-card dms-fade-in", style: { textAlign: "center", padding: "16px" } }, [
        el("div", { class: "dms-handwritten", style: { fontSize: "22px", color: "var(--red)", marginBottom: "6px" } },
          ["\u5148\u5199\u4e0b\u4f60\u7684\u65e5\u8bb0"]),
        el("div", { style: { fontSize: "12px", color: "var(--ink-dim)" } },
          ["\u5199\u597d\u540e\uff0c\u70b9\u201c\u5199\u597d\u4e86\u201d\u8ba9 TA \u770b\u5e76\u56de\u5199 TA \u7684\u65e5\u8bb0"]),
        el("div", { class: "dms-divider" }, ["\u2767 \u2767 \u2767"])
      ]);
      wrap.appendChild(intro);

      // 编辑器卡片
      var editCard = el("div", { class: "dms-card tape-blue dms-fade-in-delay" });
      editCard.appendChild(el("div", { class: "dms-page-header" }, [
        el("div", {}, [
          el("div", { class: "dms-page-title" }, [(diary.userName || "\u6211") + " \u7684\u65e5\u8bb0"]),
          el("div", { class: "dms-page-meta" }, [diary.dateKey || toDateKey(state.selectedDate)])
        ]),
        el("div", { style: { display: "flex", gap: "4px" } }, [
          el("button", { class: "dms-tool-btn", onclick: function () {
            if (state.currentDiary) {
              state.currentDiary.userDiary = "";
              state.currentDiary.userDiaryAt = Date.now();
              saveCurrentDiary().then(function () { renderContent(); });
            }
          } }, ["\u6e05\u7a7a"])
        ])
      ]));
      var editBody = el("div", { class: "dms-page-body", style: { minHeight: "320px" } });
      var editArea = el("textarea", {
        class: "dms-user-diary-edit",
        style: { minHeight: "320px" },
        placeholder: "\u5728\u8fd9\u91cc\u5199\u4e0b\u4f60\u7684\u65e5\u8bb0\u2026\n\u7528\u4f60\u81ea\u5df1\u7684\u8bdd\uff0c\u8bb0\u4e0b\u4eca\u5929\u7684\u5fc3\u58f0\u3002\n\u5199\u5b8c\u540e\u70b9\u201c\u5199\u597d\u4e86\u201d\uff0cTA \u4f1a\u770b\u5230\u5e76\u56de\u5199\u3002",
        oninput: function () {
          state.currentDiary.userDiary = this.value;
          state.currentDiary.userDiaryAt = Date.now();
          saveCurrentDiary();
        }
      });
      editArea.value = diary.userDiary || "";
      editBody.appendChild(editArea);
      editCard.appendChild(editBody);
      wrap.appendChild(editCard);

      return wrap;
    }

    /* ---------- 双页日记视图（非交换模式 / 交换模式 charDiary）---------- */
    function buildDiarySpreadView() {
      var wrap = el("div", { class: "dms-wrap dms-page-anim" });
      var diary = state.currentDiary;
      var spread = el("div", { class: "dms-diary-spread" });

      // ===== 左页：TA 的日记 =====
      var charPage = el("div", { class: "dms-diary-page" });
      charPage.appendChild(el("div", { class: "dms-page-header" }, [
        el("div", {}, [
          el("div", { class: "dms-page-title" }, [(diary.charName || "TA") + " \u7684\u65e5\u8bb0"]),
          el("div", { class: "dms-page-meta" }, [diary.dateKey])
        ]),
        el("div", { style: { display: "flex", gap: "4px" } }, [
          el("button", { class: "dms-tool-btn" + (state.annotMode ? " dms-btn-on" : ""), title: "\u70b9\u4eae\u540e\u70b9\u4e00\u4e0b\u60f3\u6279\u6ce8\u7684\u6bb5\u843d", onclick: function () {
            state.annotMode = !state.annotMode;
            this.classList.toggle("dms-btn-on", state.annotMode);
            state.annotBtnEl = this;
            toast(state.annotMode ? "\u6279\u6ce8\u6a21\u5f0f\uff1a\u70b9\u4e00\u4e0b\u60f3\u6279\u6ce8\u7684\u6bb5\u843d" : "\u5df2\u9000\u51fa\u6279\u6ce8\u6a21\u5f0f");
          } }, ["\u6279\u6ce8"]),
          el("button", { class: "dms-tool-btn", onclick: function () { addStickyNote(charPage); } }, ["\u4fbf\u7b7e"]),
          el("button", { class: "dms-tool-btn", onclick: function () { openStickerPicker(charPage); } }, ["\u8868\u60c5"]),
          el("button", { class: "dms-tool-btn", title: "\u64a4\u9500\u4e0a\u4e00\u6b21\u64cd\u4f5c", onclick: function () { undoLast(); } }, ["\u64a4\u9500"])
        ])
      ]));

      var charBody = el("div", { class: "dms-page-body" });
      var charTextEl = el("div", { class: "dms-diary-text", id: "charDiaryText" });
      renderAnnotatedText(charTextEl, diary.charDiary || "", diary.annotations || []);
      charBody.appendChild(charTextEl);

      (diary.annotations || []).filter(function (a) { return a.type === "sticky"; }).forEach(function (a) {
        charBody.appendChild(makeStickyNote(a, charPage));
      });
      (diary.stickers || []).forEach(function (s) {
        charBody.appendChild(makeSticker(s, charPage));
      });

      charPage.appendChild(charBody);
      setupTextSelection(charTextEl, charPage);
      spread.appendChild(charPage);

      // ===== 右页：我的日记 =====
      var userPage = el("div", { class: "dms-diary-page" });
      userPage.appendChild(el("div", { class: "dms-page-header" }, [
        el("div", {}, [
          el("div", { class: "dms-page-title" }, [(diary.userName || "\u6211") + " \u7684\u65e5\u8bb0"]),
          el("div", { class: "dms-page-meta" }, [diary.dateKey])
        ]),
        el("div", { style: { display: "flex", gap: "4px" } }, [
          el("button", { class: "dms-tool-btn", title: "\u5207\u6362 TA \u4fbf\u7b7e\u663e\u9690", onclick: function () {
            state.settings.hideCharStickies = !state.settings.hideCharStickies;
            saveSettings(roche, state.settings);
            renderContent();
            toast(state.settings.hideCharStickies ? "\u5df2\u9690\u85cf TA \u7684\u4fbf\u7b7e" : "\u5df2\u663e\u793a TA \u7684\u4fbf\u7b7e");
          } }, [state.settings.hideCharStickies ? "\u663e\u793a\u4fbf\u7b7e" : "\u9690\u85cf\u4fbf\u7b7e"]),
          el("button", { class: "dms-tool-btn", onclick: function () { onCharAnnotate(); } }, ["\u8ba9TA\u6279\u6ce8"])
        ])
      ]));

      var userBody = el("div", { class: "dms-page-body" });
      var userDiaryText = diary.userDiary || "";

      // user 日记只读显示（如果有批注，渲染批注）
      var userTextEl = el("div", { class: "dms-diary-text", id: "userDiaryText" });
      if (userDiaryText.trim() && diary.charAnnotations && diary.charAnnotations.length > 0) {
        renderAnnotatedText(userTextEl, userDiaryText, diary.charAnnotations);
      } else if (userDiaryText.trim()) {
        userTextEl.textContent = userDiaryText;
      } else {
        userTextEl.style.display = "none";
      }
      userBody.appendChild(userTextEl);
      // 允许 user 在自己的日记上选文字（供 char 批注使用，或 user 自己标记）
      setupTextSelection(userTextEl, userPage);

      // char 给 user 的便签（type=sticky）作为实物便签 DOM 渲染到 user 页
      // 受 hideCharStickies 开关控制：开启时只隐藏不渲染，但数据保留用于注入记忆
      var charStickies = (diary.charAnnotations || []).filter(function (a) { return a.type === "sticky"; });
      if (!state.settings.hideCharStickies) {
        charStickies.forEach(function (a) {
          userBody.appendChild(makeStickyNote(a, userPage));
        });
      }
      // char 给 user 贴的表情包（如果有）
      (diary.charStickers || []).forEach(function (s) {
        userBody.appendChild(makeSticker(s, userPage));
      });

      // 非交换模式：显示可编辑区
      // 交换模式 charDiary：显示只读区（user 日记已写完）
      if (state.settings.swapMode && state.subView === "charDiary") {
        if (!userDiaryText.trim()) {
          userBody.appendChild(el("div", { class: "dms-empty", style: { padding: "20px 0" } }, ["\uff08\u8fd8\u6ca1\u5199\u65e5\u8bb0\uff09"]));
        }
      } else {
        // 非交换模式：保留可编辑 textarea
        var editArea = el("textarea", {
          class: "dms-user-diary-edit",
          placeholder: "\u5728\u8fd9\u91cc\u5199\u4e0b\u4f60\u7684\u65e5\u8bb0\u2026\n\u7528\u4f60\u81ea\u5df1\u7684\u8bdd\uff0c\u8bb0\u4e0b\u4eca\u5929\u7684\u5fc3\u58f0\u3002",
          oninput: function () {
            state.currentDiary.userDiary = this.value;
            state.currentDiary.userDiaryAt = Date.now();
            saveCurrentDiary();
          }
        });
        editArea.value = userDiaryText;
        userBody.appendChild(editArea);

        if (!userDiaryText.trim()) {
          userBody.appendChild(el("div", { style: { marginTop: "8px", fontSize: "12px", color: "var(--ink-mute)", fontStyle: "italic", textAlign: "center" } }, ["\u2712 \u8fd9\u91cc\u662f\u4f60\u7684\u624b\u5199\u533a\uff0c\u5c3d\u60c5\u5199\u4e0b\u5fc3\u58f0\u5427"]));
        }
      }

      userPage.appendChild(userBody);
      spread.appendChild(userPage);

      wrap.appendChild(spread);

      // 底部操作条
      var actionBtns = [
        el("button", { class: "dms-btn dms-btn-sm", onclick: function () {
          navigator.clipboard.writeText(diary.charDiary || "").then(function () { toast("\u5df2\u590d\u5236TA\u7684\u65e5\u8bb0"); }).catch(function () { toast("\u590d\u5236\u5931\u8d25"); });
        } }, ["\u590d\u5236TA\u65e5\u8bb0"]),
        el("button", { class: "dms-btn dms-btn-sm", onclick: function () {
          if (!state.currentDiary) return;
          var ctx = state.currentDiary.ctx || {};
          var text = state.currentDiary.charDiary || "";
          roche.ui.confirm({ title: "\u540c\u6b65\u5230\u4e8b\u5b9e\u8bb0\u5fc6", message: "\u5c06\u628aTA\u7684\u65e5\u8bb0\u5199\u5165\u4e3b\u4e8b\u5b9e\u8bb0\u5fc6\u3002\u4e3b\u8bb0\u5fc6\u4e0d\u4f1a\u968f\u63d2\u4ef6\u5378\u8f7d\u800c\u5220\u9664\uff0c\u662f\u5426\u7ee7\u7eed\uff1f" }).then(function (ok) {
            if (!ok) return;
            toast("\u540c\u6b65\u4e2d\u2026");
            return syncFact(roche, ctx, text).then(function () { toast("\u5df2\u5199\u5165\u4e8b\u5b9e\u8bb0\u5fc6"); }).catch(function () { toast("\u5199\u5165\u5931\u8d25"); });
          });
        } }, ["\u540c\u6b65\u5230\u4e8b\u5b9e\u8bb0\u5fc6"])
      ];

      // 交换模式 charDiary：额外按钮
      if (state.settings.swapMode && state.subView === "charDiary") {
        actionBtns.push(el("button", {
          class: "dms-btn dms-btn-sm",
          onclick: function () {
            state.subView = "userWrite";
            renderContent();
          }
        }, ["\u4fee\u6539\u6211\u7684\u65e5\u8bb0"]));
        // 完成交换按钮：注入短期记忆
        actionBtns.push(el("button", {
          class: "dms-btn dms-btn-sm dms-btn-primary",
          onclick: function () {
            if (!state.currentDiary) return;
            var ctx = state.currentDiary.ctx || {};
            roche.ui.confirm({
              title: "\u5b8c\u6210\u4ea4\u6362",
              message: "\u5c06\u628a\u6574\u7bc7\u4ea4\u6362\u65e5\u8bb0\u4f5c\u4e3a\u6d88\u606f\u6ce8\u5165\u4e3b\u804a\u5929\uff0c\u8ba9 TA \u80fd\u770b\u5230\u5e76\u56de\u5e94\u3002\u662f\u5426\u7ee7\u7eed\uff1f"
            }).then(function (ok) {
              if (!ok) return;
              toast("\u6b63\u5728\u6ce8\u5165\u2026");
              return saveCurrentDiary().then(function () {
                return syncShortTerm(roche, ctx, state.currentDiary);
              }).then(function () {
                toast("\u5df2\u6ce8\u5165\u5230\u4e3b\u804a\u5929");
              }).catch(function () { toast("\u6ce8\u5165\u5931\u8d25"); });
            });
          }
        }, ["\u5b8c\u6210\u4ea4\u6362"]));
      }

      actionBtns.push(el("button", { class: "dms-btn dms-btn-sm", onclick: function () {
        if (!state.currentDiary) return;
        roche.ui.confirm({ title: "\u5220\u9664\u65e5\u8bb0", message: "\u5220\u9664\u8fd9\u7bc7\u65e5\u8bb0\u53ca\u6240\u6709\u6279\u6ce8\uff1f" }).then(function (ok) {
          if (!ok) return;
          deleteDiaryByMode(roche, state.currentDiary.mode || state.diaryMode, state.diaryKey).then(function () { toast("\u5df2\u5220\u9664"); state.view = "cover"; state.currentDiary = null; state.subView = null; renderContent(); });
        });
      } }, ["\u5220\u9664\u65e5\u8bb0"]));

      var actionBar = el("div", { class: "dms-card", style: { marginTop: "16px" } }, [
        el("div", { style: { display: "flex", gap: "8px", flexWrap: "wrap" } }, actionBtns)
      ]);
      wrap.appendChild(actionBar);

      return wrap;
    }

    /* ---------- 分块解析 ---------- */
    // 把带【块X】标记的文本解析成 [{id:"A", title:"块A", content:"..."}]
    // 若无块标记，整体作为一块返回
    function parseBlocks(text) {
      // 按纯换行分段（连续空行合并），每段即一个"段落"，便签/表情包吸附相邻段落
      if (!text) return [];
      var rawBlocks = text.split(/\n+/);
      var blocks = [];
      var globalPos = 0;
      rawBlocks.forEach(function (line, idx) {
        var content = line.trim();
        if (!content) { globalPos += line.length + 1; return; }
        blocks.push({
          id: "p" + idx,               // 段落 id
          idx: idx,
          content: content,
          start: globalPos,
          end: globalPos + line.length
        });
        globalPos += line.length + 1; // +1 for newline
      });
      return blocks;
    }

    // 全局字符位置 → 段落 id（用于批注/sticker 关联段落）
    function blockOfPos(blocks, globalPos) {
      for (var i = 0; i < blocks.length; i++) {
        if (globalPos < blocks[i].end) return blocks[i].id;
      }
      return blocks.length ? blocks[blocks.length - 1].id : null;
    }

    /* ---------- 批注渲染（按段落） ---------- */
    function renderAnnotatedText(container, text, annotations) {
      container.innerHTML = "";
      if (!text) {
        container.appendChild(el("div", { class: "dms-empty" }, ["\uff08\u5c1a\u672a\u5199\u65e5\u8bb0\uff09"]));
        return;
      }

      var blocks = parseBlocks(text);

      var textAnnots = (annotations || []).filter(function (a) {
        return a.selectedText && a.type !== "sticky";
      }).map(function (a) {
        var idx = text.indexOf(a.selectedText);
        return {
          id: a.id, type: a.type, comment: a.comment,
          selectedText: a.selectedText,
          blockId: a.blockId || (idx >= 0 ? blockOfPos(blocks, idx) : null),
          start: idx,
          end: idx + a.selectedText.length
        };
      }).filter(function (a) { return a.start >= 0; })
        .sort(function (a, b) { return a.start - b.start; });

      // 按段落渲染（每段就是一段连续文字，便签/贴纸吸附段落末端）
      var globalPos = 0;
      blocks.forEach(function (blk, idx) {
        var blockWrap = el("div", {
          class: "dms-block" + (idx > 0 ? " dms-block-gap" : ""),
          "data-block-id": blk.id,
          "data-paragraph-idx": blk.idx
        });
        var blockText = el("div", { class: "dms-block-text" });
        // 该段内的批注
        var blockAnnots = textAnnots.filter(function (a) { return a.blockId === blk.id; });
        var localStartBase = blk.start;
        renderPlainAnnotated(blockText, blk.content, blockAnnots.map(function (a) {
          var localStart = a.start - localStartBase;
          return Object.assign({}, a, { start: localStart, end: localStart + a.selectedText.length });
        }));
        blockWrap.appendChild(blockText);
        // 批注模式下点段落 = 弹菜单（原句=整段，可在菜单里改）；非模式点段落只浏览
        // （拖选文字随时弹菜单，原句=自选文字，由 setupTextSelection 处理）
        blockWrap.addEventListener("click", function (e) {
          if (!state.annotMode) return;
          var pageEl = blockWrap.closest(".dms-diary-page");
          var r = document.createRange();
          r.selectNodeContents(blockText);
          showAnnotMenu(blk.content, r, pageEl);
          // 批注模式用完自动熄灭按钮（不重建页面，避免菜单被 renderContent 清理）
          state.annotMode = false;
          if (state.annotBtnEl) state.annotBtnEl.classList.remove("dms-btn-on");
        });
        container.appendChild(blockWrap);
        globalPos = blk.end + 1;
      });
    }

    // 在一段文本上渲染批注（无块概念）
    // 同一原句（start/end 相同）的多个批注合并渲染：原文只出现一次，效果叠加
    // （如 表白+划掉 = 红色加粗删除线，划掉+批注 = 删除线+蓝色虚线，三者叠加 = 全效果）
    function renderPlainAnnotated(container, text, annots) {
      var sorted = annots.slice().sort(function (a, b) { return (a.start - b.start) || (a.end - b.end); });
      var groups = [];
      sorted.forEach(function (a) {
        var last = groups[groups.length - 1];
        // 范围重叠/相邻的批注合并成一组，避免原文重复渲染
        if (last && a.start <= last.end) {
          last.items.push(a);
          if (a.end > last.end) last.end = a.end;
        } else {
          groups.push({ start: a.start, end: a.end, items: [a] });
        }
      });
      var pos = 0;
      groups.forEach(function (g) {
        if (g.start > pos) {
          container.appendChild(document.createTextNode(text.slice(pos, g.start)));
        }
        var items = g.items;
        var hasHeart = items.some(function (x) { return x.type === "heart"; });
        var hasCross = items.some(function (x) { return x.type === "crossout"; });
        var hasComment = items.some(function (x) { return x.comment; });
        var cls = "dms-annot" + (hasHeart ? " dms-annot-heart" : "") + (hasCross ? " dms-annot-crossout" : "") + (hasComment ? " dms-annot-comment" : "");
        var span = el("span", {
          class: cls,
          "data-annot-id": items[0].id,
          "data-block-id": items[0].blockId || "",
          "data-marker": (hasHeart ? "\u2665" : "") + (hasCross ? "~" : "") + (hasComment ? "*" : "")
        });
        // 同一段原文只渲染一次；删除线/颜色/边框由组合 class 控制（先设文本，再挂气泡，避免 textContent 清空子节点）
        span.textContent = text.slice(g.start, g.end);
        // 合并所有想法到同一个气泡：点批注显示，每条可单独删除
        var comments = items.filter(function (x) { return x.comment; });
        if (comments.length) {
          var tooltip = el("div", { class: "dms-annot-tooltip" }, comments.map(function (x) {
            var label = x.type === "heart" ? "\u5fc3" : x.type === "crossout" ? "\u5212" : "\u6279";
            return el("div", { style: { display: "flex", alignItems: "center", gap: "6px", marginBottom: comments.length > 1 ? "4px" : "0", lineHeight: "1.5" } }, [
              el("span", { style: { fontWeight: "600", color: x.type === "heart" ? "var(--red)" : "var(--blue)" } }, [label + " "]),
              el("span", {}, [x.comment]),
              el("button", { class: "dms-btn dms-btn-sm dms-btn-ghost", style: { color: "var(--red)", marginLeft: "auto", flexShrink: "0", fontSize: "11px", padding: "1px 6px" }, onclick: function (e) {
                e.stopPropagation();
                removeAnnotById(x.id);
              } }, ["\u5220\u9664"])
            ]);
          }));
          span.appendChild(tooltip);
        }
        // 手机端无 hover：点击批注显示/隐藏想法气泡
        span.addEventListener("click", function (ev) {
          ev.stopPropagation();
          var tip = this.querySelector(".dms-annot-tooltip");
          if (!tip) return;
          var show = !tip.classList.contains("dms-annot-tip-show");
          tip.classList.toggle("dms-annot-tip-show", show);
          if (show) setTimeout(function () { tip.classList.remove("dms-annot-tip-show"); }, 3000);
        });
        container.appendChild(span);
        if (g.end > pos) pos = g.end;
      });
      if (pos < text.length) {
        container.appendChild(document.createTextNode(text.slice(pos)));
      }
    }

    /* ---------- 文字选择 → 批注菜单 ---------- */
    function setupTextSelection(textEl, pageEl) {
      function checkSelection() {
        var sel = window.getSelection();
        if (!sel || sel.rangeCount === 0) return;
        var selectedText = sel.toString().trim();
        if (selectedText.length < 1) return;
        var range = sel.getRangeAt(0);
        if (!textEl.contains(range.commonAncestorContainer)) return;
        showAnnotMenu(selectedText, range, pageEl);
      }
      textEl.addEventListener("mouseup", function () { setTimeout(checkSelection, 10); });
      textEl.addEventListener("touchend", function () { setTimeout(checkSelection, 200); });
      textEl.addEventListener("pointerup", function () { setTimeout(checkSelection, 10); });
    }

    function showAnnotMenu(selectedText, range, pageEl) {
      hideAnnotMenu();
      var rect = range.getBoundingClientRect();
      var menu = el("div", { class: "dms-annot-menu dms-float", style: {
        left: "0px", top: "0px", visibility: "hidden"
      }});
      // 先挂载测量尺寸，再按 fixed 视口坐标定位（不能再加 window.scrollY，否则滚动后菜单会跑出屏幕）
      document.body.appendChild(menu);
      var mw = menu.offsetWidth || 160, mh = menu.offsetHeight || 40;
      var cx = rect.left + rect.width / 2;
      var left = Math.max(mw / 2 + 8, Math.min(cx, window.innerWidth - mw / 2 - 8));
      var top = rect.bottom + 6;
      if (top + mh > window.innerHeight - 8) top = Math.max(8, rect.top - mh - 6);
      menu.style.left = left + "px";
      menu.style.top = top + "px";
      menu.style.transform = "translateX(-50%)";
      menu.style.visibility = "visible";

      // 原句输入框（手机端点段落时默认为整段，可手动改为更精确的原句）
      var originInput = el("textarea", { class: "dms-annot-input", placeholder: "\u539f\u53e5\u2026", style: { minHeight: "40px" } });
      originInput.value = selectedText;
      var inputBox = el("textarea", { class: "dms-annot-input", placeholder: "\u5199\u4e0b\u4f60\u7684\u60f3\u6cd5\u2026" });

      function doAnnotate(type) {
        var comment = inputBox.value.trim();
        var origin = originInput.value.trim();
        if (!origin) { toast("\u8bf7\u5199\u4e0b\u8981\u6279\u6ce8\u7684\u539f\u53e5"); return; }
        if (type !== "heart" && type !== "crossout" && !comment) {
          toast("\u8bf7\u5148\u5199\u4e0b\u60f3\u6cd5");
          return;
        }
        // 找出选区所在的块 id（不依赖外层 textEl，避免闭包引用错误）
        var blockId = null;
        var node = range.commonAncestorContainer;
        while (node && node !== document.body) {
          if (node.nodeType === 1 && node.classList && node.classList.contains("dms-block")) {
            blockId = node.getAttribute("data-block-id");
            break;
          }
          node = node.parentNode;
        }
        var annot = {
          id: crypto.randomUUID(),
          type: type,
          selectedText: origin,
          comment: comment,
          blockId: blockId,
          createdAt: Date.now()
        };
        if (!state.currentDiary.annotations) state.currentDiary.annotations = [];
        pushUndo();
        state.currentDiary.annotations.push(annot);
        saveCurrentDiary();
        window.getSelection().removeAllRanges();
        hideAnnotMenu();
        renderContent();
        toast(type === "comment" ? "\u5df2\u6279\u6ce8" : type === "crossout" ? "\u5df2\u5212\u6389" : type === "heart" ? "\u5df2\u8868\u767d" : "\u5df2\u6dfb\u52a0");
      }

      menu.appendChild(el("div", { style: { fontSize: "11px", color: "var(--ink-mute)", width: "100%" } }, ["\u539f\u53e5\uff1a"]));
      menu.appendChild(originInput);
      menu.appendChild(el("div", { style: { fontSize: "11px", color: "var(--ink-mute)", width: "100%", marginTop: "4px" } }, ["\u60f3\u6cd5\uff1a"]));
      menu.appendChild(inputBox);
      menu.appendChild(el("div", { style: { display: "flex", gap: "4px", width: "100%", marginTop: "4px" } }, [
        el("button", { class: "dms-tool-btn", onclick: function () { doAnnotate("comment"); } }, ["\u6279\u6ce8"]),
        el("button", { class: "dms-tool-btn", onclick: function () { doAnnotate("crossout"); } }, ["\u5212\u6389"]),
        el("button", { class: "dms-tool-btn", onclick: function () { doAnnotate("heart"); } }, ["\u8868\u767d"]),
        el("button", { class: "dms-tool-btn", style: { marginLeft: "auto" }, onclick: function () { doAnnotate("comment"); } }, ["\u786e\u5b9a"])
      ]));

      state.annotMenuEl = menu;

      setTimeout(function () {
        document.addEventListener("mousedown", closeAnnotOnOutside);
      }, 0);
    }

    function closeAnnotOnOutside(e) {
      if (state.annotMenuEl && !state.annotMenuEl.contains(e.target)) {
        // 点击日记正文段落不关闭（可能是切换批注目标），由段落 click 重新弹菜单
        if (e.target && e.target.closest && e.target.closest(".dms-diary-text")) return;
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

    /* ---------- 撤销（批注/便签/表情修改前快照） ---------- */
    function pushUndo() {
      var d = state.currentDiary;
      if (!d) return;
      state.undoStack.push({
        diaryKey: state.diaryKey,
        annotations: (d.annotations || []).map(function (x) { return Object.assign({}, x); }),
        stickers: (d.stickers || []).map(function (x) { return Object.assign({}, x); }),
        charAnnotations: (d.charAnnotations || []).map(function (x) { return Object.assign({}, x); }),
        charStickers: (d.charStickers || []).map(function (x) { return Object.assign({}, x); })
      });
      if (state.undoStack.length > 20) state.undoStack.shift();
    }
    function undoLast() {
      // 跳过不属于当前日记的快照（防止切日记后误撤销）
      while (state.undoStack.length) {
        var u = state.undoStack.pop();
        if (u.diaryKey !== state.diaryKey) continue;
        var d = state.currentDiary;
        d.annotations = u.annotations;
        d.stickers = u.stickers;
        d.charAnnotations = u.charAnnotations;
        d.charStickers = u.charStickers;
        saveCurrentDiary();
        renderContent();
        toast("\u5df2\u64a4\u9500");
        return;
      }
      toast("\u6ca1\u6709\u53ef\u64a4\u9500\u7684\u64cd\u4f5c");
    }
    // 删除指定批注（批注/划掉/表白），从当前日记两处批注数组中移除
    function removeAnnotById(id) {
      var d = state.currentDiary;
      if (!d) return;
      pushUndo();
      d.annotations = (d.annotations || []).filter(function (a) { return a.id !== id; });
      d.charAnnotations = (d.charAnnotations || []).filter(function (a) { return a.id !== id; });
      saveCurrentDiary();
      renderContent();
      toast("\u5df2\u5220\u9664\u8be5\u6279\u6ce8");
    }

    /* ---------- 便签 ---------- */
    function addStickyNote(pageEl) {
      if (!state.currentDiary) return;
      // 使用 user 设置的默认便签样式，或随机一款
      var styleId = (state.settings.defaultStickyStyle != null) ? state.settings.defaultStickyStyle : Math.floor(Math.random() * 10);
      var annot = {
        id: crypto.randomUUID(),
        type: "sticky",
        comment: "",
        x: 20 + Math.random() * 100,
        y: 80 + Math.random() * 80,
        styleId: styleId,
        createdAt: Date.now()
      };
      if (!state.currentDiary.annotations) state.currentDiary.annotations = [];
      pushUndo();
      state.currentDiary.annotations.push(annot);
      // 直接在页面上添加便签 DOM，不重新渲染整个页面
      var body = pageEl.querySelector(".dms-page-body");
      var stickyEl = null;
      if (body) {
        stickyEl = makeStickyNote(annot, pageEl);
        body.appendChild(stickyEl);
      }
      saveCurrentDiary();
      // 立即弹出样式选择器，让 user 自由选样式
      if (stickyEl) {
        setTimeout(function () { showStickyStylePicker(annot, stickyEl); }, 50);
      }
    }

    function makeStickyNote(annot, pageEl) {
      var styleId = annot.styleId != null ? annot.styleId : 0;
      var styleConfig = STICKY_STYLES[styleId] || STICKY_STYLES[0];
      var stickyClass = "dms-sticky ";
      var stickyStyle = { left: annot.x + "px", top: annot.y + "px" };

      if (annot.customStyleId != null) {
        // user 自定义 CSS 样式
        stickyClass += "custom-" + annot.customStyleId;
      } else {
        stickyClass += styleConfig.css;
        // 兼容旧版的 customColor/customFont/customTextColor 内联覆盖
        if (annot.customColor) stickyStyle.background = annot.customColor;
        if (annot.customFont) stickyStyle.fontFamily = annot.customFont;
        if (annot.customTextColor) stickyStyle.color = annot.customTextColor;
      }

      var sticky = el("div", { class: stickyClass, style: stickyStyle });
      var text = el("div", { contentEditable: annot.byChar ? "false" : "true", style: { outline: "none", minHeight: "20px" } }, [annot.comment || (annot.byChar ? "" : "\u53cc\u51fb\u7f16\u8f91\u2026")]);
      if (!annot.byChar) {
        text.addEventListener("blur", function () {
          annot.comment = text.textContent;
          saveCurrentDiary();
        });
      }
      var removeBtn = null;
      if (!annot.byChar) {
        removeBtn = el("button", { class: "dms-sticky-remove", onclick: function (ev) {
          ev.stopPropagation();
          var arr = state.currentDiary.annotations;
          var i = arr.indexOf(annot);
          if (i >= 0) { arr.splice(i, 1); }
          else if (state.currentDiary.charAnnotations) {
            var j = state.currentDiary.charAnnotations.indexOf(annot);
            if (j >= 0) state.currentDiary.charAnnotations.splice(j, 1);
          }
          saveCurrentDiary();
          sticky.remove();
        } }, ["\u00d7"]);
      }

      // 计算便签中心 y 吸附到哪个段落，写入 blockId
      function updateBlockIdByPosition() {
        var body = pageEl.querySelector(".dms-page-body");
        if (!body) return;
        var blocks = body.querySelectorAll(".dms-block");
        if (!blocks.length) return;
        var stickyRect = sticky.getBoundingClientRect();
        var cy = stickyRect.top + stickyRect.height / 2;
        var best = null, bestDist = Infinity;
        blocks.forEach(function (b) {
          var r = b.getBoundingClientRect();
          if (cy >= r.top && cy <= r.bottom) { best = b; bestDist = 0; }
          else {
            var d = Math.min(Math.abs(cy - r.top), Math.abs(cy - r.bottom));
            if (d < bestDist) { bestDist = d; best = b; }
          }
        });
        if (best) annot.blockId = best.getAttribute("data-block-id") || null;
      }
      // 边界 clamp，保证便签不会被拖出 page-body
      function clampPos(nx, ny) {
        var body = pageEl.querySelector(".dms-page-body");
        if (!body) return { x: nx, y: ny };
        var rect = body.getBoundingClientRect();
        return {
          x: Math.max(0, Math.min(nx, rect.width - sticky.offsetWidth)),
          y: Math.max(0, Math.min(ny, rect.height - sticky.offsetHeight))
        };
      }

      // 长按弹出操作菜单：拖拽 / 换样式 / 删除
      function showStickyActionMenu(clientX, clientY) {
        var old = qs(".dms-sticky-action-menu", document);
        if (old) old.remove();
        var menu = el("div", {
          class: "dms-sticky-action-menu dms-float",
          style: { position: "fixed", left: clientX + "px", top: clientY + "px", zIndex: "700", transform: "translate(-50%, -100%)", marginTop: "-8px" }
        });
        menu.appendChild(el("div", { class: "dms-sticky-action-title" }, ["\u4fbf\u7b7e\u64cd\u4f5c"]));
        var btns = el("div", { class: "dms-sticky-action-btns" });
        btns.appendChild(el("button", { class: "dms-btn dms-btn-ghost dms-btn-sm", onclick: function () {
          menu.remove();
          showStickyStylePicker(annot, sticky);
        } }, ["\u6362\u6837\u5f0f"]));
        if (!annot.byChar) {
          btns.appendChild(el("button", { class: "dms-btn dms-btn-ghost dms-btn-sm", style: { color: "var(--red)" }, onclick: function () {
            menu.remove();
            var arr = state.currentDiary.annotations;
            var i = arr.indexOf(annot);
            if (i >= 0) arr.splice(i, 1);
            else if (state.currentDiary.charAnnotations) {
              var j = state.currentDiary.charAnnotations.indexOf(annot);
              if (j >= 0) state.currentDiary.charAnnotations.splice(j, 1);
            }
            saveCurrentDiary();
            sticky.remove();
            toast("\u5df2\u5220\u9664");
          } }, ["\u5220\u9664"]));
        }
        menu.appendChild(btns);
        document.body.appendChild(menu);
        // 点击外部关闭
        setTimeout(function () {
          function close(e) {
            if (!menu.contains(e.target)) { menu.remove(); document.removeEventListener("mousedown", close); document.removeEventListener("touchstart", close); }
          }
          document.addEventListener("mousedown", close);
          document.addEventListener("touchstart", close, { passive: true });
        }, 0);
      }

      // ---- 自由拖拽：按住即可拖动（无需长按进入拖拽模式），长按 500ms 弹操作菜单 ----
      var dragInfo = null;
      var longPressTimer = null;
      var longPressStart = null;
      function clearLongPress() {
        if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
      }
      function onDragDown(clientX, clientY) {
        var br = getBodyRect();
        var sr = sticky.getBoundingClientRect();
        dragInfo = { startClientX: clientX, startClientY: clientY, startBodyX: sr.left - br.left, startBodyY: sr.top - br.top, moved: false };
        longPressStart = { x: clientX, y: clientY };
        longPressTimer = setTimeout(function () {
          if (dragInfo && dragInfo.moved) { longPressTimer = null; return; }
          longPressTimer = null;
          if (navigator.vibrate) navigator.vibrate(30);
          sticky._menuShown = true;
          showStickyActionMenu(clientX, clientY);
        }, 500);
      }
      function onDragMove(clientX, clientY) {
        // 移动超阈值 → 取消长按
        if (longPressTimer && longPressStart && (Math.abs(clientX - longPressStart.x) > 8 || Math.abs(clientY - longPressStart.y) > 8)) {
          clearLongPress();
        }
        if (!dragInfo) return;
        if (!dragInfo.moved) {
          if (Math.abs(clientX - dragInfo.startClientX) <= 6 && Math.abs(clientY - dragInfo.startClientY) <= 6) return;
          dragInfo.moved = true;
          sticky.classList.add("dragging");
        }
        var dx = clientX - dragInfo.startClientX;
        var dy = clientY - dragInfo.startClientY;
        var p = clampPos(dragInfo.startBodyX + dx, dragInfo.startBodyY + dy);
        annot.x = p.x; annot.y = p.y;
        sticky.style.left = p.x + "px";
        sticky.style.top = p.y + "px";
      }
      function onDragUp() {
        if (dragInfo && dragInfo.moved) {
          updateBlockIdByPosition();
          saveCurrentDiary();
          sticky.classList.remove("dragging");
        }
        dragInfo = null;
        clearLongPress();
      }

      // ---- 触摸拖动：touchstart 立即 preventDefault 锁定手势（默认即拖拽模式）----
      // 轻点（无位移）在 touchend 手动聚焦编辑区；移动则拖便签，两者互不干扰
      sticky.addEventListener("touchstart", function (e) {
        if (e.target === removeBtn) return;
        if (e.touches.length !== 1) return;
        var t = e.touches[0];
        // 关键：按下即阻止 WebView 把手势判定为滚动/文本选择，保证 touchmove 持续派发
        e.preventDefault();
        onDragDown(t.clientX, t.clientY);
      }, { passive: false });
      sticky.addEventListener("touchmove", function (e) {
        if (e.touches.length !== 1) return;
        var t = e.touches[0];
        e.preventDefault();
        onDragMove(t.clientX, t.clientY);
      }, { passive: false });
      sticky.addEventListener("touchend", function (e) {
        var wasTap = !!(dragInfo && !dragInfo.moved && !sticky._menuShown);
        onDragUp();
        // 轻点（未拖动且未弹菜单）→ 手动聚焦编辑区（touchstart 已 preventDefault，系统不会自动聚焦）
        if (wasTap && text && !annot.byChar) text.focus();
        sticky._menuShown = false;
      });
      sticky.addEventListener("touchcancel", onDragUp);
      // ---- 鼠标拖动：down 时挂到 window，up 时移除，多便签互不干扰 ----
      function onMouseMove(e) {
        if (dragInfo && dragInfo.moved) e.preventDefault();
        onDragMove(e.clientX, e.clientY);
      }
      function onMouseUp() {
        window.removeEventListener("mousemove", onMouseMove);
        window.removeEventListener("mouseup", onMouseUp);
        onDragUp();
      }
      sticky.addEventListener("mousedown", function (e) {
        if (e.target === removeBtn) return;
        if (e.button !== 0) return;
        window.addEventListener("mousemove", onMouseMove);
        window.addEventListener("mouseup", onMouseUp);
        onDragDown(e.clientX, e.clientY);
      });
      // 右键弹出操作菜单（桌面端）
      sticky.addEventListener("contextmenu", function (e) {
        e.preventDefault();
        showStickyActionMenu(e.clientX, e.clientY);
      });

      // char 写的便签加标记
      if (annot.byChar) {
        sticky.appendChild(el("div", {
          style: { position: "absolute", top: "-2px", left: "-2px", fontSize: "8px", color: "#FAF3E3", background: "var(--red)", borderRadius: "3px", padding: "0 3px" }
        }, ["TA"]));
      }

      sticky.appendChild(text);
      if (removeBtn) sticky.appendChild(removeBtn);
      return sticky;
    }

    /* ---------- 便签样式选择器（长按/右键触发） ---------- */
    function showStickyStylePicker(annot, stickyEl) {
      var old = qs(".dms-sticky-style-popup", document);
      if (old) old.remove();
      var popup = el("div", {
        class: "dms-sticker-picker dms-sticky-style-popup dms-float",
        style: { position: "fixed", zIndex: "600", maxWidth: "340px", maxHeight: "80vh", overflowY: "auto" }
      });
      popup.appendChild(el("div", { class: "dms-sticker-picker-head" }, [
        el("span", { style: { fontSize: "12px", color: "var(--ink-mute)" } }, ["\u9009\u4fbf\u7b7e\u6837\u5f0f"]),
        el("button", { class: "dms-btn dms-btn-sm dms-btn-ghost", onclick: function () { popup.remove(); } }, ["\u5173\u95ed"])
      ]));

      // 10 款内置样式选择（每款展示名字+迷你预览）
      popup.appendChild(el("div", { style: { fontSize: "11px", color: "var(--ink-dim)", margin: "6px 2px 2px" } }, ["\u5185\u7f6e\u6837\u5f0f"]));
      var styleGrid = el("div", { class: "dms-sticky-style-picker" });
      STICKY_STYLES.forEach(function (st) {
        var isActive = (annot.customStyleId == null && annot.styleId === st.id);
        var item = el("div", {
          class: "dms-sticky-style-item" + (isActive ? " active" : ""),
          style: { background: st.color },
          title: st.name + " - " + st.desc,
          onclick: function () {
            annot.styleId = st.id;
            annot.customStyleId = null;
            annot.customColor = null;
            annot.customFont = null;
            annot.customTextColor = null;
            stickyEl.className = "dms-sticky " + st.css;
            stickyEl.style.background = "";
            stickyEl.style.color = "";
            stickyEl.style.fontFamily = "";
            saveCurrentDiary();
            popup.remove();
          }
        }, [st.name]);
        styleGrid.appendChild(item);
      });
      popup.appendChild(styleGrid);

      // user 自定义 CSS 样式（在设置面板中管理，这里仅选择）
      popup.appendChild(el("div", { style: { fontSize: "11px", color: "var(--ink-dim)", margin: "10px 2px 2px" } }, ["\u81ea\u5b9a\u4e49\u6837\u5f0f"]));
      getCustomNoteStyles(roche).then(function (customList) {
        if (!customList.length) {
          popup.appendChild(el("div", { style: { fontSize: "11px", color: "var(--ink-mute)", padding: "4px 2px" } }, ["\u6682\u65e0\u81ea\u5b9a\u4e49\u6837\u5f0f\uff0c\u8bf7\u5728\u8bbe\u7f6e\u9762\u677f\u4e2d\u5bfc\u5165\u3002"]));
        } else {
          var customGrid = el("div", { class: "dms-sticky-style-picker" });
          customList.forEach(function (cs) {
            var isActive = (annot.customStyleId === cs.id);
            var item = el("div", {
              class: "dms-sticky-style-item custom-item" + (isActive ? " active" : ""),
              title: cs.name,
              onclick: function () {
                annot.customStyleId = cs.id;
                annot.styleId = null;
                stickyEl.className = "dms-sticky custom-" + cs.id;
                stickyEl.style.background = "";
                stickyEl.style.color = "";
                stickyEl.style.fontFamily = "";
                saveCurrentDiary();
                popup.remove();
              }
            }, [cs.name]);
            customGrid.appendChild(item);
          });
          popup.appendChild(customGrid);
        }
      });

      // 定位到便签附近
      var rect = stickyEl.getBoundingClientRect();
      popup.style.left = Math.min(rect.left, window.innerWidth - 360) + "px";
      popup.style.top = (rect.bottom + 4) + "px";
      document.body.appendChild(popup);
      setTimeout(function () {
        document.addEventListener("mousedown", function close(ev) {
          if (!popup.contains(ev.target)) { popup.remove(); document.removeEventListener("mousedown", close); }
        });
      }, 0);
    }

    /* ---------- 自定义便签样式编辑器 ---------- */
    function openCustomNoteEditor(existing, onDone) {
      var overlay = el("div", {
        class: "dms-sync-overlay dms-float",
        style: { position: "fixed", inset: "0", background: "rgba(74,60,40,0.5)", zIndex: "700", display: "flex", alignItems: "center", justifyContent: "center" }
      });
      var dlg = el("div", {
        class: "dms-card tape-blue",
        style: { width: "90%", maxWidth: "500px", maxHeight: "85vh", overflowY: "auto", padding: "16px" }
      });
      var isNew = !existing;
      var data = existing ? JSON.parse(JSON.stringify(existing)) : { id: "cn" + Date.now(), name: "", css: "" };

      dlg.appendChild(el("div", { class: "dms-page-header", style: { marginBottom: "10px" } }, [
        el("div", { class: "dms-page-title" }, [isNew ? "\u65b0\u5efa\u81ea\u5b9a\u4e49\u4fbf\u7b7e\u6837\u5f0f" : "\u7f16\u8f91\u81ea\u5b9a\u4e49\u6837\u5f0f"]),
        el("button", { class: "dms-btn dms-btn-sm dms-btn-ghost", onclick: function () { overlay.remove(); } }, ["\u5173\u95ed"])
      ]));

      dlg.appendChild(el("div", { style: { fontSize: "12px", color: "var(--ink-dim)", marginBottom: "4px" } }, ["\u6837\u5f0f\u540d\u79f0"]));
      var nameInput = el("input", { class: "dms-input", placeholder: "\u5982\uff1a\u68a6\u5e7b\u6d6e\u5149\u3001\u661f\u7a7a\u6f02\u6d41", value: data.name, style: { width: "100%" } });
      dlg.appendChild(nameInput);

      dlg.appendChild(el("div", { style: { fontSize: "12px", color: "var(--ink-dim)", margin: "10px 0 4px" } }, ["CSS \u4ee3\u7801"]));
      var hint = el("div", { style: { fontSize: "11px", color: "var(--ink-mute)", marginBottom: "4px" } }, ["\u8fd9\u91cc\u5199\u7684 CSS \u4f1a\u88ab\u5e94\u7528\u5230 .dms-sticky \u5143\u7d20\u4e0a\u3002\u53ef\u4f7f\u7528 background / border / box-shadow / transform / font-family \u7b49\u5c5e\u6027\u3002"]);
      dlg.appendChild(hint);
      var cssArea = el("textarea", {
        class: "dms-textarea",
        placeholder: "background:linear-gradient(135deg,#FFD1DC,#FFE5F0);\nborder-radius:16px;\nbox-shadow:0 0 12px rgba(255,200,220,0.6),inset 0 0 8px #fff;\ntransform:rotate(-2deg);\nfont-family:'KaiTi',cursive;",
        style: { width: "100%", minHeight: "140px", fontFamily: "monospace", fontSize: "11px", whiteSpace: "pre" }
      });
      cssArea.value = data.css || "";
      dlg.appendChild(cssArea);

      // 实时预览
      dlg.appendChild(el("div", { style: { fontSize: "12px", color: "var(--ink-dim)", margin: "10px 0 4px" } }, ["\u9884\u89c8"]));
      var previewWrap = el("div", { style: { position: "relative", height: "80px", background: "var(--paper-2)", borderRadius: "4px", padding: "10px", overflow: "hidden" } });
      var previewNote = el("div", { class: "dms-sticky custom-" + data.id, style: { position: "relative", left: "20px", top: "10px" } }, ["\u8fd9\u91cc\u662f\u9884\u89c8\u6587\u5b57\u2026"]);
      previewWrap.appendChild(previewNote);
      dlg.appendChild(previewWrap);

      function updatePreview() {
        // 更新 preview 样式
        var tag = document.getElementById(STYLE_ID + "-preview-custom");
        if (!tag) {
          tag = document.createElement("style");
          tag.id = STYLE_ID + "-preview-custom";
          document.head.appendChild(tag);
        }
        tag.textContent = "." + ROOT_CLASS + " .dms-sticky.custom-" + data.id + "{" + (cssArea.value || "") + "}";
      }
      cssArea.addEventListener("input", updatePreview);
      updatePreview();

      dlg.appendChild(el("div", { style: { display: "flex", gap: "8px", marginTop: "12px" } }, [
        el("button", {
          class: "dms-btn dms-btn-sm dms-btn-primary",
          style: { flex: "1" },
          onclick: function () {
            if (!nameInput.value.trim()) { toast("\u8bf7\u586b\u540d\u79f0"); return; }
            data.name = nameInput.value.trim();
            data.css = cssArea.value;
            getCustomNoteStyles(roche).then(function (list) {
              var idx = list.findIndex(function (x) { return x.id === data.id; });
              if (idx >= 0) list[idx] = data; else list.push(data);
              return saveCustomNoteStyles(roche, list).then(function () {
                applyCustomNoteStyles(list);
                toast("\u5df2\u4fdd\u5b58");
                overlay.remove();
                if (onDone) onDone();
              });
            });
          }
        }, ["\u4fdd\u5b58"]),
        el("button", {
          class: "dms-btn dms-btn-sm dms-btn-ghost",
          onclick: function () { overlay.remove(); }
        }, ["\u53d6\u6d88"])
      ]));

      // 删除按钮（仅编辑时）
      if (!isNew) {
        dlg.appendChild(el("button", {
          class: "dms-btn dms-btn-sm",
          style: { marginTop: "6px", width: "100%", color: "var(--red)" },
          onclick: function () {
            getCustomNoteStyles(roche).then(function (list) {
              var filtered = list.filter(function (x) { return x.id !== data.id; });
              return saveCustomNoteStyles(roche, filtered).then(function () {
                applyCustomNoteStyles(filtered);
                toast("\u5df2\u5220\u9664");
                overlay.remove();
                if (onDone) onDone();
              });
            });
          }
        }, ["\u5220\u9664\u8be5\u6837\u5f0f"]));
      }

      overlay.appendChild(dlg);
      overlay.addEventListener("click", function (e) { if (e.target === overlay) overlay.remove(); });
      document.body.appendChild(overlay);
    }

    /* ---------- 表情包贴纸（贴到日记上） ---------- */
    function makeSticker(s, pageEl) {
      var size = s.size || 64;
      var sticker = el("div", {
        class: "dms-sticker",
        style: { left: (s.x || 30) + "px", top: (s.y || 60) + "px", width: size + "px", height: size + "px" }
      });
      var img = el("img", { src: s.url, alt: s.caption || "", style: { width: "100%", height: "100%" } });
      sticker.appendChild(img);
      if (s.caption) {
        sticker.appendChild(el("div", { class: "dms-sticker-cap" }, [s.caption]));
      }
      // 块标记小角标
      if (s.blockId) {
        sticker.appendChild(el("div", {
          class: "dms-sticker-blocktag",
          title: "\u6240\u5c5e\u5757: " + s.blockId,
          style: { position: "absolute", top: "-2px", left: "-2px", fontSize: "8px", color: "#FAF3E3", background: "var(--blue)", borderRadius: "3px", padding: "0 3px" }
        }, [s.blockId]));
      }
      var delBtn = el("button", { class: "dms-sticker-del", onclick: function (ev) {
        ev.stopPropagation();
        if (!state.currentDiary) return;
        var arr = state.currentDiary.stickers || [];
        var i = arr.indexOf(s);
        if (i >= 0) { arr.splice(i, 1); state.currentDiary.stickers = arr; }
        saveCurrentDiary();
        sticker.remove();
      } }, ["\u00d7"]);
      sticker.appendChild(delBtn);

      // 缩放手柄（右下角）
      var resizeHandle = el("div", {
        class: "dms-sticker-resize",
        style: {
          position: "absolute", right: "-4px", bottom: "-4px",
          width: "12px", height: "12px", background: "var(--blue)",
          borderRadius: "50%", cursor: "nwse-resize", zIndex: "10",
          border: "1px solid #FAF3E3"
        }
      });
      sticker.appendChild(resizeHandle);

      // 计算贴纸中心 y 吸附到哪个段落，写入 blockId
      function updateStickerBlockIdByPosition() {
        var body = pageEl.querySelector(".dms-page-body");
        if (!body) return;
        var blocks = body.querySelectorAll(".dms-block");
        if (!blocks.length) return;
        var sr = sticker.getBoundingClientRect();
        var cy = sr.top + sr.height / 2;
        var best = null, bestDist = Infinity;
        blocks.forEach(function (b) {
          var r = b.getBoundingClientRect();
          if (cy >= r.top && cy <= r.bottom) { best = b; bestDist = 0; }
          else {
            var d = Math.min(Math.abs(cy - r.top), Math.abs(cy - r.bottom));
            if (d < bestDist) { bestDist = d; best = b; }
          }
        });
        if (best) s.blockId = best.getAttribute("data-block-id") || null;
      }
      function clampPos(nx, ny) {
        var body = pageEl.querySelector(".dms-page-body");
        if (!body) return { x: nx, y: ny };
        var rect = body.getBoundingClientRect();
        return {
          x: Math.max(0, Math.min(nx, rect.width - sticker.offsetWidth)),
          y: Math.max(0, Math.min(ny, rect.height - sticker.offsetHeight))
        };
      }

      // 长按弹出操作菜单：拖拽 / 缩放 / 删除
      function showStickerActionMenu(clientX, clientY) {
        var old = qs(".dms-sticky-action-menu", document);
        if (old) old.remove();
        var menu = el("div", {
          class: "dms-sticky-action-menu dms-float",
          style: { position: "fixed", left: clientX + "px", top: clientY + "px", zIndex: "700", transform: "translate(-50%, -100%)", marginTop: "-8px" }
        });
        menu.appendChild(el("div", { class: "dms-sticky-action-title" }, ["\u8868\u60c5\u64cd\u4f5c"]));
        var btns = el("div", { class: "dms-sticky-action-btns" });
        btns.appendChild(el("button", { class: "dms-btn dms-btn-ghost dms-btn-sm", onclick: function () {
          menu.remove();
          startDragMode();
        } }, ["\u62d6\u52a8"]));
        btns.appendChild(el("button", { class: "dms-btn dms-btn-ghost dms-btn-sm", onclick: function () {
          menu.remove();
          startResizeMode();
        } }, ["\u7f29\u653e"]));
        btns.appendChild(el("button", { class: "dms-btn dms-btn-ghost dms-btn-sm", style: { color: "var(--red)" }, onclick: function () {
          menu.remove();
          var arr = state.currentDiary.stickers || [];
          var i = arr.indexOf(s);
          if (i >= 0) { arr.splice(i, 1); state.currentDiary.stickers = arr; }
          saveCurrentDiary();
          sticker.remove();
          toast("\u5df2\u5220\u9664");
        } }, ["\u5220\u9664"]));
        menu.appendChild(btns);
        document.body.appendChild(menu);
        setTimeout(function () {
          function close(e) {
            if (!menu.contains(e.target)) { menu.remove(); document.removeEventListener("mousedown", close); document.removeEventListener("touchstart", close); }
          }
          document.addEventListener("mousedown", close);
          document.addEventListener("touchstart", close, { passive: true });
        }, 0);
      }

      // 拖拽模式
      function startDragMode() {
        toast("\u62d6\u52a8\u6a21\u5f0f\uff1a\u6309\u4f4f\u5e76\u79fb\u52a8\uff0c\u677e\u624b\u7ed3\u675f");
        sticker.classList.add("dragging");
        var dragging = false, offX = 0, offY = 0;
        function onPointerDown(e) {
          if (e.target === delBtn || e.target === resizeHandle) return;
          dragging = true;
          offX = e.clientX - sticker.offsetLeft;
          offY = e.clientY - sticker.offsetTop;
          e.preventDefault();
        }
        function onPointerMove(e) {
          if (!dragging) return;
          var p = clampPos(e.clientX - offX, e.clientY - offY);
          s.x = p.x; s.y = p.y;
          sticker.style.left = p.x + "px";
          sticker.style.top = p.y + "px";
        }
        function onPointerUp() {
          if (dragging) {
            dragging = false;
            updateStickerBlockIdByPosition();
            saveCurrentDiary();
            endDragMode();
          }
        }
        var tDragging = false, tOffX = 0, tOffY = 0;
        function onTouchStart(e) {
          if (e.target === delBtn || e.target === resizeHandle) return;
          if (e.touches.length !== 1) return;
          var t = e.touches[0];
          var body = pageEl.querySelector(".dms-page-body");
          var br = body ? body.getBoundingClientRect() : { left: 0, top: 0 };
          tDragging = true;
          tOffX = t.clientX - br.left - s.x;
          tOffY = t.clientY - br.top - s.y;
          e.preventDefault();
        }
        function onTouchMove(e) {
          if (!tDragging || e.touches.length !== 1) return;
          var t = e.touches[0];
          e.preventDefault();
          var p = clampPos(t.clientX - tOffX, t.clientY - tOffY);
          s.x = p.x; s.y = p.y;
          sticker.style.left = p.x + "px";
          sticker.style.top = p.y + "px";
        }
        function onTouchEnd() {
          if (tDragging) {
            tDragging = false;
            updateStickerBlockIdByPosition();
            saveCurrentDiary();
            endDragMode();
          }
        }
        sticker.addEventListener("pointerdown", onPointerDown);
        sticker.addEventListener("pointermove", onPointerMove);
        sticker.addEventListener("pointerup", onPointerUp);
        sticker.addEventListener("pointercancel", onPointerUp);
        sticker.addEventListener("touchstart", onTouchStart, { passive: false });
        sticker.addEventListener("touchmove", onTouchMove, { passive: false });
        sticker.addEventListener("touchend", onTouchEnd);
        sticker.addEventListener("touchcancel", onTouchEnd);
        sticker._dragHandlers = { onPointerDown: onPointerDown, onPointerMove: onPointerMove, onPointerUp: onPointerUp,
          onTouchStart: onTouchStart, onTouchMove: onTouchMove, onTouchEnd: onTouchEnd };
        sticker._isDragMode = true;
        function endDragMode() {
          if (!sticker._isDragMode) return;
          sticker._isDragMode = false;
          sticker.classList.remove("dragging");
          var h = sticker._dragHandlers;
          if (h) {
            sticker.removeEventListener("pointerdown", h.onPointerDown);
            sticker.removeEventListener("pointermove", h.onPointerMove);
            sticker.removeEventListener("pointerup", h.onPointerUp);
            sticker.removeEventListener("pointercancel", h.onPointerUp);
            sticker.removeEventListener("touchstart", h.onTouchStart);
            sticker.removeEventListener("touchmove", h.onTouchMove);
            sticker.removeEventListener("touchend", h.onTouchEnd);
            sticker.removeEventListener("touchcancel", h.onTouchEnd);
          }
          sticker._dragHandlers = null;
        }
      }
      // 缩放模式
      function startResizeMode() {
        toast("\u7f29\u653e\u6a21\u5f0f\uff1a\u6309\u4f4f\u5e76\u62d6\u52a8\uff0c\u677e\u624b\u7ed3\u675f");
        sticker.style.boxShadow = "0 0 0 2px var(--blue), 0 4px 12px rgba(74,60,40,0.3)";
        sticker.style.zIndex = "20";
        var resizing = false, startW = 0, startH = 0, startX = 0, startY = 0;
        function onPointerDown(e) {
          if (e.target === delBtn) return;
          resizing = true;
          startW = sticker.offsetWidth; startH = sticker.offsetHeight;
          startX = e.clientX; startY = e.clientY;
          e.preventDefault();
        }
        function onPointerMove(e) {
          if (!resizing) return;
          var newW = Math.max(32, startW + (e.clientX - startX));
          var newH = Math.max(32, startH + (e.clientY - startY));
          sticker.style.width = newW + "px";
          sticker.style.height = newH + "px";
          s.size = newW;
        }
        function onPointerUp() {
          if (resizing) { resizing = false; saveCurrentDiary(); endResizeMode(); }
        }
        var tResizing = false;
        function onTouchStart(e) {
          if (e.touches.length !== 1) return;
          var t = e.touches[0];
          tResizing = true;
          startW = sticker.offsetWidth; startH = sticker.offsetHeight;
          startX = t.clientX; startY = t.clientY;
          e.preventDefault();
        }
        function onTouchMove(e) {
          if (!tResizing || e.touches.length !== 1) return;
          var t = e.touches[0];
          e.preventDefault();
          var newW = Math.max(32, startW + (t.clientX - startX));
          var newH = Math.max(32, startH + (t.clientY - startY));
          sticker.style.width = newW + "px";
          sticker.style.height = newH + "px";
          s.size = newW;
        }
        function onTouchEnd() {
          if (tResizing) { tResizing = false; saveCurrentDiary(); endResizeMode(); }
        }
        sticker.addEventListener("pointerdown", onPointerDown);
        sticker.addEventListener("pointermove", onPointerMove);
        sticker.addEventListener("pointerup", onPointerUp);
        sticker.addEventListener("pointercancel", onPointerUp);
        sticker.addEventListener("touchstart", onTouchStart, { passive: false });
        sticker.addEventListener("touchmove", onTouchMove, { passive: false });
        sticker.addEventListener("touchend", onTouchEnd);
        sticker.addEventListener("touchcancel", onTouchEnd);
        sticker._resizeHandlers = { onPointerDown: onPointerDown, onPointerMove: onPointerMove, onPointerUp: onPointerUp,
          onTouchStart: onTouchStart, onTouchMove: onTouchMove, onTouchEnd: onTouchEnd };
        sticker._isResizeMode = true;
        function endResizeMode() {
          if (!sticker._isResizeMode) return;
          sticker._isResizeMode = false;
          sticker.style.boxShadow = "";
          sticker.style.zIndex = "";
          var h = sticker._resizeHandlers;
          if (h) {
            sticker.removeEventListener("pointerdown", h.onPointerDown);
            sticker.removeEventListener("pointermove", h.onPointerMove);
            sticker.removeEventListener("pointerup", h.onPointerUp);
            sticker.removeEventListener("pointercancel", h.onPointerUp);
            sticker.removeEventListener("touchstart", h.onTouchStart);
            sticker.removeEventListener("touchmove", h.onTouchMove);
            sticker.removeEventListener("touchend", h.onTouchEnd);
            sticker.removeEventListener("touchcancel", h.onTouchEnd);
          }
          sticker._resizeHandlers = null;
        }
      }

      // 右键 / 长按触发操作菜单
      sticker.addEventListener("contextmenu", function (e) {
        e.preventDefault();
        showStickerActionMenu(e.clientX, e.clientY);
      });
      var lpTimer = null, lpStart = null;
      sticker.addEventListener("touchstart", function (e) {
        if (e.target === delBtn || e.target === resizeHandle) return;
        if (e.touches.length !== 1) return;
        if (sticker._isDragMode || sticker._isResizeMode) return;
        var t = e.touches[0];
        lpStart = { x: t.clientX, y: t.clientY };
        lpTimer = setTimeout(function () {
          if (navigator.vibrate) navigator.vibrate(30);
          showStickerActionMenu(t.clientX, t.clientY);
          lpTimer = null;
        }, 500);
      }, { passive: true });
      sticker.addEventListener("touchmove", function (e) {
        if (!lpTimer || !lpStart) return;
        var t = e.touches[0];
        if (Math.abs(t.clientX - lpStart.x) > 8 || Math.abs(t.clientY - lpStart.y) > 8) {
          clearTimeout(lpTimer); lpTimer = null;
        }
      }, { passive: true });
      sticker.addEventListener("touchend", function () { if (lpTimer) { clearTimeout(lpTimer); lpTimer = null; } });
      sticker.addEventListener("touchcancel", function () { if (lpTimer) { clearTimeout(lpTimer); lpTimer = null; } });
      // 桌面端鼠标长按
      var mDownTimer = null;
      sticker.addEventListener("mousedown", function (e) {
        if (e.target === delBtn || e.target === resizeHandle) return;
        if (e.button !== 0) return;
        if (sticker._isDragMode || sticker._isResizeMode) return;
        mDownTimer = setTimeout(function () {
          showStickerActionMenu(e.clientX, e.clientY);
          mDownTimer = null;
        }, 500);
      });
      sticker.addEventListener("mousemove", function (e) {
        if (!mDownTimer) return;
        if (Math.abs(e.movementX) > 2 || Math.abs(e.movementY) > 2) { clearTimeout(mDownTimer); mDownTimer = null; }
      });
      sticker.addEventListener("mouseup", function () { if (mDownTimer) { clearTimeout(mDownTimer); mDownTimer = null; } });
      return sticker;
    }

    /* ---------- 表情包选择器 ---------- */
    function openStickerPicker(pageEl) {
      if (!state.currentDiary) return;
      // 关闭旧的
      var old = qs(".dms-sticker-picker", document);
      if (old) old.remove();

      getStickerLib(roche).then(function (lib) {
        state.stickerLib = lib;
        var cid = state.currentDiary.conversationId;
        var stickers = getStickersForConv(lib, cid);
        if (!stickers.length) {
          toast("\u8fd9\u4e2a\u4f1a\u8bdd\u8fd8\u6ca1\u6302\u8f7d\u8868\u60c5\u5305\u7ec4\uff0c\u8bf7\u5728\u8bbe\u7f6e\u2192\u8868\u60c5\u5305\u5e93\u91cc\u6dfb\u52a0\u5e76\u6302\u8f7d");
          return;
        }
        var picker = el("div", { class: "dms-sticker-picker dms-float" });
        picker.appendChild(el("div", { class: "dms-sticker-picker-head" }, [
          el("span", { style: { fontSize: "12px", color: "var(--ink-mute)" } }, ["\u9009\u4e2a\u8868\u60c5\u5305\u8d34\u4e0a\u53bb"]),
          el("button", { class: "dms-btn dms-btn-sm dms-btn-ghost", onclick: function () { picker.remove(); } }, ["\u5173\u95ed"])
        ]));
        var grid = el("div", { class: "dms-sticker-picker-grid" });
        stickers.forEach(function (st) {
          var pick = el("div", { class: "dms-sticker-pick" }, [
            el("img", { src: st.url }),
            el("div", { class: "dms-sticker-pick-cap" }, [st.caption || ""])
          ]);
          pick.addEventListener("click", function () {
            // 贴到当前页（pageEl），位置随机一点
            if (!state.currentDiary.stickers) state.currentDiary.stickers = [];
            var placed = {
              id: "st" + Date.now() + Math.random().toString(36).slice(2, 6),
              url: st.url,
              caption: st.caption || "",
              x: 30 + Math.random() * 120,
              y: 60 + Math.random() * 80,
              size: 64,
              blockId: null,
              createdAt: Date.now()
            };
            pushUndo();
            state.currentDiary.stickers.push(placed);
            // 直接在页面上添加贴纸 DOM，不重新渲染整个页面
            var body = pageEl.querySelector(".dms-page-body");
            if (body) {
              body.appendChild(makeSticker(placed, pageEl));
            }
            saveCurrentDiary();
            picker.remove();
          });
          grid.appendChild(pick);
        });
        picker.appendChild(grid);
        document.body.appendChild(picker);
        // 点外面关闭
        setTimeout(function () {
          document.addEventListener("mousedown", function close(ev) {
            if (!picker.contains(ev.target)) { picker.remove(); document.removeEventListener("mousedown", close); }
          });
        }, 0);
      });
    }

    /* ---------- 会话挂载表情包组对话框 ---------- */
    function openStickerMountDialog(conv) {
      var cid = conv.conversationId || conv.id;
      getStickerLib(roche).then(function (lib) {
        var mounted = (lib.sessionGroups && lib.sessionGroups[cid]) || [];
        // 关闭旧的
        var old = qs(".dms-mount-dialog", document);
        if (old) old.remove();

        var overlay = el("div", { class: "dms-mount-overlay", style: { position: "fixed", inset: "0", background: "rgba(0,0,0,0.4)", zIndex: "400", display: "flex", alignItems: "center", justifyContent: "center" } });
        var dlg = el("div", { class: "dms-mount-dialog dms-float", style: { background: "var(--paper)", borderRadius: "var(--radius)", padding: "16px", maxWidth: "360px", width: "90%", maxHeight: "80vh", overflowY: "auto" } });
        dlg.appendChild(el("div", { class: "dms-handwritten", style: { fontSize: "16px", color: "var(--red)", marginBottom: "8px" } }, ["\u6302\u8f7d\u8868\u60c5\u5305\u7ec4"]));
        dlg.appendChild(el("div", { class: "dms-hint", style: { marginBottom: "10px" } }, ["\u52fe\u9009\u8981\u6302\u8f7d\u5230\u8fd9\u4e2a\u4f1a\u8bdd\u7684\u7ec4\uff0c\u53ef\u591a\u9009\u3002"]));

        if (!lib.groups.length) {
          dlg.appendChild(el("div", { class: "dms-empty" }, ["\u8fd8\u6ca1\u6709\u8868\u60c5\u5305\u7ec4\uff0c\u8bf7\u53bb\u8bbe\u7f6e\u91cc\u65b0\u5efa\u3002"]));
        } else {
          lib.groups.forEach(function (g) {
            var isOn = mounted.indexOf(g.id) >= 0;
            var row = el("label", { style: { display: "flex", alignItems: "center", gap: "8px", padding: "6px 0", cursor: "pointer", borderBottom: "1px solid var(--line)" } }, [
              el("input", { type: "checkbox", checked: isOn, style: { accentColor: "var(--red)" } }),
              el("div", { style: { flex: "1" } }, [
                el("div", { style: { fontSize: "13px", fontWeight: "600" } }, [g.name]),
                el("div", { style: { fontSize: "11px", color: "var(--ink-mute)" } }, [(g.stickers || []).length + " \u4e2a\u8868\u60c5\u5305"])
              ])
            ]);
            var cb = row.querySelector("input");
            cb.addEventListener("change", function () {
              if (this.checked) {
                if (mounted.indexOf(g.id) < 0) mounted.push(g.id);
              } else {
                mounted = mounted.filter(function (x) { return x !== g.id; });
              }
            });
            dlg.appendChild(row);
          });
        }

        var btnRow = el("div", { style: { display: "flex", gap: "8px", marginTop: "12px" } }, [
          el("button", { class: "dms-btn dms-btn-sm", onclick: function () {
            if (!lib.sessionGroups) lib.sessionGroups = {};
            lib.sessionGroups[cid] = mounted;
            saveStickerLib(roche, lib).then(function () {
              toast("\u5df2\u4fdd\u5b58");
              overlay.remove();
            });
          } }, ["\u4fdd\u5b58"]),
          el("button", { class: "dms-btn dms-btn-sm dms-btn-ghost", onclick: function () { overlay.remove(); } }, ["\u53d6\u6d88"])
        ]);
        dlg.appendChild(btnRow);
        overlay.appendChild(dlg);
        overlay.addEventListener("click", function (e) { if (e.target === overlay) overlay.remove(); });
        document.body.appendChild(overlay);
      });
    }

    /* ---------- 预设栏（思维链/格式多预设管理） ---------- */
    function buildPresetBar(kind) {
      // kind: "char" | "user"
      var bar = el("div", { class: "dms-preset-bar", style: { display: "flex", gap: "6px", alignItems: "center", marginBottom: "6px", flexWrap: "wrap" } });
      bar.appendChild(el("span", { style: { fontSize: "11px", color: "var(--ink-mute)" } }, ["\u9884\u8bbe:"]));

      getPresets(roche).then(function (presets) {
        var list = (kind === "char") ? presets.charPresets : presets.userPresets;
        if (!list.length) {
          bar.appendChild(el("span", { style: { fontSize: "11px", color: "var(--ink-mute)" } }, ["\u8fd8\u6ca1\u6709"]));
        } else {
          list.forEach(function (p) {
            var btn = el("button", {
              class: "dms-btn dms-btn-sm dms-btn-ghost",
              title: "\u70b9\u51fb\u5e94\u7528\u9884\u8bbe",
              style: { fontSize: "11px", padding: "3px 8px" },
              onclick: function () {
                if (kind === "char") {
                  state.settings.charThinkingChain = p.chain || "";
                  state.settings.charFormat = p.format || "";
                }
                saveSettings(roche, state.settings).then(function () {
                  toast("\u5df2\u5e94\u7528\u9884\u8bbe");
                  toggleSettings(true); renderContent();
                });
              }
            }, [p.name]);
            // 长按/右键编辑
            var pressTimer = null;
            btn.addEventListener("mousedown", function () {
              pressTimer = setTimeout(function () {
                pressTimer = null;
                openPresetEditor(kind, p, function () {
                  toggleSettings(true); renderContent();
                });
              }, 500);
            });
            btn.addEventListener("mouseup", function () { if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; } });
            btn.addEventListener("mouseleave", function () { if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; } });
            btn.addEventListener("contextmenu", function (ev) {
              ev.preventDefault();
              openPresetEditor(kind, p, function () { toggleSettings(true); renderContent(); });
            });
            bar.appendChild(btn);
          });
        }
        // 新建按钮
        bar.appendChild(el("button", {
          class: "dms-btn dms-btn-sm",
          style: { fontSize: "11px", padding: "3px 8px" },
          onclick: function () { openPresetEditor(kind, null, function () { toggleSettings(true); renderContent(); }); }
        }, ["+ \u4fdd\u5b58\u5f53\u524d\u4e3a\u9884\u8bbe"]));
      });

      return bar;
    }

    /* ---------- 预设编辑器 ---------- */
    function openPresetEditor(kind, existing, onDone) {
      var overlay = el("div", {
        class: "dms-sync-overlay dms-float",
        style: { position: "fixed", inset: "0", background: "rgba(74,60,40,0.5)", zIndex: "700", display: "flex", alignItems: "center", justifyContent: "center" }
      });
      var dlg = el("div", {
        class: "dms-card tape-blue",
        style: { width: "90%", maxWidth: "440px", maxHeight: "85vh", overflowY: "auto", padding: "16px" }
      });
      var isNew = !existing;
      var data = existing ? JSON.parse(JSON.stringify(existing)) : {
        id: "p" + Date.now(),
        name: "",
        chain: state.settings.charThinkingChain || "",
        format: state.settings.charFormat || ""
      };

      dlg.appendChild(el("div", { class: "dms-page-header", style: { marginBottom: "10px" } }, [
        el("div", { class: "dms-page-title" }, [isNew ? "\u4fdd\u5b58\u4e3a\u9884\u8bbe" : "\u7f16\u8f91\u9884\u8bbe"]),
        el("button", { class: "dms-btn dms-btn-sm dms-btn-ghost", onclick: function () { overlay.remove(); } }, ["\u5173\u95ed"])
      ]));

      dlg.appendChild(el("div", { style: { fontSize: "12px", color: "var(--ink-dim)", marginBottom: "4px" } }, ["\u9884\u8bbe\u540d\u79f0"]));
      var nameInput = el("input", { class: "dms-input", placeholder: "\u5982\uff1a\u9ed8\u8ba4\u3001\u7b80\u6d01\u7248\u3001\u60c5\u611f\u7ec6\u817b\u7248", value: data.name, style: { width: "100%" } });
      dlg.appendChild(nameInput);

      dlg.appendChild(el("div", { style: { fontSize: "12px", color: "var(--ink-dim)", margin: "10px 0 4px" } }, ["\u601d\u7ef4\u94fe"]));
      var chainArea = el("textarea", { class: "dms-textarea", placeholder: "\u8bf7\u8f93\u5165\u601d\u7ef4\u94fe\u2026", style: { width: "100%", minHeight: "100px" } });
      chainArea.value = data.chain || "";
      dlg.appendChild(chainArea);

      dlg.appendChild(el("div", { style: { fontSize: "12px", color: "var(--ink-dim)", margin: "10px 0 4px" } }, ["\u8f93\u51fa\u683c\u5f0f"]));
      var formatArea = el("textarea", { class: "dms-textarea", placeholder: "\u8f93\u51fa\u683c\u5f0f\u6307\u4ee4\u2026", style: { width: "100%", minHeight: "60px" } });
      formatArea.value = data.format || "";
      dlg.appendChild(formatArea);

      dlg.appendChild(el("div", { style: { display: "flex", gap: "8px", marginTop: "12px" } }, [
        el("button", {
          class: "dms-btn dms-btn-sm dms-btn-primary",
          style: { flex: "1" },
          onclick: function () {
            if (!nameInput.value.trim()) { toast("\u8bf7\u586b\u540d\u79f0"); return; }
            data.name = nameInput.value.trim();
            data.chain = chainArea.value;
            data.format = formatArea.value;
            getPresets(roche).then(function (presets) {
              var list = (kind === "char") ? presets.charPresets : presets.userPresets;
              var idx = list.findIndex(function (x) { return x.id === data.id; });
              if (idx >= 0) list[idx] = data; else list.push(data);
              return savePresets(roche, presets).then(function () {
                toast("\u5df2\u4fdd\u5b58");
                overlay.remove();
                if (onDone) onDone();
              });
            });
          }
        }, ["\u4fdd\u5b58"]),
        el("button", {
          class: "dms-btn dms-btn-sm dms-btn-ghost",
          onclick: function () { overlay.remove(); }
        }, ["\u53d6\u6d88"])
      ]));

      // 删除按钮（仅编辑时）
      if (!isNew) {
        dlg.appendChild(el("button", {
          class: "dms-btn dms-btn-sm",
          style: { marginTop: "6px", width: "100%", color: "var(--red)" },
          onclick: function () {
            getPresets(roche).then(function (presets) {
              var list = (kind === "char") ? presets.charPresets : presets.userPresets;
              var filtered = list.filter(function (x) { return x.id !== data.id; });
              if (kind === "char") presets.charPresets = filtered;
              else presets.userPresets = filtered;
              return savePresets(roche, presets).then(function () {
                toast("\u5df2\u5220\u9664");
                overlay.remove();
                if (onDone) onDone();
              });
            });
          }
        }, ["\u5220\u9664\u8be5\u9884\u8bbe"]));
      }

      overlay.appendChild(dlg);
      overlay.addEventListener("click", function (e) { if (e.target === overlay) overlay.remove(); });
      document.body.appendChild(overlay);
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

      // TA的思维链（带预设栏）
      var sec2 = el("div", { class: "dms-settings-section" }, [
        el("h3", {}, ["TA\u7684\u601d\u7ef4\u94fe"]),
        el("div", { class: "dms-hint", style: { marginBottom: "6px" } }, ["{{char}}\u4f1a\u88ab\u66ff\u6362\u4e3a\u89d2\u8272\u540d"])
      ]);
      sec2.appendChild(buildPresetBar("char"));
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
      // 重置为默认思维链和格式（解决旧版本设置遗留的问题）
      sec2.appendChild(el("button", {
        class: "dms-btn dms-btn-sm",
        style: { marginTop: "8px", width: "100%", color: "var(--red)", borderColor: "var(--line)" },
        onclick: function () {
          roche.ui.confirm({
            title: "\u91cd\u7f6e\u4e3a\u9ed8\u8ba4",
            message: "\u5c06\u628a TA \u7684\u601d\u7ef4\u94fe\u548c\u8f93\u51fa\u683c\u5f0f\u91cd\u7f6e\u4e3a\u63d2\u4ef6\u9ed8\u8ba4\u503c\uff08\u6700\u65b0\u7248\u672c\uff09\u3002\u5df2\u81ea\u5b9a\u4e49\u7684\u5185\u5bb9\u4f1a\u88ab\u8986\u76d6\uff0c\u662f\u5426\u7ee7\u7eed\uff1f"
          }).then(function (ok) {
            if (!ok) return;
            state.settings.charThinkingChain = DEFAULT_SETTINGS.charThinkingChain;
            state.settings.charFormat = DEFAULT_SETTINGS.charFormat;
            saveSettings(roche, state.settings).then(function () {
              tc.value = state.settings.charThinkingChain;
              cf.value = state.settings.charFormat;
              toast("\u5df2\u91cd\u7f6e\u4e3a\u9ed8\u8ba4");
            });
          });
        }
      }, ["\u21bb \u91cd\u7f6e\u4e3a\u9ed8\u8ba4\u601d\u7ef4\u94fe/\u683c\u5f0f"]));
      body.appendChild(sec2);

      // 记忆同步
      var sec4 = el("div", { class: "dms-settings-section" }, [
        el("h3", {}, ["\u8bb0\u5fc6\u540c\u6b65"])
      ]);
      sec4.appendChild(makeSwitch("\u751f\u6210\u540e\u81ea\u52a8\u540c\u6b65\u5230\u4e8b\u5b9e\u8bb0\u5fc6", "\u5199\u5165\u7684\u662fRoche\u4e3b\u4e8b\u5b9e\u8bb0\u5fc6\uff0c\u5378\u8f7d\u63d2\u4ef6\u4e0d\u4f1a\u81ea\u52a8\u5220\u9664\u3002", state.settings.autoSyncAfterGenerate, function (v) {
        state.settings.autoSyncAfterGenerate = v; saveSettings(roche, state.settings);
        renderContent();
      }));
      if (state.settings.autoSyncAfterGenerate) {
        sec4.appendChild(el("div", { class: "dms-warn-box" }, ["\u5df2\u5f00\u542f\u81ea\u52a8\u540c\u6b65\uff1a\u6bcf\u6b21\u751f\u6210\u6210\u529f\u540e\u4f1a\u5199\u5165\u4e3b\u4e8b\u5b9e\u8bb0\u5fc6\u3002\u4e3b\u8bb0\u5fc6\u4e0d\u4f1a\u968f\u63d2\u4ef6\u5378\u8f7d\u800c\u5220\u9664\uff0c\u8bf7\u8c28\u614e\u4f7f\u7528\u3002"]));
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

      // 便签默认样式
      var secSticky = el("div", { class: "dms-settings-section" }, [
        el("h3", {}, ["\u4fbf\u7b7e\u9ed8\u8ba4\u6837\u5f0f"]),
        el("div", { class: "dms-hint", style: { marginBottom: "6px" } }, ["\u4e3a\u81ea\u5df1\u548c TA \u5206\u522b\u9009\u4e00\u6b3e\u9ed8\u8ba4\u4fbf\u7b7e\uff0c\u4e0d\u9009\u5219\u968f\u673a\u3002\u00b7\u957f\u6309/\u53f3\u952e\u5355\u4e2a\u4fbf\u7b7e\u8fd8\u53ef\u81ea\u5b9a\u4e49\u989c\u8272\u548c\u5b57\u4f53\u3002"])
      ]);

      // user 自己的默认便签
      secSticky.appendChild(el("div", { style: { fontSize: "12px", color: "var(--ink)", fontWeight: "600", marginBottom: "4px" } }, ["\u6211\u7684\u9ed8\u8ba4\u4fbf\u7b7e"]));
      var userStyleRow = el("div", { class: "dms-sticky-style-picker", style: { marginBottom: "10px" } });
      function setActiveInRow(row, getValue) {
        var items = row.querySelectorAll(".dms-sticky-style-item");
        items.forEach(function (it) {
          var itVal = it.getAttribute("data-sid");
          var cur = getValue();
          var isActive = (itVal === "null" && cur == null) || (itVal !== "null" && Number(itVal) === cur);
          if (isActive) it.classList.add("active"); else it.classList.remove("active");
        });
      }
      // "随机" 选项
      var randUserItem = el("div", {
        class: "dms-sticky-style-item" + (state.settings.defaultStickyStyle == null ? " active" : ""),
        title: "\u968f\u673a",
        "data-sid": "null",
        style: { background: "linear-gradient(135deg,#FFE4A0,#FFCDD2,#C8E6C9,#BBDEFB)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "10px", color: "#5a4632" },
        onclick: function () {
          state.settings.defaultStickyStyle = null;
          saveSettings(roche, state.settings);
          setActiveInRow(userStyleRow, function () { return state.settings.defaultStickyStyle; });
        }
      }, ["\u2685"]);
      userStyleRow.appendChild(randUserItem);
      STICKY_STYLES.forEach(function (st) {
        userStyleRow.appendChild(el("div", {
          class: "dms-sticky-style-item" + (state.settings.defaultStickyStyle === st.id ? " active" : ""),
          "data-sid": String(st.id),
          style: { background: st.color },
          title: st.name,
          onclick: function () {
            state.settings.defaultStickyStyle = st.id;
            saveSettings(roche, state.settings);
            setActiveInRow(userStyleRow, function () { return state.settings.defaultStickyStyle; });
          }
        }));
      });
      secSticky.appendChild(userStyleRow);

      // char 的默认便签
      secSticky.appendChild(el("div", { style: { fontSize: "12px", color: "var(--ink)", fontWeight: "600", marginBottom: "4px" } }, ["TA \u7ed9\u6211\u5199\u4fbf\u7b7e\u65f6\u4f7f\u7528"]));
      var charStyleRow = el("div", { class: "dms-sticky-style-picker", style: { marginBottom: "6px" } });
      var randCharItem = el("div", {
        class: "dms-sticky-style-item" + (state.settings.defaultCharStickyStyle == null ? " active" : ""),
        title: "\u968f\u673a\u5faa\u73af",
        "data-sid": "null",
        style: { background: "linear-gradient(135deg,#FFE4A0,#FFCDD2,#C8E6C9,#BBDEFB)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "10px", color: "#5a4632" },
        onclick: function () {
          state.settings.defaultCharStickyStyle = null;
          saveSettings(roche, state.settings);
          setActiveInRow(charStyleRow, function () { return state.settings.defaultCharStickyStyle; });
        }
      }, ["\u2685"]);
      charStyleRow.appendChild(randCharItem);
      STICKY_STYLES.forEach(function (st) {
        charStyleRow.appendChild(el("div", {
          class: "dms-sticky-style-item" + (state.settings.defaultCharStickyStyle === st.id ? " active" : ""),
          "data-sid": String(st.id),
          style: { background: st.color },
          title: st.name,
          onclick: function () {
            state.settings.defaultCharStickyStyle = st.id;
            saveSettings(roche, state.settings);
            setActiveInRow(charStyleRow, function () { return state.settings.defaultCharStickyStyle; });
          }
        }));
      });
      secSticky.appendChild(charStyleRow);

      // user 自定义便签 CSS 样式管理（独立入口，可预览不同样式）
      secSticky.appendChild(el("div", { style: { fontSize: "12px", color: "var(--ink)", fontWeight: "600", margin: "14px 0 6px", borderTop: "1px dashed var(--line)", paddingTop: "10px" } }, ["\u81ea\u5b9a\u4e49\u4fbf\u7b7e\u6837\u5f0f (CSS)"]));
      secSticky.appendChild(el("div", { class: "dms-hint", style: { marginBottom: "8px" } }, ["\u7528 CSS \u81ea\u5b9a\u4e49\u4fbf\u7b7e\u6837\u5f0f\uff0c\u5199\u4fbf\u7b7e\u65f6\u53ef\u9009\u7528\u3002\u53ef\u9884\u89c8\u4e0d\u540c\u6548\u679c\u3002"]));
      var customStyleList = el("div", { class: "dms-custom-style-list", style: { marginBottom: "8px" } });
      function renderCustomStyleList() {
        customStyleList.innerHTML = "";
        getCustomNoteStyles(roche).then(function (list) {
          if (!list.length) {
            customStyleList.appendChild(el("div", { style: { fontSize: "11px", color: "var(--ink-mute)", padding: "6px 0" } }, ["\u8fd8\u6ca1\u6709\u81ea\u5b9a\u4e49\u6837\u5f0f\uff0c\u70b9\u4e0b\u65b9\u201c+ \u65b0\u5efa\u201d\u3002"]));
            return;
          }
          list.forEach(function (cs) {
            var row = el("div", { style: { display: "flex", alignItems: "center", gap: "8px", padding: "6px 0", borderBottom: "1px solid var(--line)" } });
            // 预览
            row.appendChild(el("div", {
              class: "dms-sticky custom-" + cs.id,
              style: { position: "relative", left: "0", top: "0", width: "40px", height: "30px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "10px", flexShrink: "0" }
            }, ["\u9884\u89c8"]));
            row.appendChild(el("div", { style: { flex: "1", fontSize: "12px", color: "var(--ink)" } }, [cs.name]));
            row.appendChild(el("button", {
              class: "dms-btn dms-btn-sm dms-btn-ghost",
              onclick: function () { openCustomNoteEditor(cs, function () { renderCustomStyleList(); }); }
            }, ["\u7f16\u8f91"]));
            row.appendChild(el("button", {
              class: "dms-btn dms-btn-sm dms-btn-ghost",
              style: { color: "var(--red)" },
              onclick: function () {
                roche.ui.confirm({ title: "\u5220\u9664\u6837\u5f0f", message: "\u5220\u9664\u81ea\u5b9a\u4e49\u6837\u5f0f\u300c" + cs.name + "\u300d\uff1f" }).then(function (ok) {
                  if (!ok) return;
                  getCustomNoteStyles(roche).then(function (all) {
                    var filtered = all.filter(function (x) { return x.id !== cs.id; });
                    return saveCustomNoteStyles(roche, filtered).then(function () {
                      applyCustomNoteStyles(filtered);
                      renderCustomStyleList();
                      toast("\u5df2\u5220\u9664");
                    });
                  });
                });
              }
            }, ["\u5220\u9664"]));
            customStyleList.appendChild(row);
          });
        });
      }
      renderCustomStyleList();
      secSticky.appendChild(customStyleList);
      secSticky.appendChild(el("button", {
        class: "dms-btn dms-btn-sm dms-btn-primary",
        style: { width: "100%" },
        onclick: function () { openCustomNoteEditor(null, function () { renderCustomStyleList(); }); }
      }, ["+ \u65b0\u5efa\u81ea\u5b9a\u4e49\u6837\u5f0f"]));

      // 隐藏 TA 给 user 的便签开关
      secSticky.appendChild(el("div", { style: { borderTop: "1px dashed var(--line)", marginTop: "12px", paddingTop: "10px" } }, [
        makeSwitch("\u9690\u85cf TA \u7ed9\u6211\u5199\u7684\u4fbf\u7b7e", "\u906e\u6321\u65f6\u5f00\u542f\uff0c\u4fbf\u7b7e\u4ecd\u4f1a\u6ce8\u5165\u8bb0\u5fc6\uff0c\u53ea\u662f\u4e0d\u663e\u793a", state.settings.hideCharStickies, function (v) {
          state.settings.hideCharStickies = v; saveSettings(roche, state.settings); renderContent();
        })
      ]));

      body.appendChild(secSticky);

      // 表情包库
      var sec6 = el("div", { class: "dms-settings-section" }, [
        el("h3", {}, ["\u8868\u60c5\u5305\u5e93"]),
        el("div", { class: "dms-hint", style: { marginBottom: "6px" } }, ["\u901a\u8fc7URL\u5bfc\u5165\u8868\u60c5\u5305\uff0c\u53ef\u5206\u7ec4\u7ba1\u7406\uff0c\u6bcf\u4e2a\u4f1a\u8bdd\u53ef\u6302\u8f7d\u4e0d\u540c\u7ec4\u3002"])
      ]);
      var stickerBox = el("div", { class: "dms-sticker-box" });
      sec6.appendChild(stickerBox);
      body.appendChild(sec6);
      // 异步渲染表情包库管理
      renderStickerLibManager(stickerBox);

      panel.appendChild(body);
      return panel;
    }

    /* ---------- 表情包库管理 ---------- */
    /* ---------- 批量导入表情包对话框 ---------- */
    function openBatchStickerDialog(group, onDone) {
      var overlay = el("div", {
        class: "dms-sync-overlay dms-float",
        style: { position: "fixed", inset: "0", background: "rgba(74,60,40,0.5)", zIndex: "700", display: "flex", alignItems: "center", justifyContent: "center" }
      });
      var dlg = el("div", {
        class: "dms-card tape-blue",
        style: { width: "90%", maxWidth: "460px", maxHeight: "85vh", overflowY: "auto", padding: "16px" }
      });
      dlg.appendChild(el("div", { class: "dms-page-header", style: { marginBottom: "10px" } }, [
        el("div", { class: "dms-page-title" }, ["\u6279\u91cf\u5bfc\u5165\u8868\u60c5\u5305"]),
        el("button", { class: "dms-btn dms-btn-sm dms-btn-ghost", onclick: function () { overlay.remove(); } }, ["\u5173\u95ed"])
      ]));
      dlg.appendChild(el("div", { class: "dms-hint", style: { marginBottom: "8px" } }, [
        "\u6bcf\u884c\u4e00\u6761\uff0c\u683c\u5f0f\uff1a",
        el("br"),
        el("code", { style: { fontSize: "11px", color: "var(--red)" } }, "\u63cf\u8ff0:URL"),
        " \u6216\u76f4\u63a5\u8d34 URL\uff08\u63cf\u8ff0\u53ef\u7701\u7565\uff09",
        el("br"),
        "\u652f\u6301\u4e2d\u82f1\u6587\u5192\u53f7 \u3001\u5168\u89d2\u5192\u53f7 \uff1a \u4ee5\u53ca\u5236\u8868\u7b26 | \u4f5c\u4e3a\u5206\u9694\u7b26\u3002"
      ]));

      var area = el("textarea", {
        class: "dms-textarea",
        placeholder: "\u6708\u85aa\u55b5\u6652\u7194\u4e86:`https://cdn.imgos.cn/vip/2026/05/18/6a09f39b2734e.gif`\n\u6708\u85aa\u55b5\u542c\u6b4c:`https://cdn.imgos.cn/vip/2026/05/18/6a09f34aefaf1.gif`\n\u6708\u85aa\u55b5\u517b\u751f:`https://cdn.imgos.cn/vip/2026/05/18/6a09f34b35a6.gif`\nhttps://example.com/sticker.png",
        style: { width: "100%", minHeight: "160px", fontFamily: "monospace", fontSize: "11px", whiteSpace: "pre" }
      });
      dlg.appendChild(area);

      // 预览解析结果
      var previewBox = el("div", { style: { marginTop: "8px", fontSize: "11px", color: "var(--ink-mute)" } }, []);
      dlg.appendChild(previewBox);
      function parseStickerLines(text) {
        var lines = (text || "").split(/\r?\n/);
        var items = [];
        lines.forEach(function (line) {
          var s = line.trim();
          if (!s) return;
          var m = s.match(/^(.+?)\s*[:\uff1a|\u00a6]\s*(https?:\/\/\S+)$/);
          if (m) {
            items.push({ caption: m[1].trim(), url: m[2].trim() });
          } else if (s.match(/^https?:\/\/\S+$/)) {
            items.push({ caption: "", url: s.trim() });
          }
        });
        return items;
      }
      area.addEventListener("input", function () {
        var items = parseStickerLines(area.value);
        previewBox.textContent = "\u5c06\u5bfc\u5165 " + items.length + " \u4e2a\u8868\u60c5\u5305";
      });

      dlg.appendChild(el("div", { style: { display: "flex", gap: "8px", marginTop: "12px" } }, [
        el("button", {
          class: "dms-btn dms-btn-sm dms-btn-primary",
          style: { flex: "1" },
          onclick: function () {
            var items = parseStickerLines(area.value);
            if (!items.length) { toast("\u6ca1\u6709\u53ef\u5bfc\u5165\u7684\u8868\u60c5\u5305"); return; }
            items.forEach(function (it) {
              group.stickers.push({
                id: "s" + Date.now() + Math.random().toString(36).slice(2, 6),
                url: it.url,
                caption: it.caption
              });
            });
            saveStickerLib(roche, state.stickerLib).then(function () {
              toast("\u5df2\u5bfc\u5165 " + items.length + " \u4e2a");
              overlay.remove();
              if (onDone) onDone();
            });
          }
        }, ["\u5bfc\u5165"]),
        el("button", {
          class: "dms-btn dms-btn-sm dms-btn-ghost",
          onclick: function () { overlay.remove(); }
        }, ["\u53d6\u6d88"])
      ]));

      overlay.appendChild(dlg);
      overlay.addEventListener("click", function (e) { if (e.target === overlay) overlay.remove(); });
      document.body.appendChild(overlay);
    }

    function renderStickerLibManager(box) {
      box.innerHTML = "";
      getStickerLib(roche).then(function (lib) {
        state.stickerLib = lib;
        // 新建组
        var addGroupBtn = el("button", { class: "dms-btn dms-btn-sm dms-btn-ghost", style: { marginBottom: "8px" } }, ["\u65b0\u5efa\u7ec4"]);
        addGroupBtn.addEventListener("click", function () {
          var name = window.prompt("\u7ec4\u540d\uff08\u5982\uff1a\u9ed1\u8138\u3001\u53ef\u7231\u3001\u840c\u7cfb\uff09", "\u65b0\u7ec4");
          if (!name || !name.trim()) return;
          var g = { id: "g" + Date.now(), name: name.trim(), stickers: [] };
          lib.groups.push(g);
          saveStickerLib(roche, lib).then(function () { renderStickerLibManager(box); toast("\u5df2\u65b0\u5efa"); });
        });
        box.appendChild(addGroupBtn);

        if (!lib.groups.length) {
          box.appendChild(el("div", { class: "dms-empty" }, ["\u8fd8\u6ca1\u6709\u8868\u60c5\u5305\u7ec4\uff0c\u70b9\u4e0a\u9762\u65b0\u5efa\u3002"]));
          return;
        }

        lib.groups.forEach(function (g) {
          var gcard = el("div", { class: "dms-sticker-group" });
          var head = el("div", { class: "dms-sticker-group-head" }, [
            el("input", {
              class: "dms-input dms-sticker-group-name",
              value: g.name,
              style: { flex: "1", fontSize: "13px", fontWeight: "600" },
              onchange: function () {
                g.name = this.value || g.name;
                saveStickerLib(roche, lib).then(function () { toast("\u5df2\u4fdd\u5b58"); });
              }
            }),
            el("button", { class: "dms-btn dms-btn-sm dms-btn-ghost", onclick: function () {
              roche.ui.confirm({ title: "\u5220\u9664\u7ec4", message: "\u5220\u9664\u7ec4\u300c" + g.name + "\u300d\u53ca\u5176\u8868\u60c5\u5305\uff1f" }).then(function (ok) {
                if (!ok) return;
                lib.groups = lib.groups.filter(function (x) { return x.id !== g.id; });
                // 清理会话挂载
                Object.keys(lib.sessionGroups || {}).forEach(function (cid) {
                  lib.sessionGroups[cid] = (lib.sessionGroups[cid] || []).filter(function (id) { return id !== g.id; });
                });
                saveStickerLib(roche, lib).then(function () { renderStickerLibManager(box); toast("\u5df2\u5220\u9664"); });
              });
            } }, ["\u5220"])
          ]);
          gcard.appendChild(head);

          // 表情包列表
          var grid = el("div", { class: "dms-sticker-grid" });
          (g.stickers || []).forEach(function (s) {
            var cell = el("div", { class: "dms-sticker-cell" }, [
              el("img", { src: s.url, class: "dms-sticker-img", onerror: function () { this.style.opacity = "0.3"; } }),
              el("div", { class: "dms-sticker-caption" }, [s.caption || ""]),
              el("button", { class: "dms-sticker-cell-del", onclick: function () {
                g.stickers = g.stickers.filter(function (x) { return x.id !== s.id; });
                saveStickerLib(roche, lib).then(function () { renderStickerLibManager(box); });
              } }, ["\u00d7"])
            ]);
            // 点 caption 编辑
            var capEl = cell.querySelector(".dms-sticker-caption");
            capEl.addEventListener("dblclick", function () {
              var v = window.prompt("\u8868\u60c5\u5305\u542b\u4e49", s.caption || "");
              if (v != null) { s.caption = v; saveStickerLib(roche, lib).then(function () { renderStickerLibManager(box); }); }
            });
            grid.appendChild(cell);
          });
          gcard.appendChild(grid);

          // 添加表情包 - 支持批量导入（每行一条：描述:URL 或仅 URL）
          var addBtn = el("button", { class: "dms-btn dms-btn-sm", style: { marginTop: "6px" } }, ["\u6dfb\u52a0\u8868\u60c5\u5305 (\u6279\u91cf)"]);
          addBtn.addEventListener("click", function () {
            openBatchStickerDialog(g, function () { renderStickerLibManager(box); });
          });
          gcard.appendChild(addBtn);

          box.appendChild(gcard);
        });
      }).catch(function () {
        box.appendChild(el("div", { class: "dms-empty" }, ["\u52a0\u8f7d\u5931\u8d25"]));
      });
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

    /* ---------- 周期整理对话框 ---------- */
    function buildPeriodDialogView() {
      var wrap = el("div", { class: "dms-wrap dms-fade-in" });
      var card = el("div", { class: "dms-card" }, [
        el("h2", {}, [el("span", { class: "dms-badge" }, ["\u2605"]), " \u6309\u5468\u671f\u6574\u7406"]),
        el("div", { class: "dms-card-sub" }, ["\u9009\u62e9\u5468\u671f\u7c7b\u578b\u4e0e\u6574\u7406\u7d20\u6750\uff0c\u751f\u6210\u603b\u7ed3\u65e5\u8bb0\u3002"])
      ]);

      // 基准日期（默认当前选中日期）
      var dateInput = el("input", { type: "date", class: "dms-input" });
      dateInput.value = toDateInput(state.selectedDate);
      dateInput.max = toDateInput(new Date());
      dateInput.addEventListener("change", function () {
        if (this.value) state.selectedDate = parseDateInput(this.value);
      });
      card.appendChild(el("div", { style: { marginBottom: "10px" } }, [
        el("div", { style: { fontSize: "12px", color: "var(--ink-dim)", marginBottom: "4px" } }, ["\u57fa\u51c6\u65e5\u671f\uff08\u51b3\u5b9a\u5468\u671f\u8303\u56f4\uff09"]),
        dateInput
      ]));

      // 周期类型选择
      var periodType = "week";
      var customDays = 3;  // 自定义天数默认值
      var typeGroup = el("div", { style: { display: "flex", gap: "6px", marginBottom: "10px", flexWrap: "wrap" } });
      var periodBtns = {};
      [["week", "\u6309\u5468"], ["halfmonth", "\u6309\u534a\u6708"], ["month", "\u6309\u6708"], ["dayN", "\u81ea\u5b9a\u4e49\u5929\u6570"]].forEach(function (opt) {
        var btn = el("button", {
          class: "dms-btn dms-btn-sm" + (periodType === opt[0] ? " dms-btn-primary" : " dms-btn-ghost"),
          onclick: function () {
            periodType = opt[0];
            typeGroup.querySelectorAll("button").forEach(function (b) {
              b.classList.remove("dms-btn-primary");
              b.classList.add("dms-btn-ghost");
            });
            btn.classList.remove("dms-btn-ghost");
            btn.classList.add("dms-btn-primary");
            customDaysRow.style.display = (periodType === "dayN") ? "flex" : "none";
            updateRangeHint();
          }
        }, [opt[1]]);
        periodBtns[opt[0]] = btn;
        typeGroup.appendChild(btn);
      });
      card.appendChild(typeGroup);

      // 自定义天数输入行（默认隐藏）
      var customDaysRow = el("div", { style: { display: "none", alignItems: "center", gap: "8px", marginBottom: "10px" } });
      customDaysRow.appendChild(el("label", { style: { fontSize: "12px", color: "var(--ink-dim)" } }, ["\u5929\u6570\uff1a"]));
      var daysInput = el("input", {
        type: "number", min: "1", max: "60", step: "1", value: String(customDays),
        style: { width: "70px", padding: "4px 8px", fontSize: "12px", border: "1px solid var(--line)", borderRadius: "4px" },
        oninput: function () {
          customDays = Math.max(1, parseInt(this.value, 10) || 1);
          updateRangeHint();
        }
      });
      customDaysRow.appendChild(daysInput);
      customDaysRow.appendChild(el("span", { style: { fontSize: "11px", color: "var(--ink-mute)" } }, ["\u4ee5\u57fa\u51c6\u65e5\u671f\u4e3a\u7ec8\u70b9\uff0c\u5411\u524d\u7edf\u8ba1 N \u5929"]));
      card.appendChild(customDaysRow);

      // 范围提示
      var rangeHint = el("div", { style: { fontSize: "12px", color: "var(--blue)", marginBottom: "10px" } });
      function updateRangeHint() {
        var r = getPeriodRange(periodType, state.selectedDate, customDays);
        rangeHint.textContent = "\u8303\u56f4\uff1a" + r[0] + " \u81f3 " + r[1];
      }
      updateRangeHint();
      card.appendChild(rangeHint);

      // 数据源选择
      var sourceType = "chat";
      var srcGroup = el("div", { style: { display: "flex", gap: "6px", marginBottom: "12px" } });
      [["chat", "\u804a\u5929\u8bb0\u5f55"], ["daily", "\u5df2\u751f\u6210\u7684\u6309\u65e5\u65e5\u8bb0"]].forEach(function (opt) {
        var btn = el("button", {
          class: "dms-btn dms-btn-sm" + (sourceType === opt[0] ? " dms-btn-primary" : " dms-btn-ghost"),
          onclick: function () {
            sourceType = opt[0];
            srcGroup.querySelectorAll("button").forEach(function (b) {
              b.classList.remove("dms-btn-primary");
              b.classList.add("dms-btn-ghost");
            });
            btn.classList.remove("dms-btn-ghost");
            btn.classList.add("dms-btn-primary");
          }
        }, [opt[1]]);
        srcGroup.appendChild(btn);
      });
      card.appendChild(srcGroup);

      // ===== 按日日记列表：可查看、勾选、删除 =====
      var dailyDiaryList = el("div", { class: "dms-card", style: { marginTop: "6px", padding: "10px", border: "1px solid var(--line)", borderRadius: "var(--radius)" } });
      dailyDiaryList.appendChild(el("div", { style: { fontSize: "12px", color: "var(--ink-dim)", marginBottom: "6px" } }, ["\u5df2\u5b58\u7684\u6309\u65e5\u65e5\u8bb0\uff1a"]));
      var dailyBody = el("div", { style: { maxHeight: "250px", overflowY: "auto" } });
      dailyDiaryList.appendChild(dailyBody);
      function loadDailyDiaryList() {
        dailyBody.innerHTML = "";
        getDiariesByMode(roche, "solo").then(function (all) {
          var cid = state.selectedConv ? (state.selectedConv.conversationId || state.selectedConv.id) : "";
          var keys = Object.keys(all).filter(function (k) { return k.split(":")[0] === cid; })
            .sort(function (a, b) { return b > a ? 1 : -1; });
          if (!keys.length) {
            dailyBody.appendChild(el("div", { class: "dms-empty", style: { fontSize: "11px" } }, ["\u6682\u65e0\u6309\u65e5\u65e5\u8bb0\u3002"]));
            return;
          }
          var countEl = el("span", { style: { fontSize: "11px", color: "var(--blue)" } }, [String(keys.length) + " \u7bc7"]);
          dailyDiaryList.querySelector(".dms-card-sub") && dailyDiaryList.removeChild(dailyDiaryList.querySelector(".dms-card-sub"));
          var sub = el("div", { class: "dms-card-sub", style: { marginBottom: "4px" } });
          sub.appendChild(countEl);
          dailyDiaryList.insertBefore(sub, dailyBody);
          keys.forEach(function (k) {
            var it = all[k];
            var dk = it.dateKey || "";
            var item = el("div", {
              class: "dms-hist",
              style: { cursor: "pointer", display: "flex", alignItems: "center", gap: "6px", padding: "4px", margin: "2px 0" },
              onclick: function (e) {
                if (e.target.tagName === "BUTTON" || e.target.tagName === "INPUT") return;
                showFullTextPopup(dk, it.charDiary || "");
              }
            });
            item.appendChild(el("span", { style: { flex: "1", fontSize: "11px" } }, [dk + " " + (it.charDiary || "").slice(0, 30) + "\u2026"]));
            // 删除按钮
            item.appendChild(el("button", {
              class: "dms-btn dms-btn-sm",
              style: { fontSize: "10px", padding: "0 4px", color: "var(--red)" },
              onclick: function (ev) {
                ev.stopPropagation();
                deleteDiaryByMode(roche, "solo", k).then(function () {
                  toast("\u5df2\u5220\u9664 " + dk);
                  loadDailyDiaryList();
                });
              }
            }, ["\u00d7"]));
            dailyBody.appendChild(item);
          });
        });
      }
      loadDailyDiaryList();
      card.appendChild(dailyDiaryList);

      // 生成按钮
      var genBtn = el("button", { class: "dms-btn dms-btn-primary", style: { width: "100%" } }, ["\u751f\u6210\u603b\u7ed3"]);
      genBtn.addEventListener("click", function () {
        genBtn.disabled = true;
        genBtn.textContent = "\u751f\u6210\u4e2d...";
        state.generating = true;
        state.generatingMsg = "\u6b63\u5728\u751f\u6210" + getPeriodLabel(periodType, customDays) + "\u603b\u7ed3";
        renderContent();
        generatePeriodDiary(roche, state, periodType, sourceType, state.selectedDate, customDays).then(function (result) {
          state.generating = false;
          state.generatingMsg = "";
          // 进入展示视图
          state.currentDiary = result.diaryData;
          state.diaryKey = result.diaryKey;
          state.view = "periodDiaryView";
          toast("\u751f\u6210\u6210\u529f");
          renderContent();
        }).catch(function (e) {
          state.generating = false;
          state.generatingMsg = "";
          toast("\u751f\u6210\u5931\u8d25\uff1a" + (e && e.message || e));
          renderContent();
        });
      });
      card.appendChild(genBtn);

      // 返回按钮
      card.appendChild(el("button", {
        class: "dms-btn dms-btn-ghost",
        style: { width: "100%", marginTop: "6px" },
        onclick: function () { state.view = "cover"; renderContent(); }
      }, ["\u8fd4\u56de"]));

      wrap.appendChild(card);

      // 历史周期日记列表
      var histCard = el("div", { class: "dms-card", style: { marginTop: "10px" } }, [
        el("h2", {}, ["\u5386\u53f2\u603b\u7ed3"])
      ]);
      getPeriodDiaries(roche).then(function (all) {
        var cid = state.selectedConv ? (state.selectedConv.conversationId || state.selectedConv.id) : "";
        var keys = Object.keys(all).filter(function (k) { return k.indexOf(cid + ":") === 0; })
          .sort(function (a, b) { return (all[b].updatedAt || all[b].createdAt || 0) - (all[a].updatedAt || all[a].createdAt || 0); });
        if (!keys.length) {
          histCard.appendChild(el("div", { class: "dms-empty" }, ["\u6682\u65e0\u603b\u7ed3\u3002"]));
        } else {
          keys.forEach(function (k) {
            var it = all[k];
            var label = getPeriodLabel(it.period) + " " + (it.periodKey || "");
            var item = el("div", { class: "dms-hist", onclick: function () {
              state.currentDiary = it;
              state.diaryKey = k;
              state.view = "periodDiaryView";
              renderContent();
            } }, [
              el("div", { class: "dms-hist-head" }, [
                el("div", { class: "dms-hist-title" }, [label]),
                el("div", { class: "dms-hist-date" }, [new Date(it.updatedAt || it.createdAt || 0).toLocaleString()])
              ]),
              el("div", { class: "dms-hist-snippet" }, [(it.charDiary || "").slice(0, 60) + "\u2026"])
            ]);
            histCard.appendChild(item);
          });
        }
      });
      wrap.appendChild(histCard);

      return wrap;
    }

    /* ---------- 周期日记展示视图 ---------- */
    function buildPeriodDiaryDisplayView() {
      var wrap = el("div", { class: "dms-wrap dms-fade-in" });
      if (!state.currentDiary) {
        wrap.appendChild(el("div", { class: "dms-card" }, ["\u672a\u627e\u5230\u65e5\u8bb0\u3002"]));
        return wrap;
      }
      var d = state.currentDiary;
      var card = el("div", { class: "dms-card" });
      card.appendChild(el("div", { class: "dms-page-header" }, [
        el("div", {}, [
          el("div", { class: "dms-page-title" }, [getPeriodLabel(d.period, d.periodDays) + " " + (d.periodKey || "")]),
          el("div", { class: "dms-page-meta" }, [(d.dateRange || []).join(" \u81f3 ")])
        ]),
        el("div", { style: { display: "flex", gap: "4px" } }, [
          el("button", { class: "dms-tool-btn", onclick: function () { state.view = "periodDialog"; renderContent(); } }, ["\u8fd4\u56de"])
        ])
      ]));
      card.appendChild(el("div", { class: "dms-diary-text", style: { marginTop: "10px" } }, [d.charDiary || ""]));

      // 显示数据源
      if (d.source === "daily" && d.sourceDiaries && d.sourceDiaries.length) {
        card.appendChild(el("div", { style: { marginTop: "10px", fontSize: "12px", color: "var(--ink-dim)", borderTop: "1px dashed var(--line)", paddingTop: "8px" } }, [
          "\u6574\u7406\u81ea\u4ee5\u4e0b\u6309\u65e5\u65e5\u8bb0\uff1a" + d.sourceDiaries.join(" \u3001 ")
        ]));
      }

      // 同步到事实记忆按钮
      card.appendChild(el("button", {
        class: "dms-btn dms-btn-sm dms-btn-primary",
        style: { marginTop: "10px" },
        onclick: function () {
          var ctx = d.ctx || { conversationId: d.conversationId, charName: d.charName, userName: d.userName, dateKey: d.periodKey, isGroup: d.isGroup };
          syncFact(roche, ctx, d.charDiary).then(function () {
            toast("\u5df2\u540c\u6b65\u5230\u4e8b\u5b9e\u8bb0\u5fc6");
          }).catch(function (e) {
            toast("\u540c\u6b65\u5931\u8d25\uff1a" + (e && e.message || e));
          });
        }
      }, ["\u540c\u6b65\u5230\u4e8b\u5b9e\u8bb0\u5fc6"]));
      wrap.appendChild(card);
      return wrap;
    }

    /* ---------- 轮询批量生成视图 ---------- */
    function buildBatchDialogView() {
      var wrap = el("div", { class: "dms-wrap dms-fade-in" });
      var card = el("div", { class: "dms-card" }, [
        el("h2", {}, [el("span", { class: "dms-badge" }, ["\u2605"]), " \u8f6e\u8be2\u6279\u91cf\u751f\u6210"]),
        el("div", { class: "dms-card-sub" }, ["\u9009\u62e9\u591a\u4e2a\u65e5\u671f\uff0c\u4f9d\u6b21\u751f\u6210\u6309\u65e5\u65e5\u8bb0\u3002"])
      ]);

      // 范围选择模式
      var useRangeMode = false;
      var rangeStartInput = el("input", { type: "date", class: "dms-input", style: { flex: "1" } });
      var rangeEndInput = el("input", { type: "date", class: "dms-input", style: { flex: "1" } });
      rangeStartInput.max = toDateInput(new Date());
      rangeEndInput.max = toDateInput(new Date());

      // 点选日期列表
      var dateListContainer = el("div", { style: { marginTop: "10px", maxHeight: "200px", overflowY: "auto", border: "1px solid var(--line)", borderRadius: "6px", padding: "6px" } });
      var selectedDates = {};

      function renderDateList(availableDates) {
        dateListContainer.innerHTML = "";
        if (!availableDates.length) {
          dateListContainer.appendChild(el("div", { class: "dms-empty" }, ["\u6682\u65e0\u6709\u8bb0\u5f55\u7684\u65e5\u671f"]));
          return;
        }
        availableDates.forEach(function (dk) {
          var checked = !!selectedDates[dk];
          var item = el("label", { style: { display: "flex", alignItems: "center", gap: "6px", padding: "4px 0", cursor: "pointer" } }, [
            el("input", { type: "checkbox", checked: checked, onchange: function (e) {
              if (e.target.checked) selectedDates[dk] = true;
              else delete selectedDates[dk];
            } }),
            el("span", {}, [dk])
          ]);
          dateListContainer.appendChild(item);
        });
      }

      // 加载可用的日期
      listAvailableDates(roche, state).then(function (dates) {
        renderDateList(dates);
      });

      // 范围模式开关
      var modeSwitch = makeSwitch("\u8303\u56f4\u9009\u62e9\u6a21\u5f0f", "\u5f00\u542f\u540e\u53ef\u9009\u8d77\u6b62\u65e5\u671f\uff0c\u81ea\u52a8\u8865\u5143\u8303\u56f4\u5185\u6240\u6709\u5929\u6570\uff1b\u5173\u95ed\u5219\u70b9\u9009\u5217\u8868", useRangeMode, function (v) {
        useRangeMode = v;
        rangeStartInput.disabled = !v;
        rangeEndInput.disabled = !v;
        dateListContainer.style.opacity = v ? "0.4" : "1";
      });
      card.appendChild(modeSwitch);

      card.appendChild(el("div", { style: { marginTop: "8px", fontSize: "12px", color: "var(--ink-dim)" } }, ["\u53ef\u70b9\u9009\u7684\u65e5\u671f\uff1a"]));
      card.appendChild(dateListContainer);

      card.appendChild(el("div", { style: { marginTop: "8px", fontSize: "12px", color: "var(--ink-dim)" } }, ["\u6216\u9009\u8d77\u6b62\u65e5\u671f\uff1a"]));
      card.appendChild(el("div", { style: { display: "flex", gap: "6px" } }, [rangeStartInput, rangeEndInput]));
      rangeStartInput.disabled = true;
      rangeEndInput.disabled = true;

      // 覆盖已存在开关
      var overwriteSwitch = makeSwitch("\u8986\u76d6\u5df2\u5b58\u5728\u65e5\u8bb0", "\u5f00\u542f\u540e\u5c06\u91cd\u65b0\u751f\u6210\u5df2\u6709\u65e5\u8bb0\u7684\u65e5\u671f", state.overwriteExisting || false, function (v) {
        state.overwriteExisting = v;
      });
      card.appendChild(overwriteSwitch);

      // 进度显示
      var progressEl = el("div", { style: { marginTop: "10px", fontSize: "12px", color: "var(--blue)" } });
      card.appendChild(progressEl);

      // 开始按钮
      var startBtn = el("button", { class: "dms-btn dms-btn-primary", style: { width: "100%", marginTop: "10px" } }, ["\u5f00\u59cb\u8f6e\u8be2\u751f\u6210"]);
      startBtn.addEventListener("click", function () {
        var dates = [];
        if (useRangeMode) {
          var s = rangeStartInput.value, e = rangeEndInput.value;
          if (!s || !e) { toast("\u8bf7\u9009\u62e9\u8d77\u6b62\u65e5\u671f"); return; }
          if (s > e) { toast("\u8d77\u59cb\u65e5\u671f\u4e0d\u80fd\u665a\u4e8e\u7ed3\u675f\u65e5\u671f"); return; }
          // 补齐范围内所有天数
          var cur = parseDateInput(s);
          var endD = parseDateInput(e);
          while (cur <= endD) {
            dates.push(toDateKey(cur));
            cur.setDate(cur.getDate() + 1);
          }
        } else {
          dates = Object.keys(selectedDates).sort();
        }
        if (!dates.length) { toast("\u8bf7\u9009\u62e9\u81f3\u5c11\u4e00\u4e2a\u65e5\u671f"); return; }

        startBtn.disabled = true;
        startBtn.textContent = "\u751f\u6210\u4e2d...";
        progressEl.textContent = "\u5f00\u59cb\u751f\u6210 0/" + dates.length;

        batchGenerateDailyDiaries(roche, state, dates, function (idx, total, success, msg) {
          progressEl.textContent = "\u8fdb\u5ea6 " + (idx + 1) + "/" + total + " - " + msg;
        }).then(function (results) {
          var successCount = results.filter(function (r) { return r.success; }).length;
          var failCount = results.filter(function (r) { return !r.success; }).length;
          progressEl.textContent = "\u5b8c\u6210\uff01\u6210\u529f " + successCount + " \u5931\u8d25 " + failCount;
          startBtn.disabled = false;
          startBtn.textContent = "\u91cd\u65b0\u5f00\u59cb";
          toast("\u8f6e\u8be2\u751f\u6210\u5b8c\u6210");
        }).catch(function (e) {
          progressEl.textContent = "\u9519\u8bef\uff1a" + (e && e.message || e);
          startBtn.disabled = false;
          startBtn.textContent = "\u91cd\u65b0\u5f00\u59cb";
        });
      });
      card.appendChild(startBtn);

      card.appendChild(el("button", {
        class: "dms-btn dms-btn-ghost",
        style: { width: "100%", marginTop: "6px" },
        onclick: function () { state.view = "cover"; renderContent(); }
      }, ["\u8fd4\u56de"]));
      wrap.appendChild(card);
      return wrap;
    }

    /* ---------- 从长期记忆挑选视图 ---------- */
    function buildPickFromMemoryView() {
      var wrap = el("div", { class: "dms-wrap dms-fade-in" });
      var card = el("div", { class: "dms-card" }, [
        el("h2", {}, [el("span", { class: "dms-badge" }, ["\u2605"]), " \u4ece\u957f\u671f\u8bb0\u5fc6\u6311\u9009"]),
        el("div", { class: "dms-card-sub" }, ["\u52fe\u9009\u540e\u70b9\u201c\u4fdd\u5b58\u4e3a\u6309\u65e5\u65e5\u8bb0\u201d\uff0c\u5373\u53ef\u4f5c\u4e3a\u5468\u671f\u6574\u7406\u7d20\u6750\u3002"])
      ]);

      var cid = state.selectedConv ? (state.selectedConv.conversationId || state.selectedConv.id) : "";
      var pickedResults = [];
      var checkedItems = {};  // dateKey → true

      // 最低字数输入
      var minCharsInput = el("input", { type: "number", class: "dms-input", value: "50", min: "0", step: "10", style: { width: "120px" } });
      card.appendChild(el("div", { style: { marginBottom: "10px" } }, [
        el("div", { style: { fontSize: "12px", color: "var(--ink-dim)", marginBottom: "4px" } }, ["\u6700\u4f4e\u5b57\u6570\u9650\u5236"]),
        minCharsInput
      ]));

      var resultArea = el("div", { style: { marginTop: "10px", maxHeight: "350px", overflowY: "auto" } });
      card.appendChild(resultArea);

      // 全选行
      var selectAllRow = el("div", { style: { display: "none", alignItems: "center", gap: "6px", marginBottom: "4px", fontSize: "11px", color: "var(--ink-dim)" } });
      var selectAllCb = el("input", { type: "checkbox", onchange: function () {
        pickedResults.forEach(function (item) { checkedItems[item.dateKey] = selectAllCb.checked; });
        renderItemCheckboxes();
      } });
      selectAllRow.appendChild(selectAllCb);
      selectAllRow.appendChild(el("span", {}, ["\u5168\u9009"]));
      card.appendChild(selectAllRow);

      function renderItemCheckboxes() {
        var cbs = resultArea.querySelectorAll(".dms-pick-cb");
        cbs.forEach(function (cb) {
          cb.checked = !!checkedItems[cb.getAttribute("data-dk")];
        });
      }

      // 后续操作按钮区
      var actionArea = el("div", { style: { marginTop: "10px", display: "none", gap: "6px", flexWrap: "wrap" } });
      card.appendChild(actionArea);

      // 状态提示
      var statusEl = el("div", { style: { fontSize: "12px", color: "var(--blue)", marginTop: "6px", display: "none" } });
      card.appendChild(statusEl);

      var loadBtn = el("button", { class: "dms-btn dms-btn-primary", style: { width: "100%" } }, ["\u52a0\u8f7d\u8bb0\u5fc6"]);
      loadBtn.addEventListener("click", function () {
        var minChars = parseInt(minCharsInput.value, 10) || 0;
        loadBtn.disabled = true;
        loadBtn.textContent = "\u52a0\u8f7d\u4e2d...";
        resultArea.innerHTML = "";
        checkedItems = {};
        actionArea.style.display = "none";
        selectAllRow.style.display = "none";
        statusEl.style.display = "none";
        card.querySelectorAll(".dms-stat-line").forEach(function (el) { el.remove(); });

        pickDailyDiariesFromFactMemory(roche, cid, minChars).then(function (picked) {
          loadBtn.disabled = false;
          loadBtn.textContent = "\u91cd\u65b0\u52a0\u8f7d";
          pickedResults = picked;
          if (!picked.length) {
            resultArea.appendChild(el("div", { class: "dms-empty" }, ["\u672a\u627e\u5230\u7b26\u5408\u6761\u4ef6\u7684\u8bb0\u5fc6\u3002"]));
            return;
          }
          // 统计
          var statLine = el("div", { class: "dms-stat-line", style: { fontSize: "12px", color: "var(--blue)", marginBottom: "6px" } }, ["\u627e\u5230 " + picked.length + " \u7bc7"]);
          card.insertBefore(statLine, resultArea);

          picked.forEach(function (item) {
            var d = el("div", { class: "dms-hist", style: { cursor: "pointer", display: "flex", alignItems: "center", gap: "6px" } });
            var cb = el("input", { type: "checkbox", class: "dms-pick-cb", "data-dk": item.dateKey, onclick: function (e) {
              e.stopPropagation();
              checkedItems[item.dateKey] = cb.checked;
            } });
            d.appendChild(cb);
            var info = el("div", { style: { flex: "1" }, onclick: function () {
              showFullTextPopup(item.dateKey, item.text);
            } }, [
              el("div", { class: "dms-hist-head" }, [
                el("div", { class: "dms-hist-title" }, [item.dateKey]),
                el("div", { class: "dms-hist-date" }, [item.text.length + " \u5b57"])
              ]),
              el("div", { class: "dms-hist-snippet" }, [item.text.slice(0, 80) + "\u2026"])
            ]);
            d.appendChild(info);
            resultArea.appendChild(d);
          });

          // 显示操作按钮
          selectAllRow.style.display = "flex";
          actionArea.style.display = "flex";
          actionArea.innerHTML = "";
          // 保存为按日日记
          actionArea.appendChild(el("button", {
            class: "dms-btn dms-btn-sm dms-btn-primary",
            onclick: function () {
              var toSave = pickedResults.filter(function (item) { return checkedItems[item.dateKey]; });
              if (!toSave.length) { toast("\u8bf7\u5148\u52fe\u9009\u8981\u4fdd\u5b58\u7684\u65e5\u8bb0"); return; }
              var info = convInfo(state.selectedConv);
              var saved = 0, skipped = 0;
              var promises = toSave.map(function (item) {
                var diaryKey = cid + ":" + item.dateKey;
                // 先检查是否已存在
                return getDiaryByMode(roche, "solo", diaryKey).then(function (existing) {
                  if (existing) { skipped++; return; }
                  var diaryData = {
                    conversationId: cid,
                    charName: info.name,
                    userName: "",
                    dateKey: item.dateKey,
                    isGroup: info.isGroup,
                    mode: "solo",
                    charDiary: item.text,
                    userDiary: "",
                    annotations: [],
                    stickers: [],
                    charAnnotations: [],
                    ctx: null,
                    createdAt: Date.now(),
                    updatedAt: Date.now()
                  };
                  return saveDiaryByMode(roche, "solo", diaryKey, diaryData).then(function () { saved++; });
                });
              });
              var btn = this;
              btn.disabled = true;
              btn.textContent = "\u4fdd\u5b58\u4e2d...";
              Promise.all(promises).then(function () {
                statusEl.style.display = "block";
                statusEl.textContent = "\u5df2\u4fdd\u5b58 " + saved + " \u7bc7" + (skipped ? "\uff0c\u8df3\u8fc7 " + skipped + " \u7bc7\u5df2\u5b58\u5728" : "");
                btn.disabled = false;
                btn.textContent = "\u4fdd\u5b58\u4e3a\u6309\u65e5\u65e5\u8bb0";
                toast("\u4fdd\u5b58\u5b8c\u6210");
              }).catch(function (e) {
                statusEl.style.display = "block";
                statusEl.textContent = "\u4fdd\u5b58\u5931\u8d25\uff1a" + (e && e.message || e);
                btn.disabled = false;
                btn.textContent = "\u4fdd\u5b58\u4e3a\u6309\u65e5\u65e5\u8bb0";
              });
            }
          }, ["\u4fdd\u5b58\u52fe\u9009\u7684\u4e3a\u6309\u65e5\u65e5\u8bb0"]));
          // 去周期整理
          actionArea.appendChild(el("button", {
            class: "dms-btn dms-btn-sm dms-btn-ghost",
            onclick: function () {
              state.view = "periodDialog";
              renderContent();
              toast("\u73b0\u5728\u53ef\u5728\u5468\u671f\u6574\u7406\u4e2d\u9009\u62e9\u201c\u5df2\u751f\u6210\u7684\u6309\u65e5\u65e5\u8bb0\u201d\u4f5c\u4e3a\u7d20\u6750");
            }
          }, ["\u53bb\u5468\u671f\u6574\u7406"]));
        }).catch(function (e) {
          loadBtn.disabled = false;
          loadBtn.textContent = "\u91cd\u65b0\u52a0\u8f7d";
          resultArea.appendChild(el("div", { class: "dms-empty" }, ["\u52a0\u8f7d\u5931\u8d25\uff1a" + (e && e.message || e)]));
        });
      });
      card.appendChild(loadBtn);

      card.appendChild(el("button", {
        class: "dms-btn dms-btn-ghost",
        style: { width: "100%", marginTop: "6px" },
        onclick: function () { state.view = "cover"; renderContent(); }
      }, ["\u8fd4\u56de"]));
      wrap.appendChild(card);
      return wrap;
    }

    /* 全文查看弹窗 */
    function showFullTextPopup(title, text) {
      var old = qs(".dms-fulltext-popup", document);
      if (old) old.remove();
      var overlay = el("div", {
        class: "dms-fulltext-popup dms-float",
        style: { position: "fixed", inset: "0", background: "rgba(74,60,40,0.5)", zIndex: "700", display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }
      });
      var dlg = el("div", {
        class: "dms-card",
        style: { maxWidth: "600px", width: "100%", maxHeight: "80vh", overflowY: "auto", background: "var(--paper)" }
      }, [
        el("div", { class: "dms-page-header" }, [
          el("div", { class: "dms-page-title" }, [title]),
          el("button", { class: "dms-tool-btn", onclick: function () { overlay.remove(); } }, ["\u5173\u95ed"])
        ]),
        el("div", { class: "dms-diary-text", style: { marginTop: "10px" } }, [text])
      ]);
      overlay.appendChild(dlg);
      overlay.addEventListener("click", function (e) { if (e.target === overlay) overlay.remove(); });
      document.body.appendChild(overlay);
    }

    /* ---------- 历史记录 ---------- */
    function buildHistory() {
      var wrap = el("div", { class: "dms-wrap dms-fade-in" });
      var card = el("div", { class: "dms-card" }, [
        el("h2", {}, ["\u5386\u53f2\u65e5\u8bb0"]),
        el("div", { class: "dms-card-sub" }, ["\u4ea4\u6362\u65e5\u8bb0\u4e0e char \u65e5\u8bb0\u5206\u5f00\u5b58\u50a8\uff0c\u5378\u8f7d\u4f1a\u4e00\u5e76\u6e05\u9664\u3002"])
      ]);
      wrap.appendChild(card);
      getAllDiariesBothModes(roche).then(function (result) {
        // 合并 swap 和 solo，标注类型
        var allEntries = [];
        Object.keys(result.swap).forEach(function (k) {
          allEntries.push({ key: k, mode: "swap", data: result.swap[k] });
        });
        Object.keys(result.solo).forEach(function (k) {
          allEntries.push({ key: k, mode: "solo", data: result.solo[k] });
        });
        allEntries.sort(function (a, b) {
          return (b.data.updatedAt || b.data.createdAt || 0) - (a.data.updatedAt || a.data.createdAt || 0);
        });

        if (!allEntries.length) {
          card.appendChild(el("div", { class: "dms-empty" }, ["\u6682\u65e0\u65e5\u8bb0\u3002"]));
        } else {
          allEntries.forEach(function (entry) {
            var it = entry.data;
            var mode = entry.mode;
            var item = el("div", { class: "dms-hist", onclick: function () {
              state.diaryKey = entry.key;
              state.diaryMode = mode;    // 切换到对应存储
              state.currentDiary = it;
              state.selectedConvId = it.conversationId || "";
              state.selectedConv = { conversationId: it.conversationId, name: it.charName, handle: it.charName };
              state.selectedDate = parseDateInput(it.dateKey || toDateInput(new Date()));
              state.lastError = "";
              // 根据日记类型与内容设置子视图
              if (mode === "swap") {
                state.subView = (it.userDiary && it.userDiary.trim()) ? "charDiary" : "userWrite";
              } else {
                state.subView = null;
              }
              state.view = "diary";
              renderContent();
            } });
            // 类型标签
            var modeLabel = mode === "swap" ? "\u4ea4\u6362\u65e5\u8bb0" : "char\u65e5\u8bb0";
            var modeColor = mode === "swap" ? "var(--red)" : "var(--blue)";
            item.appendChild(el("div", { class: "dms-hist-head" }, [
              el("div", { class: "dms-hist-title" }, [
                (it.charName || "\u672a\u77e5") + " \u00b7 " + (it.dateKey || ""),
                el("span", { style: { fontSize: "10px", color: modeColor, marginLeft: "6px", border: "1px solid " + modeColor, borderRadius: "3px", padding: "0 4px" } }, [modeLabel])
              ]),
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
              deleteDiaryByMode(roche, mode, entry.key).then(function () { toast("\u5df2\u5220\u9664"); renderContent(); });
            } }, ["\u5220\u9664"]));
            item.appendChild(btns);
            card.appendChild(item);
          });
          card.appendChild(el("div", { style: { marginTop: "10px", display: "flex", gap: "6px", flexWrap: "wrap" } }, [
            el("button", { class: "dms-btn dms-btn-sm", onclick: function () {
              roche.ui.confirm({ title: "\u6e05\u7a7a", message: "\u6e05\u7a7a\u5168\u90e8\u65e5\u8bb0\uff08\u4ea4\u6362\u65e5\u8bb0 + char\u65e5\u8bb0\uff09\uff1f" }).then(function (ok) {
                if (!ok) return;
                return Promise.all([
                  roche.storage.set(STORAGE_DIARIES_SWAP, {}),
                  roche.storage.set(STORAGE_DIARIES_SOLO, {})
                ]).then(function () { toast("\u5df2\u6e05\u7a7a"); renderContent(); });
              });
            } }, ["\u6e05\u7a7a\u65e5\u8bb0"]),
            el("button", { class: "dms-btn dms-btn-sm", onclick: function () {
              roche.ui.confirm({ title: "\u6e05\u7a7a", message: "\u6e05\u7a7a\u5168\u90e8\u5468\u671f\u603b\u7ed3\uff1f" }).then(function (ok) {
                if (!ok) return;
                return roche.storage.set(STORAGE_DIARIES_PERIOD, {}).then(function () { toast("\u5df2\u6e05\u7a7a"); renderContent(); });
              });
            } }, ["\u6e05\u7a7a\u5468\u671f\u603b\u7ed3"])
          ]));
        }
      });
      return wrap;
    }

    /* ---------- 打开/生成日记 ---------- */
    function onOpenDiary(forceRegen) {
      if (state.generating) return;
      if (!state.selectedConv) { toast("\u8bf7\u5148\u9009\u62e9\u7b14\u53cb"); return; }

      var conv = state.selectedConv;
      var cid = conv.conversationId || conv.id;
      state.diaryKey = cid + ":" + toDateKey(state.selectedDate);
      state.lastError = "";
      state.syncDialogShown = false;

      // 根据 swapMode 决定 diaryMode：交换日记 vs char独自日记
      // 这决定使用哪个存储，彻底分开两种数据
      state.diaryMode = state.settings.swapMode ? "swap" : "solo";

      getDiaryByMode(roche, state.diaryMode, state.diaryKey).then(function (existing) {
        // 已有日记，直接打开（不强制重写）
        if (existing && existing.charDiary && !forceRegen) {
          state.currentDiary = existing;
          // 交换日记：根据 userDiary 内容决定子视图
          if (state.diaryMode === "swap") {
            state.subView = (existing.userDiary && existing.userDiary.trim()) ? "charDiary" : "userWrite";
          } else {
            // char独自日记：无子视图，直接双页显示
            state.subView = null;
          }
          state.view = "diary";
          renderContent();
          return;
        }

        // 交换模式：先让 user 写日记，不立即生成 char 日记
        if (state.settings.swapMode && !forceRegen) {
          var info = convInfo(conv);
          state.currentDiary = existing || {
            conversationId: cid,
            charName: info.name,
            userName: "",
            dateKey: toDateKey(state.selectedDate),
            isGroup: info.isGroup,
            mode: "swap",
            charDiary: "",
            userDiary: "",
            annotations: [],
            stickers: [],
            charAnnotations: [],
            ctx: null,
            createdAt: Date.now(),
            updatedAt: Date.now()
          };
          state.subView = "userWrite";
          state.view = "diary";
          renderContent();
          return;
        }

        // 非交换模式：直接生成 char 日记
        state.subView = null;
        generateCharDiaryAndShow(existing, forceRegen);
      }).catch(function (e) {
        console.error("[DMS]", e);
        state.generating = false;
        state.generatingMsg = "";
        state.lastError = (e && e.message || String(e) || "\u672a\u77e5\u9519\u8bef");
        renderContent();
      });
    }

    /* ---------- 交换模式：user 写完日记，触发生成 char 日记 ---------- */
    function onUserDiaryDone() {
      if (state.generating) return;
      if (!state.currentDiary) return;
      var userText = state.currentDiary.userDiary || "";
      if (!userText.trim()) { toast("\u8bf7\u5148\u5199\u4e0b\u4f60\u7684\u65e5\u8bb0"); return; }
      // 保存 user 日记，然后生成 char 日记
      saveCurrentDiary().then(function () {
        generateCharDiaryAndShow(state.currentDiary, false);
      });
    }

    /* ---------- 实际生成 char 日记并显示 ---------- */
    function generateCharDiaryAndShow(existing, forceRegen) {
      state.generating = true;
      state.generatingMsg = forceRegen ? "TA \u6b63\u5728\u91cd\u5199\u2026" : "TA \u6b63\u5728\u56de\u5fc6\u4eca\u5929\u2026";
      state.view = "diary";
      renderContent();

      buildCtx(roche, state, state.selectedDate).then(function (ctx) {
        if (!ctx.dayShort.length) {
          state.generating = false;
          state.generatingMsg = "";
          state.lastError = "\u5f53\u65e5\u65e0\u804a\u5929\u8bb0\u5f55\uff0c\u8bf7\u8c03\u6574\u65e5\u671f";
          renderContent();
          return;
        }
        // 交换模式：把 user 日记一并喂给 AI 作为参考
        var userDiaryText = (state.settings.swapMode && state.currentDiary && state.currentDiary.userDiary) || "";
        var genP = userDiaryText.trim()
          ? generateCharDiaryWithUserRef(roche, ctx, state.settings, userDiaryText)
          : generateCharDiary(roche, ctx, state.settings);

        return genP.then(function (result) {
          // 兼容：交换模式返回 { diary, charAnnotations }，非交换模式返回 text
          var diaryText = (typeof result === "string") ? result : (result.diary || "");
          var newCharAnnots = (typeof result === "object" && result.charAnnotations) ? result.charAnnotations : [];
          // 合并：交换模式下用新生成的 charAnnotations 覆盖旧的（批注+便签一起重新生成）
          var charAnnots = userDiaryText.trim() ? newCharAnnots : ((existing && existing.charAnnotations) || []);
          var diaryData = {
            conversationId: ctx.conversationId,
            charName: ctx.charName,
            userName: ctx.userName,
            dateKey: ctx.dateKey,
            isGroup: ctx.isGroup,
            mode: state.diaryMode,    // 记录日记类型，避免串台
            charDiary: diaryText || "",
            // 修复缓存串台 bug：userDiary 只从 existing 取，不从 state.currentDiary 残留取
            userDiary: (existing && existing.userDiary) || (state.diaryMode === "swap" && state.currentDiary && state.currentDiary.userDiary) || "",
            annotations: (existing && existing.annotations) || [],
            stickers: (existing && existing.stickers) || [],
            charAnnotations: charAnnots,
            ctx: ctx,
            createdAt: (existing && existing.createdAt) || (state.currentDiary && state.currentDiary.createdAt) || Date.now(),
            updatedAt: Date.now()
          };
          return saveDiaryByMode(roche, state.diaryMode, state.diaryKey, diaryData).then(function () {
            state.currentDiary = diaryData;
            // 设置子视图
            if (state.settings.swapMode) state.subView = "charDiary";
            else state.subView = null;
            // 弹同步选项对话框
            return showSyncOptionsDialog(ctx, diaryText || "").then(function () {
              state.generating = false;
              state.generatingMsg = "";
              state.lastError = "";
              renderContent();
              toast("\u65e5\u8bb0\u5df2\u5199\u597d");
            });
          });
        });
      }).catch(function (e) {
        console.error("[DMS]", e);
        state.generating = false;
        state.generatingMsg = "";
        state.lastError = (e && e.message || String(e) || "\u672a\u77e5\u9519\u8bef");
        renderContent();
      });
    }

    /* ---------- 交换模式：一次性生成 char 日记 + 给 user 的批注 + 便签 ---------- */
    function generateCharDiaryWithUserRef(roche, ctx, settings, userDiaryText) {
      var msgs = buildCharDiaryMessages(ctx, settings);
      // 在最后追加 user 的日记作为参考
      msgs.push({ role: "assistant", content: "\u3010" + (ctx.userName || "\u7528\u6237") + "\u521a\u5199\u7684\u65e5\u8bb0\u3011\n" + userDiaryText + "\n\n\u8bf7\u5728\u4f60\u7684\u65e5\u8bb0\u4e2d\u56de\u5e94\u5bf9\u8bdd TA \u7684\u65e5\u8bb0\u3002" });
      msgs.push({ role: "user", content:
        "\u73b0\u5728\u8bf7\u4f60\u540c\u65f6\u5b8c\u6210\u4e09\u4ef6\u4e8b\uff1a\n\n" +
        "1. \u5199\u4f60\u7684\u65e5\u8bb0\uff08\u4ee5\u4f60\u81ea\u5df1\u7684\u53e3\u543b\u56de\u5e94 TA \u7684\u65e5\u8bb0\uff09\n" +
        "2. \u4f5c\u4e3a " + (ctx.charName || "\u89d2\u8272") + "\uff0c\u5728 " + (ctx.userName || "\u7528\u6237") + " \u7684\u65e5\u8bb0\u4e0a\u505a\u6587\u5b57\u6279\u6ce8\uff08\u5212\u6389/\u8868\u767d/\u6279\u6ce8\uff09\n" +
        "3. \u7ed9 " + (ctx.userName || "\u7528\u6237") + " \u7684\u65e5\u8bb0\u8d34 4~6 \u5f20\u4fbf\u7b7e\n\n" +
        "\u4e25\u683c\u6309\u4ee5\u4e0b\u683c\u5f0f\u8f93\u51fa\uff08\u4e0d\u8981\u8f93\u51fa\u5176\u4ed6\u5185\u5bb9\uff09\uff1a\n" +
        "\u3010\u65e5\u8bb0\u5f00\u59cb\u3011\n\u4f60\u7684\u65e5\u8bb0\u6b63\u6587\u2026\n\u3010\u65e5\u8bb0\u7ed3\u675f\u3011\n\n" +
        "\u3010\u6279\u6ce8\u5f00\u59cb\u3011\n" +
        "[{\"type\":\"comment\",\"selectedText\":\"user\u65e5\u8bb0\u91cc\u7684\u539f\u6587\",\"comment\":\"\u4f60\u7684\u60f3\u6cd5\"},\n" +
        "{\"type\":\"heart\",\"selectedText\":\"user\u65e5\u8bb0\u91cc\u7684\u539f\u6587\"},\n" +
        "{\"type\":\"crossout\",\"selectedText\":\"user\u65e5\u8bb0\u91cc\u7684\u539f\u6587\",\"comment\":\"\u4e3a\u4ec0\u4e48\u5212\u6389\"}]\n" +
        "\u3010\u6279\u6ce8\u7ed3\u675f\u3011\n\n" +
        "\u3010\u4fbf\u7b7e\u5f00\u59cb\u3011\n\u4fbf\u7b7e\u4e00\n\u4fbf\u7b7e\u4e8c\n...\n\u3010\u4fbf\u7b7e\u7ed3\u675f\u3011\n\n" +
        "\u6279\u6ce8\u8bf4\u660e\uff1a\n" +
        "- type \u53ea\u80fd\u662f comment / heart / crossout \u4e09\u79cd\n" +
        "- heart \u662f\u8868\u767d\uff08\u4e0d\u9700 comment\uff09\uff0ccrossout \u662f\u5212\u6389\uff08\u53ef\u5e26 comment \u8bf4\u660e\u539f\u56e0\uff09\uff0ccomment \u662f\u6279\u6ce8\uff08\u5e26 comment\uff09\n" +
        "- selectedText \u5fc5\u987b\u662f user \u65e5\u8bb0\u91cc\u7684\u539f\u6587\uff08\u539f\u6837\u590d\u5236\uff0c\u4e0d\u8981\u4fee\u6539\uff09\n" +
        "- \u6279\u6ce8 3~6 \u6761\uff0c\u4e0d\u8981\u592a\u591a\n\n" +
        "\u4fbf\u7b7e\u8bf4\u660e\uff1a\n" +
        "- \u9009\u4f60\u6709\u611f\u89c9\u7684\u70b9\uff0c\u7559\u4e0b\u60f3\u6cd5/\u611f\u53d7/\u8c03\u76ae\n" +
        "- \u7b26\u5408 " + (ctx.charName || "\u89d2\u8272") + " \u7684\u4eba\u8bbe\u53e3\u543b\n" +
        "- 4~6 \u5f20\uff0c\u6bcf\u5f20\u5355\u72ec\u4e00\u884c"
      });
      return callAI(roche, msgs, 0.7).then(function (text) {
        var parsed = parseCharDiaryAndStickyNotes(text);
        // 构造 charAnnotations：批注 + 便签
        var charAnnots = [];
        var charDefaultStyle = state.settings.defaultCharStickyStyle;
        // 预解析 user 日记的段落，便于把 char 批注/便签关联到正确段落
        var userBlocks = parseBlocks(userDiaryText);
        // 批注：根据 selectedText 在 user 日记中的字符位置计算 blockId
        parsed.annotations.forEach(function (a, idx) {
          var blockId = null;
          if (a.selectedText) {
            var pos = userDiaryText.indexOf(a.selectedText);
            if (pos >= 0) blockId = blockOfPos(userBlocks, pos);
          }
          charAnnots.push({
            id: "charAnnot" + Date.now() + "_" + idx,
            type: a.type,
            selectedText: a.selectedText,
            comment: a.comment || "",
            blockId: blockId,
            byChar: true,
            createdAt: Date.now()
          });
        });
        // 便签：均匀分布到不同段落（让 short-term 注入时能挂到段落上）
        parsed.stickyNotes.forEach(function (note, idx) {
          var sid = (charDefaultStyle != null) ? charDefaultStyle : (idx % 10);
          var stickyBlockId = null;
          if (userBlocks.length) {
            // 让便签依次落在各段，循环分配
            stickyBlockId = userBlocks[idx % userBlocks.length].id;
          }
          charAnnots.push({
            id: "charNote" + Date.now() + "_" + idx,
            type: "sticky",
            comment: note,
            x: 20 + (idx * 60) + Math.random() * 40,
            y: 60 + (idx * 80) + Math.random() * 40,
            styleId: sid,
            blockId: stickyBlockId,
            byChar: true,
            createdAt: Date.now()
          });
        });
        return { diary: parsed.diary, charAnnotations: charAnnots };
      });
    }

    /* ---------- 解析 char 输出：分离日记、批注、便签 ---------- */
    function parseCharDiaryAndStickyNotes(text) {
      if (!text) return { diary: "", annotations: [], stickyNotes: [] };
      var diary = "";
      var annotations = [];
      var stickyNotes = [];

      // 提取日记
      var diaryRe = /\u3010\u65e5\u8bb0\u5f00\u59cb\u3011([\s\S]*?)\u3010\u65e5\u8bb0\u7ed3\u675f\u3011/g;
      var dm = diaryRe.exec(text);
      if (dm) diary = dm[1].trim();
      else diary = text.trim();

      // 提取批注 JSON
      var annotRe = /\u3010\u6279\u6ce8\u5f00\u59cb\u3011([\s\S]*?)\u3010\u6279\u6ce8\u7ed3\u675f\u3011/g;
      var am = annotRe.exec(text);
      if (am) {
        var jsonStr = am[1].trim();
        // 尝试提取 JSON 数组
        var jsonMatch = jsonStr.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          try { annotations = JSON.parse(jsonMatch[0]); }
          catch (e) { annotations = []; }
        }
      }
      // 过滤无效批注
      annotations = annotations.filter(function (a) {
        return a && a.type && a.selectedText &&
          ["comment", "heart", "crossout"].indexOf(a.type) >= 0;
      });

      // 提取便签
      var stickyRe = /\u3010\u4fbf\u7b7e\u5f00\u59cb\u3011([\s\S]*?)\u3010\u4fbf\u7b7e\u7ed3\u675f\u3011/g;
      var sm;
      while ((sm = stickyRe.exec(text)) !== null) {
        var content = sm[1].trim();
        content.split("\n").forEach(function (line) {
          line = line.trim();
          if (line) stickyNotes.push(line);
        });
      }

      // 如果没有任何标记，尝试旧格式（【便签】行）
      if (!diary && !annotations.length && !stickyNotes.length) {
        var lines = text.split("\n");
        var diaryLines = [];
        lines.forEach(function (line) {
          var sm2 = line.match(/^\u3010\u4fbf\u7b7e\u3011\s*(.*)$/);
          if (sm2) {
            if (sm2[1].trim()) stickyNotes.push(sm2[1].trim());
          } else {
            diaryLines.push(line);
          }
        });
        if (stickyNotes.length > 0) diary = diaryLines.join("\n").trim();
        else diary = text.trim();
      }

      if (stickyNotes.length > 6) stickyNotes = stickyNotes.slice(0, 6);
      if (annotations.length > 6) annotations = annotations.slice(0, 6);
      return { diary: diary, annotations: annotations, stickyNotes: stickyNotes };
    }

    /* ---------- 同步选项对话框（生成后弹出） ---------- */
    function showSyncOptionsDialog(ctx, diaryText) {
      // 已显示过则跳过
      if (state.syncDialogShown) return Promise.resolve();
      state.syncDialogShown = true;

      // 用户已选"记住选择"，按记忆配置直接同步
      if (state.settings.rememberSyncChoice) {
        var doFact = !!state.settings.syncToFactMemory;
        var doShort = !!state.settings.syncToShortTerm;
        if (state.currentDiary) {
          state.currentDiary.shortTermSync = doShort;
          state.currentDiary.factSync = doFact;
          state.currentDiary.updatedAt = Date.now();
        }
        var p1 = doFact ? syncFact(roche, ctx, diaryText).catch(function () {}) : Promise.resolve();
        // 短期记忆：交换模式下延后到用户贴完便签/表情后手动触发；非交换模式直接注入
        var p2 = (doShort && !state.settings.swapMode) ? syncShortTerm(roche, ctx, state.currentDiary).catch(function () {}) : Promise.resolve();
        return Promise.all([p1, p2]).then(function () { return saveCurrentDiary(); });
      }

      return new Promise(function (resolve) {
        var overlay = el("div", {
          class: "dms-sync-overlay dms-float",
          style: {
            position: "fixed", inset: "0", background: "rgba(74,60,40,0.45)",
            zIndex: "500", display: "flex", alignItems: "center", justifyContent: "center",
            animation: "dms-fadeIn .2s ease-out both"
          }
        });
        var dlg = el("div", {
          class: "dms-sync-dialog",
          style: {
            background: "var(--paper)", borderRadius: "var(--radius)",
            padding: "20px", maxWidth: "360px", width: "90%",
            boxShadow: "var(--shadow-strong)",
            border: "1px solid var(--line)"
          }
        });
        dlg.appendChild(el("div", {
          class: "dms-handwritten",
          style: { fontSize: "18px", color: "var(--red)", marginBottom: "6px", textAlign: "center" }
        }, ["\u540c\u6b65\u5230\u54ea\u91cc\uff1f"]));
        dlg.appendChild(el("div", {
          style: { fontSize: "12px", color: "var(--ink-mute)", marginBottom: "14px", textAlign: "center" }
        }, ["\u65e5\u8bb0\u5df2\u5199\u597d\uff0c\u9009\u62e9\u8981\u540c\u6b65\u5230\u54ea\u4e9b\u8bb0\u5fc6\u3002"]));

        // 事实记忆选项
        var factRow = el("label", {
          style: { display: "flex", alignItems: "flex-start", gap: "10px", padding: "10px", background: "var(--paper-2)", borderRadius: "var(--radius-sm)", marginBottom: "8px", cursor: "pointer" }
        }, [
          el("input", { type: "checkbox", checked: !!state.settings.syncToFactMemory, style: { marginTop: "3px", accentColor: "var(--red)" } }),
          el("div", { style: { flex: "1" } }, [
            el("div", { style: { fontSize: "13px", fontWeight: "600", color: "var(--ink)" } }, ["\u540c\u6b65\u5230\u4e8b\u5b9e\u8bb0\u5fc6"]),
            el("div", { style: { fontSize: "11px", color: "var(--ink-mute)", marginTop: "2px" } }, ["\u5199\u5165 Roche \u4e3b\u8bb0\u5fc6\uff0c\u6c38\u4e45\u4fdd\u7559\uff0cAI \u80fd\u770b\u5230"])
          ])
        ]);
        var factCb = factRow.querySelector("input");

        // 短期记忆选项（交换模式下提示稍后手动触发）
        var shortDesc = state.settings.swapMode
          ? "\u5728\u4f60\u8d34\u5b8c\u4fbf\u7b7e/\u8868\u60c5\u540e\u70b9\u201c\u5b8c\u6210\u4ea4\u6362\u201d\u6309\u94ae\u65f6\uff0c\u628a\u6574\u7bc7\u4ea4\u6362\u65e5\u8bb0\u4f5c\u4e3a\u6d88\u606f\u6ce8\u5165\u804a\u5929\uff0c\u8ba9 TA \u770b\u5230\u5e76\u56de\u5e94"
          : "\u628a\u4eca\u5929\u7684\u65e5\u8bb0\u4f5c\u4e3a\u6d88\u606f\u6ce8\u5165\u4e3b\u804a\u5929\uff0c\u4e0b\u6b21\u5bf9\u8bdd AI \u4f1a\u201c\u8bb0\u5f97\u201d\u4eca\u5929";
        var shortRow = el("label", {
          style: { display: "flex", alignItems: "flex-start", gap: "10px", padding: "10px", background: "var(--paper-2)", borderRadius: "var(--radius-sm)", marginBottom: "8px", cursor: "pointer" }
        }, [
          el("input", { type: "checkbox", checked: !!state.settings.syncToShortTerm, style: { marginTop: "3px", accentColor: "var(--red)" } }),
          el("div", { style: { flex: "1" } }, [
            el("div", { style: { fontSize: "13px", fontWeight: "600", color: "var(--ink)" } }, ["\u540c\u6b65\u5230\u77ed\u671f\u8bb0\u5fc6"]),
            el("div", { style: { fontSize: "11px", color: "var(--ink-mute)", marginTop: "2px" } }, [shortDesc])
          ])
        ]);
        var shortCb = shortRow.querySelector("input");

        // 记住选择
        var rememberRow = el("label", {
          style: { display: "flex", alignItems: "center", gap: "6px", fontSize: "11px", color: "var(--ink-mute)", marginTop: "6px", cursor: "pointer" }
        }, [
          el("input", { type: "checkbox", style: { accentColor: "var(--red)" } }),
          "\u8bb0\u4f4f\u6b64\u9009\u62e9\uff0c\u4e0b\u6b21\u4e0d\u518d\u8be2\u95ee"
        ]);
        var rememberCb = rememberRow.querySelector("input");

        dlg.appendChild(factRow);
        dlg.appendChild(shortRow);
        dlg.appendChild(rememberRow);

        // 按钮区
        var btnRow = el("div", { style: { display: "flex", gap: "8px", marginTop: "14px" } }, [
          el("button", {
            class: "dms-btn dms-btn-sm dms-btn-ghost",
            style: { flex: "1" },
            onclick: function () { overlay.remove(); resolve(); }
          }, ["\u7a0d\u540e\u518d\u8bf4"]),
          el("button", {
            class: "dms-btn dms-btn-sm dms-btn-primary",
            style: { flex: "1" },
            onclick: function () {
              var doFact = factCb.checked;
              var doShort = shortCb.checked;
              var remember = rememberCb.checked;
              if (remember) {
                state.settings.syncToFactMemory = doFact;
                state.settings.syncToShortTerm = doShort;
                state.settings.rememberSyncChoice = true;
                saveSettings(roche, state.settings);
              } else {
                state.settings.rememberSyncChoice = false;
                saveSettings(roche, state.settings);
              }
              // 标记当前日记的同步状态
              if (state.currentDiary) {
                state.currentDiary.shortTermSync = doShort;
                state.currentDiary.factSync = doFact;
                state.currentDiary.updatedAt = Date.now();
              }
              var promises = [];
              if (doFact) {
                promises.push(syncFact(roche, ctx, diaryText).catch(function (e) { console.error("[DMS] fact sync fail", e); }));
              }
              // 交换模式：短期记忆延后到"完成交换"按钮时注入
              // 非交换模式：立即注入
              if (doShort && !state.settings.swapMode) {
                promises.push(syncShortTerm(roche, ctx, state.currentDiary).catch(function (e) { console.error("[DMS] short sync fail", e); }));
              }
              Promise.all(promises).then(function () {
                return saveCurrentDiary();
              }).then(function () {
                overlay.remove();
                resolve();
                var msg = doFact && doShort ? "\u5df2\u540c\u6b65\u5230\u4e8b\u5b9e\u8bb0\u5fc6\u4e0e\u77ed\u671f\u8bb0\u5fc6"
                  : doFact ? "\u5df2\u540c\u6b65\u5230\u4e8b\u5b9e\u8bb0\u5fc6"
                  : doShort ? (state.settings.swapMode ? "\u5df2\u9009\u540c\u6b65\u5230\u77ed\u671f\u8bb0\u5fc6\uff0c\u5b8c\u6210\u4ea4\u6362\u540e\u6ce8\u5165" : "\u5df2\u540c\u6b65\u5230\u77ed\u671f\u8bb0\u5fc6")
                  : "\u5df2\u8df3\u8fc7\u540c\u6b65";
                toast(msg);
              });
            }
          }, ["\u786e\u8ba4\u540c\u6b65"])
        ]);
        dlg.appendChild(btnRow);

        overlay.appendChild(dlg);
        overlay.addEventListener("click", function (e) { if (e.target === overlay) { overlay.remove(); resolve(); } });
        document.body.appendChild(overlay);
      });
    }

    /* ---------- 通过 RocheToolkit 或 IndexedDB 把交换日记作为系统消息注入主聊天 ---------- */
    function syncShortTerm(roche, ctx, diary) {
      if (!diary) return Promise.resolve();
      var cid = ctx && ctx.conversationId;
      var text = buildShortTermInjectText(diary);
      if (!text) { console.warn("[DMS] syncShortTerm: empty text"); return Promise.resolve(); }
      console.log("[DMS] syncShortTerm start, cid=", cid, "text length=", text.length);

      // 优先用 RocheToolkit.simulateSystemNotice
      var tk = window.RocheToolkit || (window.parent && window.parent.RocheToolkit) || (window.top && window.top.RocheToolkit);
      if (tk && typeof tk.simulateSystemNotice === "function") {
        console.log("[DMS] using RocheToolkit.simulateSystemNotice");
        try {
          return Promise.resolve(tk.simulateSystemNotice(cid, text, "diary")).then(function (id) {
            console.log("[DMS] simulateSystemNotice OK, id=", id);
          }).catch(function (e) { console.error("[DMS] simulateSystemNotice fail", e); });
        } catch (e) { console.error("[DMS] simulateSystemNotice throw", e); }
      }

      // 回退：直接操作 IndexedDB（与 RocheToolkit 相同的逻辑）
      console.log("[DMS] RocheToolkit not found, direct IndexedDB inject");
      return injectMessageToIndexedDB(cid, text).then(function (id) {
        console.log("[DMS] IndexedDB inject OK, id=", id);
      }).catch(function (e) {
        console.error("[DMS] IndexedDB inject fail", e);
        toast("\u77ed\u671f\u8bb0\u5fc6\u6ce8\u5165\u5931\u8d25\uff1a" + (e && e.message || e));
      });
    }

    /* ---------- 直接操作 IndexedDB 注入系统消息 ---------- */
    function injectMessageToIndexedDB(conversationId, text) {
      return new Promise(function (resolve, reject) {
        var req = indexedDB.open("Roche_db");
        req.onsuccess = function () {
          var db = req.result;
          try {
            var tx = db.transaction("messages", "readwrite");
            var store = tx.objectStore("messages");
            var now = Date.now();
            var msg = {
              id: now + Math.floor(Math.random() * 1000),
              isMe: false,
              text: text,
              type: "system_notice",
              timestamp: now,
              conversationId: conversationId,
              senderId: "__system__",
              senderName: "System"
            };
            var addReq = store.add(msg);
            addReq.onsuccess = function () { resolve(addReq.result); };
            addReq.onerror = function () { reject(addReq.error); };
            tx.oncomplete = function () { db.close(); };
            tx.onerror = function () { db.close(); };
            tx.onabort = function () { db.close(); };
          } catch (e) {
            db.close();
            reject(e);
          }
        };
        req.onerror = function () { reject(req.error); };
      });
    }

    /* ---------- 批注行格式（注入短期记忆用）----------
     * 文字批注（批注/表白/划掉）：【who 批注：想法内容】（有想法输出想法，没想法输出原句）
     * 便签/表情：【who 的便签：内容】/【who 的表情：说明】
     */
    function buildAnnotLabel(a) {
      return a.type === "heart" ? "\u8868\u767d" : a.type === "crossout" ? "\u5212\u6389" : "\u6279\u6ce8";
    }
    function buildAnnotBody(a) {
      // 有想法输出想法，没想法输出原句；不再带「原文」引用
      return a.comment ? a.comment : (a.selectedText || "");
    }
    // 批注是否有实质内容：空便签/空批注不注入，避免出现【user 的便签：】这类空行
    function hasAnnotContent(a) {
      if (a.type === "sticky") return !!(a.comment && a.comment.trim());
      return !!(a.selectedText && a.selectedText.trim()) || !!(a.comment && a.comment.trim());
    }

    /* ---------- 拼装短期记忆注入文本（按段落联动便签/贴纸） ---------- */
    function buildShortTermInjectText(diary) {
      if (!diary) return "";
      var charName = diary.charName || "TA";
      var userName = diary.userName || "\u7528\u6237";
      var dateKey = diary.dateKey || "";
      var parts = [];

      parts.push("\u3010\u4ea4\u6362\u65e5\u8bb0 \u00b7 " + dateKey + "\u3011");
      parts.push("\u4ee5\u4e0b\u662f " + userName + " \u548c " + charName + " \u4eca\u5929\u5199\u7ed9\u5bf9\u65b9\u770b\u7684\u4ea4\u6362\u65e5\u8bb0\u3002\u5305\u542b\u5f7c\u6b64\u7559\u4e0b\u7684\u4fbf\u7b7e\u4e0e\u8868\u60c5\u8d34\u7eb8\uff0c\u8bf7\u5728\u4e3b\u804a\u5929\u4e2d\u81ea\u7136\u5730\u56de\u5e94\u8fd9\u4e9b\u5185\u5bb9\u3002");

      // ===== char 的日记 + user 给 char 留的批注/便签/贴纸（按段落关联）=====
      if (diary.charDiary && diary.charDiary.trim()) {
        parts.push("\n\u2014\u2014\u2014\u2014\u2014");
        parts.push("\u3010" + charName + " \u7ed9 " + userName + " \u7684\u65e5\u8bb0\u3011");
        var charBlocks = parseBlocks(diary.charDiary);
        var userAnnotsOnChar = (diary.annotations || []).filter(function (a) {
          return (a.type === "sticky" || a.selectedText) && hasAnnotContent(a);
        });
        var charStickers = diary.stickers || [];
        charBlocks.forEach(function (blk) {
          parts.push("");
          parts.push(blk.content);
          // 文字批注
          var blkTextAnnots = userAnnotsOnChar.filter(function (a) {
            return a.selectedText && (a.blockId || null) === blk.id;
          });
          blkTextAnnots.forEach(function (a) {
            parts.push("  \u3010" + userName + " " + buildAnnotLabel(a) + "\uff1a" + buildAnnotBody(a) + "\u3011");
          });
          // 便签
          var blkAnnots = userAnnotsOnChar.filter(function (a) {
            return a.type === "sticky" && (a.blockId || null) === blk.id;
          });
          blkAnnots.forEach(function (a) {
            parts.push("  \u3010" + userName + " \u7684\u4fbf\u7b7e\uff1a" + (a.comment || "") + "\u3011");
          });
          // 表情包
          var blkStk = charStickers.filter(function (s) { return (s.blockId || null) === blk.id; });
          blkStk.forEach(function (s) {
            parts.push("  \u3010" + userName + " \u7684\u8868\u60c5\uff1a" + (s.caption || "\u65e0\u6587\u5b57\u8bf4\u660e") + "\u3011");
          });
        });
        // 未绑定段落的
        var unboundAnnots = userAnnotsOnChar.filter(function (a) { return !a.blockId; });
        var unboundStickers = charStickers.filter(function (s) { return !s.blockId; });
        if (unboundAnnots.length || unboundStickers.length) {
          parts.push("");
          unboundAnnots.forEach(function (a) {
            if (a.selectedText) {
              parts.push("\u3010" + userName + " " + buildAnnotLabel(a) + "\uff1a" + buildAnnotBody(a) + "\u3011");
            } else {
              parts.push("\u3010" + userName + " \u7684\u4fbf\u7b7e\uff1a" + (a.comment || "") + "\u3011");
            }
          });
          unboundStickers.forEach(function (s) {
            parts.push("\u3010" + userName + " \u7684\u8868\u60c5\uff1a" + (s.caption || "\u65e0\u6587\u5b57\u8bf4\u660e") + "\u3011");
          });
        }
      }

      // ===== user 的日记 + char 给 user 留的批注/便签/贴纸（按段落关联）=====
      if (diary.userDiary && diary.userDiary.trim()) {
        parts.push("\n\u2014\u2014\u2014\u2014\u2014");
        parts.push("\u3010" + userName + " \u7ed9 " + charName + " \u7684\u65e5\u8bb0\u3011");
        var userBlocks = parseBlocks(diary.userDiary);
        var charAnnotsOnUser = (diary.charAnnotations || []).filter(function (a) {
          return (a.type === "sticky" || a.selectedText) && hasAnnotContent(a);
        });
        var charStickersOnUser = diary.charStickers || [];
        userBlocks.forEach(function (blk) {
          parts.push("");
          parts.push(blk.content);
          // 文字批注
          var blkTextAnnots = charAnnotsOnUser.filter(function (a) {
            return a.selectedText && (a.blockId || null) === blk.id;
          });
          blkTextAnnots.forEach(function (a) {
            parts.push("  \u3010" + charName + " " + buildAnnotLabel(a) + "\uff1a" + buildAnnotBody(a) + "\u3011");
          });
          // 便签
          var blkStickies = charAnnotsOnUser.filter(function (a) {
            return a.type === "sticky" && (a.blockId || null) === blk.id;
          });
          blkStickies.forEach(function (a) {
            parts.push("  \u3010" + charName + " \u7684\u4fbf\u7b7e\uff1a" + (a.comment || "") + "\u3011");
          });
          // 表情包
          var blkStk = charStickersOnUser.filter(function (s) { return (s.blockId || null) === blk.id; });
          blkStk.forEach(function (s) {
            parts.push("  \u3010" + charName + " \u7684\u8868\u60c5\uff1a" + (s.caption || "\u65e0\u6587\u5b57\u8bf4\u660e") + "\u3011");
          });
        });
        var unboundCharAnnots = charAnnotsOnUser.filter(function (a) { return !a.blockId; });
        var unboundCharStickers = charStickersOnUser.filter(function (s) { return !s.blockId; });
        if (unboundCharAnnots.length || unboundCharStickers.length) {
          parts.push("");
          unboundCharAnnots.forEach(function (a) {
            if (a.selectedText) {
              parts.push("\u3010" + charName + " " + buildAnnotLabel(a) + "\uff1a" + buildAnnotBody(a) + "\u3011");
            } else {
              parts.push("\u3010" + charName + " \u7684\u4fbf\u7b7e\uff1a" + (a.comment || "") + "\u3011");
            }
          });
          unboundCharStickers.forEach(function (s) {
            parts.push("\u3010" + charName + " \u7684\u8868\u60c5\uff1a" + (s.caption || "\u65e0\u6587\u5b57\u8bf4\u660e") + "\u3011");
          });
        }
      }

      return parts.join("\n");
    }

    /* ---------- 让TA重新回写日记（一次性生成日记+批注+便签）---------- */
    function onCharAnnotate() {
      if (state.generating) return;
      if (!state.currentDiary) return;
      var userText = state.currentDiary.userDiary || "";
      if (!userText.trim()) { toast("\u8bf7\u5148\u5199\u4e0b\u4f60\u7684\u65e5\u8bb0"); return; }
      roche.ui.confirm({
        title: "\u8ba9TA\u91cd\u65b0\u56de\u5199",
        message: "\u5c06\u91cd\u65b0\u751f\u6210 TA \u7684\u65e5\u8bb0\u3001\u5bf9\u4f60\u7684\u6279\u6ce8\u548c\u4fbf\u7b7e\u3002\u539f\u6709\u5185\u5bb9\u4f1a\u88ab\u8986\u76d6\uff0c\u662f\u5426\u7ee7\u7eed\uff1f"
      }).then(function (ok) {
        if (!ok) return;
        state.generating = true;
        state.generatingMsg = "TA \u6b63\u5728\u91cd\u65b0\u56de\u5199\u2026";
        renderContent();
        var ctx = state.currentDiary.ctx;
        generateCharDiaryWithUserRef(roche, ctx, state.settings, userText).then(function (result) {
          state.currentDiary.charDiary = result.diary || "";
          state.currentDiary.charAnnotations = result.charAnnotations || [];
          state.currentDiary.updatedAt = Date.now();
          return saveCurrentDiary().then(function () {
            var annotCount = (result.charAnnotations || []).filter(function (a) { return a.selectedText; }).length;
            var stickyCount = (result.charAnnotations || []).filter(function (a) { return a.type === "sticky"; }).length;
            toast("TA\u91cd\u5199\u4e86\u65e5\u8bb0\uff0c\u6279\u6ce8 " + annotCount + " \u5904\uff0c\u8d34 " + stickyCount + " \u5f20\u4fbf\u7b7e");
          });
        }).catch(function (e) {
          toast("\u5931\u8d25");
          console.error(e);
        }).then(function () {
          state.generating = false;
          state.generatingMsg = "";
          renderContent();
        });
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
          // 确保 mode 字段一致
          var mode = state.currentDiary.mode || state.diaryMode || "solo";
          state.currentDiary.mode = mode;
          saveDiaryByMode(roche, mode, state.diaryKey, state.currentDiary).then(resolve).catch(resolve);
        }, 500);
      });
    }

    /* ---------- 加载 ---------- */
    function loadAll() {
      // 先迁移旧数据（如果还没迁移过）
      return migrateOldDiariesIfNeeded(roche).then(function () {
        return loadConversations(roche).then(function (convs) {
          state.conversations = convs;
          if (state.settings.useWorldbook) {
            return loadWbTree(roche).then(function (t) { state.worldbookTree = t; });
          }
        });
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
    version: "2.6.6",
    apps: [
      {
        id: "daily-memory-summary-home",
        name: "\u624b\u8d26\u65e5\u8bb0",
        icon: "auto_stories",
        iconImage: "",
        mount: function (container, roche) {
          ensureStyle();
          // 给 documentElement 加 dms-vars class，确保挂在 body 上的弹窗也能拿到 CSS 变量
          document.documentElement.classList.add("dms-vars");
          // 加载 user 自定义便签样式
          getCustomNoteStyles(roche).then(function (list) { applyCustomNoteStyles(list); }).catch(function () {});
          var root = document.createElement("div");
          root.className = ROOT_CLASS;
          // 先挂载 root，避免后续异步/同步异常导致白屏
          container.appendChild(root);
          container._dms_root = root;
          getSettings(roche).then(function (settings) {
            try {
              renderApp(roche, root, settings);
            } catch (e) {
              console.error("[DMS] renderApp 同步渲染失败:", e);
              root.innerHTML = "";
              root.appendChild(el("div", { class: "dms-wrap" }, [el("div", { class: "dms-card" }, [el("div", { class: "dms-empty" }, ["渲染失败: " + (e && e.message || e) + (e && e.stack ? "\n" + e.stack : "")])])]));
            }
          }).catch(function (e) {
            console.error("[DMS] getSettings 失败:", e);
            root.appendChild(el("div", { class: "dms-wrap" }, [el("div", { class: "dms-card" }, [el("div", { class: "dms-empty" }, ["初始化失败: " + (e && e.message || e)])])]));
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

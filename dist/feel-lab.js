/* Three short, single-variable experiments. Each instance is idle until Start. */
(() => {
  "use strict";
  const ink = "#293b36", green = "#d6fa58", paper = "#eef1e8", coral = "#ad4937";
  const width = 420, height = 122;
  let active = null;

  function node(tag, text, className) {
    const el = document.createElement(tag);
    if (text) el.textContent = text;
    if (className) el.className = className;
    return el;
  }

  function rect(ctx, x, y, w, h, color) {
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w, h);
  }

  function disc(ctx, x, y, radius, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  function jumpTrial({ ctx, variant, say, finish }) {
    const edge = 148, far = 220, ground = 82, speed = 100, from = 48;
    const leftAt = (edge - from) / speed, gravity = 450, lift = 184;
    let jumpedAt = null, jumpY = 0, landingAt = 0, input = "";
    function foot(t) {
      if (jumpedAt === null) return ground + gravity * Math.max(0, t - leftAt) ** 2 / 2;
      const dt = t - jumpedAt;
      return jumpY - lift * dt + gravity * dt * dt / 2;
    }
    return {
      press(t) {
        if (jumpedAt !== null || input) return;
        const late = Math.round(1000 * (t - leftAt));
        input = late > 0 ? "离台后 " + late + " 毫秒按下。" : "离台前 " + (-late) + " 毫秒按下。";
        if (t > leftAt + (variant === "B" ? 0.100 : 0)) {
          say(input + " 没有起跳。");
          return;
        }
        jumpY = foot(t);
        jumpedAt = t;
        landingAt = t + (lift + Math.sqrt(lift * lift - 2 * gravity * (jumpY - ground))) / gravity;
        say(input + " 起跳了。");
      },
      draw(t, running) {
        const reaches = jumpedAt !== null && from + speed * landingAt >= far;
        let x = from + speed * t, y = foot(t);
        if (reaches && t >= landingAt) { x = from + speed * landingAt; y = ground; }
        rect(ctx, 0, ground, edge, 40, ink);
        rect(ctx, far, ground, width - far, 40, ink);
        rect(ctx, edge - 3, ground, 3, 14, green);
        rect(ctx, far, ground, 3, 14, green);
        rect(ctx, x - 7, y - 15, 15, 15, coral);
        rect(ctx, x + 2, y - 12, 3, 3, paper);
        if (!running) return;
        if (reaches && t >= landingAt) finish(input + " 已落到对岸。");
        else if (jumpedAt !== null && from + speed * landingAt < edge && t >= landingAt) {
          finish(input + " 起跳太早，落回了原平台。");
        } else if (y > height + 15) {
          finish((input || "这次没有按跳跃。") + " 掉进了坑。");
        }
      }
    };
  }

  function swordTrial({ ctx, variant, say }) {
    const cooldown = variant === "A" ? 0.20 : 0.55;
    let x = 95, charge = null, resolveAt = null, recoverAt = 0, lastStrike = -10;
    let reach = 0, hit = false, moving = false, lastTime = 0;
    const target = t => 201 + 56 * Math.cos(t * Math.PI / 1.2);
    return {
      press(t) {
        if (charge !== null || resolveAt !== null || t < recoverAt) return;
        charge = t;
        say("正在蓄力。松开挥击，挥完可以按住移动。");
      },
      release(t) {
        if (charge === null) return;
        reach = 62 + 20 * Math.min(1, (t - charge) / 0.6);
        charge = null;
        resolveAt = t + 0.14;
        say("已出手。");
      },
      move(held) { moving = held; },
      draw(t) {
        if (resolveAt !== null && t >= resolveAt) {
          lastStrike = resolveAt;
          hit = Math.abs(target(resolveAt) - (x + reach / 2)) <= reach / 2 + 8;
          recoverAt = resolveAt + (hit ? 0.24 : cooldown);
          resolveAt = null;
          say(hit ? "命中。可以按住移动，看人物何时迈步。" : "挥空。按住移动，看人物何时迈出下一步。");
        }
        if (moving && charge === null && resolveAt === null && t > recoverAt) {
          x = Math.min(264, x + Math.max(0, t - Math.max(recoverAt, lastTime)) * 85);
        }
        lastTime = t;
        rect(ctx, 0, 93, width, 29, ink);
        rect(ctx, 139, 91, 123, 2, "#8eaa8f");
        const mark = target(t);
        disc(ctx, mark, 72, 13, hit && t - lastStrike < 0.22 ? green : coral);
        disc(ctx, mark, 72, 6, paper);
        rect(ctx, x - 8, 67, 16, 25, ink);
        disc(ctx, x, 61, 9, ink);
        const swinging = resolveAt !== null || t - lastStrike < 0.12;
        const recovering = t < recoverAt;
        ctx.save();
        ctx.translate(x + 4, 73);
        ctx.rotate(swinging ? -0.10 : recovering ? 0.36 : charge !== null ? -1.95 : -1.1);
        rect(ctx, 0, -3, swinging ? reach : 57, 6, recovering ? "#777e72" : ink);
        rect(ctx, 6, -7, 4, 14, "#a4b58c");
        ctx.restore();
        if (charge !== null) {
          rect(ctx, x - 22, 37, 44, 5, "#c6cfbd");
          rect(ctx, x - 22, 37, 44 * Math.min(1, (t - charge) / 0.6), 5, coral);
        }
        if (recovering) rect(ctx, x - 12, 98, 24 * (recoverAt - t) / (recoverAt - lastStrike), 4, green);
      }
    };
  }

  function beatTrial({ ctx, variant, say, finish }) {
    const period = 0.6, windowSize = 0.080;
    const taps = Array(8).fill(null);
    let audio, first = 0, lastTap = -10, phase = "";
    function tone(at, frequency, duration, volume) {
      const osc = audio.createOscillator(), gain = audio.createGain();
      osc.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(volume, at + 0.004);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
      osc.connect(gain).connect(audio.destination);
      osc.start(at);
      osc.stop(at + duration + 0.005);
      osc.onended = () => { osc.disconnect(); gain.disconnect(); };
    }
    // Compare inputs to music reaching the speakers, not the next animation frame.
    function musicTime() {
      const stamp = audio.getOutputTimestamp?.();
      if (stamp?.performanceTime > 0 && stamp.contextTime > 0) {
        return stamp.contextTime + (performance.now() - stamp.performanceTime) / 1000;
      }
      return audio.currentTime - (audio.outputLatency || audio.baseLatency || 0);
    }
    return {
      async start() {
        const Audio = window.AudioContext || window.webkitAudioContext;
        if (!Audio) throw new Error("音频不可用");
        audio = new Audio();
        await audio.resume();
        if (audio.state !== "running") throw new Error("音频未启动");
        first = audio.currentTime + 0.14 + 3 * period;
        for (let i = -3; i < 8; i++) tone(first + i * period, i < 0 ? 460 : 680, 0.045, 0.22);
      },
      press() {
        const t = musicTime() - first, i = Math.round(t / period);
        if (i < 0 || i >= taps.length || taps[i] !== null) return;
        const offset = t - i * period;
        taps[i] = Math.abs(offset) <= windowSize;
        lastTap = t;
        tone(audio.currentTime, 175, 0.07, 0.25);
        if (variant === "B" && taps[i]) tone(audio.currentTime + 0.007, 1260, 0.09, 0.13);
      },
      draw(t, running) {
        const elapsed = running && audio ? musicTime() - first : -3 * period - 0.1;
        const nearest = Math.round(elapsed / period);
        const gap = Math.abs(elapsed - nearest * period);
        const pulse = 1 - Math.min(1, gap / 0.20);
        rect(ctx, 26, 68, width - 52, 2, "#a2ada0");
        for (let i = 0; i < 8; i++) {
          disc(ctx, 41 + i * 48, 69, i === nearest && running ? 11 + pulse * 4 : 7,
            i === nearest && running ? ink : "#8b9c90");
        }
        if (elapsed - lastTap < 0.13 && nearest >= 0 && nearest < 8) {
          disc(ctx, 41 + nearest * 48, 69, 6, green);
        }
        if (!running) return;
        const nextPhase = nearest < 0 ? "先听三拍预备音，随后跟着八拍挥击。" : "跟拍挥击。八拍结束后看结果。";
        if (nextPhase !== phase) { say(nextPhase); phase = nextPhase; }
        if (elapsed > 7.5 * period) {
          const report = [];
          for (const [value, label] of [[true, "合拍"], [false, "偏拍"], [null, "漏拍"]]) {
            const beats = taps.flatMap((tap, i) => tap === value ? [i + 1] : []);
            if (beats.length) report.push(label + " " + beats.length + " 次（第 " + beats.join("、") + " 拍）");
          }
          finish("八拍结束。" + report.join("，") + "。");
        }
      },
      dispose() { if (audio && audio.state !== "closed") audio.close().catch(() => {}); }
    };
  }

  const recipes = {
    jump: { make: jumpTrial, instruction: "方块会向右跑。试着刚跑出台沿再按跳跃。", action: "跳跃", variants: ["离台即失效", "宽限 100 毫秒"] },
    sword: { make: swordTrial, instruction: "按住蓄力、松开挥击。挥空后按住移动，留意第一步何时迈出。", action: "按住蓄力", variants: ["收招 0.2 秒", "收招 0.55 秒"] },
    beat: { make: beatTrial, instruction: "请开声音。听三拍预备音，再跟着八拍挥击。两版的合拍范围相同。", action: "挥击", variants: ["普通挥击声", "合拍多一声"] }
  };

  function stopActive() { active?.stop(); }
  window.addEventListener("pagehide", stopActive);
  window.addEventListener("hashchange", stopActive);
  document.addEventListener("visibilitychange", () => { if (document.hidden) stopActive(); });
  function stopOutside(e) { if (active && !active.root.contains(e.target)) stopActive(); }
  document.addEventListener("pointerdown", stopOutside, true);
  document.addEventListener("focusin", stopOutside);

  window.feelLab = function (kind) {
    const recipe = recipes[kind];
    const root = node("details", "", "feel-lab");
    root.dataset.feel = kind;
    root.append(node("summary", "试玩 A/B 原型"));
    const body = node("div", "", "feel-lab-body");
    const canvas = node("canvas");
    canvas.width = width * 2; canvas.height = height * 2;
    canvas.setAttribute("aria-label", { jump: "方块越过平台缺口", sword: "挥击往返移动的圆靶", beat: "八拍位置与挥击节奏" }[kind]);
    canvas.setAttribute("role", "img");
    const status = node("p", "选好版本后点开始。", "feel-lab-status");
    status.setAttribute("role", "status");
    const modes = node("div", "", "feel-lab-modes");
    const controls = node("div", "", "feel-lab-controls");
    function button(text, where) {
      const b = node("button", text);
      b.type = "button"; where.append(b); return b;
    }
    let variant = "A", trial, running = false, started = 0, frame = 0;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      body.append(node("p", "当前浏览器无法显示试玩画面。可以按卡片上的原型步骤做 A/B 对照。", "feel-lab-help"));
      root.append(body);
      return root;
    }
    ctx.scale(2, 2);
    const modeButtons = recipe.variants.map((label, i) => button((i ? "B · " : "A · ") + label, modes));
    const start = button("开始", controls), action = button(recipe.action, controls);
    const walk = kind === "sword" ? button("按住移动 →", controls) : null;
    const stopButton = button("停止", controls);
    const keyHelp = kind === "sword" ? "空格蓄力，松开挥击，→ 移动。" : "也可按空格。";
    body.append(node("p", recipe.instruction + keyHelp, "feel-lab-help"), modes, canvas, controls, status);
    root.append(body);
    const say = s => { status.textContent = s; };
    function paint(t, live) {
      rect(ctx, 0, 0, width, height, paper);
      trial.draw(t, live);
    }
    function stop(message = "已停止，点开始可重试。") {
      running = false;
      cancelAnimationFrame(frame);
      trial?.dispose?.();
      if (active?.root === root) active = null;
      action.disabled = true;
      if (walk) walk.disabled = true;
      stopButton.hidden = true;
      start.textContent = "开始";
      say(message);
    }
    function setup() {
      trial = recipe.make({ ctx, variant, say, finish: stop });
      modeButtons.forEach((b, i) => b.setAttribute("aria-pressed", String(variant === (i ? "B" : "A"))));
      paint(0, false);
    }
    async function begin() {
      stopActive();
      setup();
      const instance = trial;
      active = { root, stop }; stopButton.hidden = false;
      try { await trial.start?.(); }
      catch {
        if (active?.root === root && trial === instance) stop("声音未能启动。请检查浏览器的声音设置，再点开始。");
        return;
      }
      if (active?.root !== root || trial !== instance) return;
      running = true; started = performance.now(); start.textContent = "重试";
      action.disabled = false; if (walk) walk.disabled = false;
      action.focus({ preventScroll: true });
      say(recipe.instruction);
      function tick(now) {
        if (!root.isConnected || !root.open || document.hidden) { stop(); return; }
        paint(Math.max(0, (now - started) / 1000), true);
        if (running) frame = requestAnimationFrame(tick);
      }
      frame = requestAnimationFrame(tick);
    }
    const time = () => (performance.now() - started) / 1000;
    const down = () => { if (running) trial.press(time()); };
    const up = () => { if (running) trial.release?.(time()); };
    function bindHold(b, press, release) {
      b.addEventListener("pointerdown", e => {
        if (e.button !== 0 || b.disabled) return;
        b.setPointerCapture(e.pointerId);
        press();
      });
      b.addEventListener("pointerup", release);
      b.addEventListener("pointercancel", () => { if (running) stop(); });
      b.addEventListener("keydown", e => {
        if (![" ", "Enter"].includes(e.key)) return;
        e.preventDefault();
        if (!e.repeat) press();
      });
      b.addEventListener("keyup", e => {
        if ([" ", "Enter"].includes(e.key)) { e.preventDefault(); release(); }
      });
      // Assistive technology can click a button without a pointer or keyboard event.
      b.addEventListener("click", e => { if (e.detail === 0 && !b.disabled) { press(); release(); } });
    }
    bindHold(action, down, up);
    if (walk) {
      bindHold(walk, () => trial.move(true), () => trial.move(false));
      root.addEventListener("keydown", e => {
        if (running && e.key === "ArrowRight") { e.preventDefault(); trial.move(true); }
      });
      root.addEventListener("keyup", e => {
        if (running && e.key === "ArrowRight") { e.preventDefault(); trial.move(false); }
      });
    }
    modeButtons.forEach((b, i) => b.addEventListener("click", () => {
      stop("已切换版本，点开始可重试。"); variant = i ? "B" : "A"; setup();
    }));
    start.addEventListener("click", begin);
    stopButton.addEventListener("click", () => stop());
    root.addEventListener("toggle", () => {
      if (!root.open && active?.root === root) stop();
      else if (root.open && active && active.root !== root) stopActive();
    });
    stop("选好版本后点开始。"); setup();
    return root;
  };
})();

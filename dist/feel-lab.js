/* Short, single-variable experiments. Each instance is idle until Start. */
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

  function deflectTrial({ ctx, variant, say, finish }) {
    const contacts = [1.25, 2.8, 4.35], line = 125, y = 68;
    const results = [];
    let pressedAt = -Infinity, held = false;

    function resolve(t) {
      while (results.length < contacts.length && contacts[results.length] <= t) {
        const lead = contacts[results.length] - pressedAt;
        const result = lead >= 0 && lead <= 0.12 ? "弹反" : held ? "格挡" : "漏接";
        results.push(result);
        say("第 " + results.length + " 颗：" + result + "。");
      }
    }
    return {
      press(t) {
        // Settle any earlier contact before using the new input.
        if (t > contacts[results.length]) resolve(t);
        if (!held) { pressedAt = t; held = true; }
      },
      release(t) { resolve(t); held = false; },
      draw(t, running) {
        if (running) resolve(t);
        rect(ctx, 45, y + 14, 330, 2, "#a2ada0");
        rect(ctx, line - 1, y - 30, 2, 49, "#8a998d");
        rect(ctx, line - 24, y - 11, 16, 25, ink);
        rect(ctx, line - 8, y - 15, held ? 8 : 4, 30, held ? coral : ink);
        for (let i = 0; i < contacts.length; i++) {
          disc(ctx, line + i * 16, 105, 4, results[i] === "弹反" ? coral : results[i] ? ink : "#b6c1b1");
        }
        if (results.length < contacts.length) {
          const remaining = contacts[results.length] - t;
          disc(ctx, Math.min(365, line + 210 * remaining), y, 7, coral);
        }
        const last = results.length - 1;
        const age = t - contacts[last];
        if (last >= 0 && age < 0.28) {
          if (results[last] === "弹反") {
            disc(ctx, line + age * 235, y - age * 95, 6, coral);
            disc(ctx, line, y, 5 * (1 - age / 0.28), coral);
            if (variant === "B") {
              const distance = 9 + age * 100;
              ctx.strokeStyle = coral;
              ctx.lineWidth = 2;
              ctx.beginPath();
              ctx.arc(line, y, distance * 0.84, 0, 2 * Math.PI);
              ctx.stroke();
              for (let i = 0; i < 8; i++) {
                const angle = i * Math.PI / 4;
                disc(ctx, line + Math.cos(angle) * distance, y + Math.sin(angle) * distance, 2, ink);
              }
            }
          } else if (results[last] === "格挡") {
            rect(ctx, line - 1, y - 9, 3, 18, ink);
          } else {
            disc(ctx, line - age * 210, y, 7, coral);
          }
        }
        if (running && last === contacts.length - 1 && age > 0.45) {
          finish("三次接触依次为" + results.join("、") + "。");
        }
      }
    };
  }

  function impactTrial({ ctx, variant, say }) {
    const hand = 116, reach = 78, radius = 13, y = 69;
    const pause = variant === "B" ? 0.065 : 0;
    let pausedTime = 0, freezeUntil = 0, lastSwing = -Infinity, hit = false;
    const target = t => 209 + 56 * Math.cos(t * Math.PI);
    // During hit-stop, the target, swing and contact effects share one frozen clock.
    const world = t => Math.max(t, freezeUntil) - pausedTime;
    return {
      press(t) {
        const now = world(t);
        if (now - lastSwing < 0.3) return;
        lastSwing = now;
        hit = target(now) - radius <= hand + reach;
        if (hit) { pausedTime += pause; freezeUntil = t + pause; }
        say(hit ? "命中。留意圆靶和挥击何时一起离开接触位置。" : "挥空。等圆靶进入地上的标记再试。");
      },
      draw(t) {
        const now = world(t), age = now - lastSwing, x = target(now);
        rect(ctx, 36, 90, 346, 3, "#97a894");
        rect(ctx, hand, 88, reach, 4, ink);
        rect(ctx, hand + reach - 2, 84, 3, 9, ink);
        rect(ctx, hand - 22, y - 6, 20, 25, ink);
        disc(ctx, hand - 12, y - 11, 8, ink);
        disc(ctx, x, y, radius, hit && age < 0.15 ? ink : coral);
        disc(ctx, x, y, 5, paper);
        ctx.save();
        ctx.translate(hand, y);
        ctx.rotate(age < 0.22 ? -0.05 - age * 4.5 : -1.04);
        rect(ctx, 0, -2, reach, 4, ink);
        ctx.restore();
        if (hit && age < 0.15) {
          const contact = target(lastSwing) - radius, spread = 4 + age * 115;
          for (const direction of [-1, 1]) {
            rect(ctx, contact - 2, y + direction * spread - 2, 4, 4, coral);
            rect(ctx, contact - spread, y + direction * spread * 0.65, 3, 3, coral);
          }
        }
      }
    };
  }

  function reboundTrial({ ctx, variant, say, finish }) {
    const floor = 98, x = 200, heightGain = variant === "B" ? 68 : 34;
    const gravity = 320, speed = Math.sqrt(2 * gravity * heightGain);
    let contact = 1, launch = null, armed = false, landed = false, bounces = 0;
    function resolve(t) {
      while (!landed && t >= contact) {
        if (!armed) { landed = true; break; }
        launch = contact;
        contact += 2 * speed / gravity;
        armed = false;
        bounces++;
        say("回弹 " + bounces + " 次。看脚底能否越过标线，落下时可再敲。");
      }
    }
    return {
      press(t) {
        resolve(t);
        if (landed || armed) return;
        if (launch !== null && t < launch + speed / gravity) {
          say("还在上升。等方块开始下落，再按下敲。");
          return;
        }
        armed = true;
        say("已进入下敲姿态，碰到弹台就会回弹。");
      },
      draw(t, running) {
        if (running) resolve(t);
        const dt = t - launch;
        const foot = landed ? floor : launch === null ? 26 + (floor - 26) * t * t
          : floor - speed * dt + gravity * dt * dt / 2;
        rect(ctx, 76, floor + 12, 268, 2, "#a2ada0");
        rect(ctx, x - 28, floor, 56, 12, ink);
        rect(ctx, x - 24, floor, 48, 3, coral);
        for (let mark = 92; mark <= 298; mark += 10) rect(ctx, mark, floor - 50, 6, 2, "#73836c");
        ctx.fillStyle = ink;
        ctx.font = "12px sans-serif";
        ctx.fillText("50 像素", 306, floor - 46);
        rect(ctx, x - 8, foot - 18, 16, 14, ink);
        if (armed) {
          ctx.fillStyle = coral;
          ctx.beginPath(); ctx.moveTo(x - 6, foot - 5); ctx.lineTo(x + 6, foot - 5);
          ctx.lineTo(x, foot); ctx.closePath(); ctx.fill();
        } else rect(ctx, x - 5, foot - 4, 10, 4, ink);
        if (running && landed && t >= contact + 0.28) {
          finish("落在弹台上。本次连续回弹 " + bounces + " 次。");
        }
      }
    };
  }

  const recipes = {
    jump: { make: jumpTrial, instruction: "方块会向右跑。试着刚跑出台沿再按跳跃。", action: "跳跃", variants: ["离台即失效", "宽限 100 毫秒"] },
    sword: { make: swordTrial, instruction: "按住蓄力、松开挥击。挥空后按住移动，留意第一步何时迈出。", action: "按住蓄力", variants: ["收招 0.2 秒", "收招 0.55 秒"] },
    beat: { make: beatTrial, instruction: "请开声音。听三拍预备音，再跟着八拍挥击。两版的合拍范围相同。", action: "挥击", variants: ["普通挥击声", "合拍多一声"] },
    deflect: { make: deflectTrial, instruction: "三颗光点会依次飞向竖线。试一次提前按住，再试一次贴线时轻点。", action: "格挡", variants: ["小火花", "亮环与火星"] },
    impact: { make: impactTrial, instruction: "圆靶左右滑动。等它进入深色地标再挥击，也试一下挥空。", action: "挥击", variants: ["命中不停顿", "命中停顿 65 毫秒"] },
    rebound: { make: reboundTrial, instruction: "方块下落时按「下敲」，碰到弹台会回弹。看脚底能否超过虚线。", action: "下敲", variants: ["回弹 34 像素", "回弹 68 像素"] }
  };

  function stopActive() { active?.stop(); }
  window.addEventListener("pagehide", stopActive);
  window.addEventListener("hashchange", stopActive);
  document.addEventListener("visibilitychange", () => { if (document.hidden) stopActive(); });
  function stopOutside(e) { if (active && !active.root.contains(e.target)) stopActive(); }
  document.addEventListener("pointerdown", stopOutside, true);
  document.addEventListener("focusin", stopOutside);

  window.feelLab = function (kind) {
    if (!Object.hasOwn(recipes, kind)) return null;
    const recipe = recipes[kind];
    const root = node("details", "", "feel-lab");
    root.dataset.feel = kind;
    root.append(node("summary", "试玩 A/B 原型"));
    const body = node("div", "", "feel-lab-body");
    const canvas = node("canvas");
    canvas.width = width * 2; canvas.height = height * 2;
    canvas.setAttribute("aria-label", {
      jump: "方块越过平台缺口", sword: "挥击往返移动的圆靶", beat: "八拍位置与挥击节奏",
      deflect: "在竖线处弹回飞来的光点", impact: "挥击进入地标范围的移动圆靶", rebound: "方块下敲弹台并对照虚线高度"
    }[kind]);
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

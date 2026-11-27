(() => {
  const width = 480, height = 246, focal = 290;
  const freezeMs = 65;
  const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
  let stopRunning;

  function element(tag, className, text) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text) el.textContent = text;
    return el;
  }

  function project(x, y, z, yaw, pitch) {
    const side = x * Math.cos(yaw) - z * Math.sin(yaw);
    const forward = x * Math.sin(yaw) + z * Math.cos(yaw);
    const up = y - 1.6;
    const depth = forward * Math.cos(pitch) + up * Math.sin(pitch);
    const scale = focal / depth;
    return {
      x: width / 2 + side * scale,
      y: height / 2 - (up * Math.cos(pitch) - forward * Math.sin(pitch)) * scale,
      scale
    };
  }

  function blockAt(time, yaw, pitch) {
    const p = project(1.35 * Math.sin(time * 0.0009), 1.6, 8, yaw, pitch);
    return { x: p.x, y: p.y, half: 0.73 * p.scale };
  }

  function drawRoom(ctx, yaw, pitch) {
    function panel(points, color) {
      ctx.beginPath();
      points.forEach(([x, y, z], i) => {
        const p = project(x, y, z, yaw, pitch);
        if (i === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      });
      ctx.closePath(); ctx.fillStyle = color; ctx.fill();
    }
    function seam(a, b) {
      const p = project(...a, yaw, pitch), q = project(...b, yaw, pitch);
      ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke();
    }
    ctx.fillStyle = "#dce3dd"; ctx.fillRect(0, 0, width, height);
    const horizon = project(0, 1.6, 10, yaw, pitch).y;
    ctx.fillStyle = "#b3c0b8"; ctx.fillRect(0, horizon, width, height);
    panel([[-7,0,11],[7,0,11],[7,5.6,11],[-7,5.6,11]], "#c8d2ca");
    panel([[-7,0,4],[-7,0,11],[-7,5.6,11],[-7,5.6,4]], "#adbcb3");
    panel([[7,0,11],[7,0,4],[7,5.6,4],[7,5.6,11]], "#9dafa6");
    ctx.lineWidth = 0.8; ctx.strokeStyle = "#93a59b";
    for (let z = 5; z <= 11; z += 2) seam([-7,0,z],[7,0,z]);
    for (let x = -6; x <= 6; x += 2) seam([x,0,4],[x,0,11]);
    // The off-centre columns give the eye a fixed reference during each hit.
    for (const x of [-5.8, -3.4, 2.6, 5]) {
      panel([[x,0,11],[x+0.23,0,11],[x+0.23,5.6,11],[x,5.6,11]], "#768c80");
    }
    panel([[-5.05,0,10.9],[-3.85,0,10.9],[-3.85,2.7,10.9],[-5.05,2.7,10.9]], "#435d53");
    panel([[3.1,2.1,10.9],[4.5,2.1,10.9],[4.5,2.25,10.9],[3.1,2.25,10.9]], "#557567");
  }

  function draw(ctx, state) {
    const { time, yaw, pitch, firedAt, hit } = state;
    drawRoom(ctx, yaw, pitch);
    const block = blockAt(time, yaw, pitch);
    const age = time - firedAt, pulse = Math.max(0, 1 - age / 155);
    const x = block.x - block.half, y = block.y - block.half, size = 2 * block.half;
    ctx.fillStyle = hit && pulse ? "#ffe7b6" : "#ed795b"; ctx.fillRect(x, y, size, size);
    ctx.fillStyle = hit && pulse ? "#e1a46f" : "#a94c3c";
    ctx.fillRect(x + size * 0.8, y + size * 0.12, size * 0.2, size * 0.88);
    ctx.strokeStyle = "#653e31"; ctx.lineWidth = 1.5; ctx.strokeRect(x, y, size, size);
    if (hit && pulse) {
      ctx.strokeStyle = "#fffbe7"; ctx.lineWidth = 3 * pulse;
      ctx.strokeRect(x - 5 - age * 0.06, y - 5 - age * 0.06, size + 10 + age * 0.12, size + 10 + age * 0.12);
    }
    // A handheld light emitter shares the block's animation clock.
    ctx.save(); ctx.translate(359, 235 + 13 * pulse + 1.4 * Math.sin(time * 0.004));
    ctx.rotate(-0.4);
    ctx.fillStyle = "#314b46"; ctx.fillRect(-13, -56, 41, 96);
    ctx.fillStyle = "#658479"; ctx.fillRect(-13, -56, 8, 91);
    ctx.beginPath(); ctx.ellipse(7, -55, 21, 11, 0, 0, Math.PI * 2);
    ctx.fillStyle = "#263e39"; ctx.fill();
    ctx.beginPath(); ctx.ellipse(7, -55, 14, 6, 0, 0, Math.PI * 2);
    ctx.fillStyle = pulse ? "#fff4ad" : "#b8f388"; ctx.fill();
    ctx.restore();
    ctx.fillStyle = "#152e2b"; ctx.fillRect(width/2-4, height/2-1, 9, 3); ctx.fillRect(width/2-1, height/2-4, 3, 9);
    ctx.fillStyle = "#fffce9"; ctx.fillRect(width/2, height/2, 1, 1);
  }

  window.fpsLab = function () {
    const root = element("details", "feel-lab fps-lab");
    root.dataset.feel = "fps-camera";
    root.append(element("summary", "", "试玩 A/B 原型"));
    const body = element("div", "feel-lab-body");
    const help = element("p", "feel-lab-help fps-help");
    help.append(element("span", "fps-desktop", "在画面里移动鼠标转头，单击发射。"),
      element("span", "fps-touch", "一指拖动画面转头，另一指点「发射」。"),
      document.createTextNode("也可用方向键转头、空格发射。让中央十字经过橙色方块时点击，同时继续转头，看后墙的立柱。"));
    const modes = element("div", "feel-lab-modes");
    const canvas = element("canvas");
    canvas.width = width * 2; canvas.height = height * 2; canvas.tabIndex = 0;
    canvas.setAttribute("aria-label", "第一人称房间中的移动方块。方向键转动视角，空格发射光脉冲。");
    const controls = element("div", "feel-lab-controls"), status = element("p", "feel-lab-status");
    status.setAttribute("role", "status");
    function button(parent, text) {
      const b = element("button", "", text); b.type = "button"; parent.append(b); return b;
    }
    const a = button(modes, "A · 镜头可转"), b = button(modes, "B · 镜头同停");
    const start = button(controls, "开始"), fireButton = button(controls, "发射"), end = button(controls, "停止");
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      body.append(element("p", "feel-lab-help", "这个浏览器未能打开试玩画布。")); root.append(body); return root;
    }
    ctx.scale(2, 2);
    body.append(help, modes, canvas, controls, status); root.append(body);

    let variant = "A", running = false, listeners, raf = 0;
    let state, last = 0, freezeUntil = 0, pointer = null;
    const keys = new Set();
    function reset() {
      state = { time: 0, yaw: 0, pitch: 0, firedAt: -Infinity, hit: false };
      last = performance.now(); freezeUntil = 0; pointer = null; keys.clear();
      a.setAttribute("aria-pressed", String(variant === "A"));
      b.setAttribute("aria-pressed", String(variant === "B"));
      draw(ctx, state);
    }
    function turn(dx, dy) {
      state.yaw = clamp(state.yaw + dx, -0.4, 0.4);
      state.pitch = clamp(state.pitch + dy, -0.16, 0.16);
    }
    function advance(now) {
      const worldDelta = Math.max(0, now - Math.max(last, freezeUntil));
      state.time += worldDelta;
      const viewDelta = variant === "B" ? worldDelta : Math.max(0, now - last);
      const horizontal = Number(keys.has("ArrowRight")) - Number(keys.has("ArrowLeft"));
      const vertical = Number(keys.has("ArrowUp")) - Number(keys.has("ArrowDown"));
      turn(horizontal * viewDelta * 0.0008, vertical * viewDelta * 0.0006);
      last = now;
    }
    function fire() {
      if (!running) return;
      const now = performance.now(); advance(now);
      if (state.time - state.firedAt < 165) return;
      const block = blockAt(state.time, state.yaw, state.pitch);
      state.hit = Math.abs(block.x - width/2) <= block.half && Math.abs(block.y - height/2) <= block.half;
      state.firedAt = state.time;
      if (state.hit) freezeUntil = now + freezeMs;
      status.textContent = state.hit ? "命中。方块和手里的装置停顿 65 毫秒。" : "未命中。准星经过橙色方块时再点一次。";
      draw(ctx, state);
    }
    function stop(message = "已停止。") {
      running = false; cancelAnimationFrame(raf); listeners?.abort();
      root.classList.remove("is-running");
      keys.clear(); pointer = null;
      if (stopRunning === stop) stopRunning = null;
      fireButton.disabled = true; end.hidden = true; start.textContent = "开始"; status.textContent = message;
    }
    function begin() {
      stopRunning?.(); reset(); running = true; stopRunning = stop;
      root.classList.add("is-running");
      listeners = new AbortController();
      const opts = { signal: listeners.signal };
      const outside = e => { if (!root.contains(e.target)) stop(); };
      window.addEventListener("pagehide", () => stop(), opts);
      window.addEventListener("hashchange", () => stop(), opts);
      window.addEventListener("blur", () => stop(), opts);
      document.addEventListener("visibilitychange", () => { if (document.hidden) stop(); }, opts);
      document.addEventListener("focusin", outside, opts);
      document.addEventListener("pointerdown", outside, { ...opts, capture: true });
      start.textContent = "重试"; end.hidden = false; fireButton.disabled = false;
      status.textContent = "已开始。边转头边点方块，观察后墙是否仍在移动。";
      canvas.focus({ preventScroll: true });
      function tick() {
        if (!root.open || !root.isConnected) { stop(); return; }
        advance(performance.now()); draw(ctx, state); raf = requestAnimationFrame(tick);
      }
      raf = requestAnimationFrame(tick);
    }
    for (const [control, mode] of [[a, "A"], [b, "B"]]) {
      control.addEventListener("click", () => { stop("点开始，从同一个位置比较。"); variant = mode; reset(); });
    }
    start.addEventListener("click", begin); end.addEventListener("click", () => stop());
    root.addEventListener("toggle", () => { if (!root.open && running) stop(); });
    function rememberPointer(e, at) {
      pointer = { id: e.pointerId, x: e.clientX, y: e.clientY, at };
    }
    canvas.addEventListener("pointerenter", e => {
      if (running && e.pointerType === "mouse") rememberPointer(e, performance.now());
    });
    canvas.addEventListener("pointerdown", e => {
      if (!running || e.button !== 0 || (pointer && pointer.id !== e.pointerId)) return;
      canvas.focus({ preventScroll: true });
      rememberPointer(e, performance.now());
      if (e.pointerType === "mouse") fire();
      else canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener("pointermove", e => {
      if (!running) return;
      const now = performance.now();
      if (!pointer && e.pointerType === "mouse") { rememberPointer(e, now); return; }
      if (!pointer || pointer.id !== e.pointerId) return;
      advance(now);
      const delta = now - pointer.at;
      let fraction = 1;
      if (variant === "B" && pointer.at < freezeUntil) {
        fraction = delta > 0 ? clamp((now - freezeUntil) / delta, 0, 1) : 0;
      }
      const sensitivity = 0.0024 * width / canvas.clientWidth;
      turn((e.clientX - pointer.x) * sensitivity * fraction, (pointer.y - e.clientY) * sensitivity * fraction);
      rememberPointer(e, now);
      draw(ctx, state);
    });
    canvas.addEventListener("pointerleave", e => { if (e.pointerType === "mouse") pointer = null; });
    canvas.addEventListener("lostpointercapture", e => { if (pointer?.id === e.pointerId) pointer = null; });
    fireButton.addEventListener("pointerdown", e => { if (e.button === 0) { e.preventDefault(); fire(); } });
    fireButton.addEventListener("click", e => { if (e.detail === 0) fire(); });
    canvas.addEventListener("keydown", e => {
      if (!running || (!e.key.startsWith("Arrow") && e.code !== "Space" && e.key !== "Enter")) return;
      e.preventDefault();
      if (e.key.startsWith("Arrow")) { advance(performance.now()); keys.add(e.key); }
      else if (!e.repeat) fire();
    });
    canvas.addEventListener("keyup", e => {
      if (!keys.has(e.key)) return;
      e.preventDefault(); advance(performance.now()); keys.delete(e.key);
    });
    canvas.addEventListener("blur", () => keys.clear());
    stop("选好版本后点开始。"); reset();
    return root;
  };
})();

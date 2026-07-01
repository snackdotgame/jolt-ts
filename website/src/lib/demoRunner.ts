// Client bootstrap for <PhysicsDemo/> canvases.
//
// Each demo stays idle until the reader presses its "Run demo" button. Only then
// do we load the shared runtime, dynamically import the demo module
// (`src/demos/<id>.ts`), and hand it to the harness — so nothing heavy loads
// until it's asked for. The stage's `data-state` attribute drives what the UI
// shows (idle / loading / running / paused / error) via CSS.
import { getRuntime } from "./jolt";
import { createDemo, type DemoHandle, type DemoModule } from "./harness";

// Vite statically analyzes this glob and code-splits every demo into its own
// chunk, so only the demos a reader actually runs get downloaded.
const demoModules = import.meta.glob<DemoModule>("../demos/*.ts");

const active = new Set<DemoHandle>();
let disposeHooked = false;

export function mountDemos(): void {
  if (typeof document === "undefined") return;
  hookNavigationCleanup();
  document.querySelectorAll<HTMLCanvasElement>("canvas[data-jolt-demo]").forEach(mountOne);
}

// Starlight navigates with view transitions, so tear running demos down before
// the DOM is swapped — otherwise their WebGL contexts and animation loops leak
// across pages.
function hookNavigationCleanup(): void {
  if (disposeHooked) return;
  disposeHooked = true;
  document.addEventListener("astro:before-swap", () => {
    for (const handle of active) handle.dispose();
    active.clear();
  });
}

function mountOne(canvas: HTMLCanvasElement): void {
  if (canvas.dataset.joltMounted) return;
  canvas.dataset.joltMounted = "1";

  const id = canvas.dataset.joltDemo ?? "";
  const stage = canvas.closest<HTMLElement>(".jolt-demo__stage") ?? canvas.parentElement!;
  const errorEl = stage.querySelector<HTMLElement>(".jolt-demo__error");
  const runBtn = stage.querySelector<HTMLButtonElement>('[data-action="run"]');
  const toggleBtn = stage.querySelector<HTMLButtonElement>('[data-action="toggle"]');
  const resetBtn = stage.querySelector<HTMLButtonElement>('[data-action="reset"]');

  let handle: DemoHandle | null = null;
  let status: "idle" | "loading" | "running" | "error" = "idle";

  const setState = (state: string) => {
    stage.dataset.state = state;
  };

  const syncToggleLabel = () => {
    if (!toggleBtn || !handle) return;
    toggleBtn.textContent = handle.paused ? "▶ Play" : "❚❚ Pause";
    toggleBtn.setAttribute("aria-label", handle.paused ? "Play simulation" : "Pause simulation");
  };

  const start = async () => {
    if (status === "loading" || status === "running") return;
    const loader = demoModules[`../demos/${id}.ts`];
    if (!loader) {
      status = "error";
      setState("error");
      if (errorEl) errorEl.textContent = `Unknown demo “${id}”.`;
      return;
    }
    status = "loading";
    setState("loading");
    try {
      const [runtime, module] = await Promise.all([getRuntime(), loader()]);
      handle = await createDemo(canvas, runtime, module);
      active.add(handle);
      status = "running";
      setState("running");
      syncToggleLabel();
    } catch (error) {
      status = "error";
      setState("error");
      if (errorEl) errorEl.textContent = "Could not start this demo. See the console for details.";
      console.error(`[jolt-ts demo:${id}]`, error);
    }
  };

  runBtn?.addEventListener("click", () => void start());

  toggleBtn?.addEventListener("click", () => {
    if (!handle) return;
    const paused = !handle.paused;
    handle.setPaused(paused);
    setState(paused ? "paused" : "running");
    syncToggleLabel();
  });

  resetBtn?.addEventListener("click", () => {
    if (!handle) {
      void start();
      return;
    }
    void handle.reset().then(() => {
      setState("running");
      syncToggleLabel();
    });
  });
}

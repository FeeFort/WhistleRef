const SHOW_DELAY = 350;
const FADE_DURATION = 130;
const HIDE_DELAY = 450;
const GAP = 9;

function contentFrom(binding) {
  return typeof binding.value === "object" && binding.value ? binding.value.value : binding.value;
}

function isHtmlContent(binding) {
  return typeof binding.value === "object" && binding.value?.html;
}

function isInteractive(binding) {
  return typeof binding.value === "object" && binding.value?.interactive === true;
}

function positionFrom(binding) {
  return Object.keys(binding.modifiers).find((modifier) => ["top", "bottom", "left", "right"].includes(modifier)) || "top";
}

function placeTooltip(target, tooltip, position) {
  const rect = target.getBoundingClientRect();
  const tooltipRect = tooltip.getBoundingClientRect();
  let left = rect.left + (rect.width - tooltipRect.width) / 2;
  let top = rect.top - tooltipRect.height - GAP;

  if (position === "bottom") top = rect.bottom + GAP;
  if (position === "left") {
    left = rect.left - tooltipRect.width - GAP;
    top = rect.top + (rect.height - tooltipRect.height) / 2;
  }
  if (position === "right") {
    left = rect.right + GAP;
    top = rect.top + (rect.height - tooltipRect.height) / 2;
  }

  tooltip.style.left = `${Math.max(8, Math.min(left, window.innerWidth - tooltipRect.width - 8))}px`;
  tooltip.style.top = `${Math.max(8, Math.min(top, window.innerHeight - tooltipRect.height - 8))}px`;
  tooltip.dataset.position = position;
}

function removeTooltip(target) {
  const state = target.__appTooltip;
  if (!state) return;
  window.clearTimeout(state.showTimer);
  window.clearTimeout(state.hideTimer);
  const tooltip = state.element;
  state.element = null;
  if (!tooltip) return;
  tooltip.classList.remove("app-tooltip--visible");
  window.setTimeout(() => tooltip.remove(), FADE_DURATION);
}

function scheduleRemoveTooltip(target) {
  const state = target.__appTooltip;
  if (!state) return;
  window.clearTimeout(state.hideTimer);
  state.hideTimer = window.setTimeout(() => {
    state.hideTimer = null;
    if (!state.overTarget && !state.overTooltip && !state.focused) removeTooltip(target);
  }, HIDE_DELAY);
}

function hideTooltip(target) {
  const state = target.__appTooltip;
  if (!state) return;
  if (state.interactive) scheduleRemoveTooltip(target);
  else removeTooltip(target);
}

function showTooltip(target) {
  const state = target.__appTooltip;
  const content = contentFrom(state?.binding);
  const textContent = typeof content === "string" ? content.trim() : "";
  const htmlContent = isHtmlContent(state?.binding) ? String(state.binding.value.html || "").trim() : "";
  if (!state || (!textContent && !htmlContent) || target.disabled) return;
  window.clearTimeout(state.showTimer);
  window.clearTimeout(state.hideTimer);
  state.showTimer = window.setTimeout(() => {
    if (state.element || target.disabled) return;
    const tooltip = document.createElement("div");
    tooltip.className = "app-tooltip";
    tooltip.setAttribute("role", "tooltip");
    if (htmlContent) tooltip.innerHTML = htmlContent;
    else tooltip.textContent = textContent;
    if (state.interactive) {
      tooltip.addEventListener("mouseenter", () => {
        state.overTooltip = true;
        window.clearTimeout(state.hideTimer);
      });
      tooltip.addEventListener("mouseleave", () => {
        state.overTooltip = false;
        scheduleRemoveTooltip(target);
      });
    }
    document.body.appendChild(tooltip);
    state.element = tooltip;
    placeTooltip(target, tooltip, positionFrom(state.binding));
    requestAnimationFrame(() => tooltip.classList.add("app-tooltip--visible"));
  }, SHOW_DELAY);
}

export default {
  mounted(target, binding) {
    const state = { element: null, showTimer: null, hideTimer: null, binding, interactive: isInteractive(binding), overTarget: false, overTooltip: false, focused: false };
    const enter = () => {
      state.overTarget = true;
      showTooltip(target);
    };
    const leave = () => {
      state.overTarget = false;
      hideTooltip(target);
    };
    const focus = () => {
      state.focused = true;
      showTooltip(target);
    };
    const blur = () => {
      state.focused = false;
      hideTooltip(target);
    };
    state.enter = enter;
    state.leave = leave;
    state.focus = focus;
    state.blur = blur;
    target.__appTooltip = state;
    target.addEventListener("mouseenter", enter);
    target.addEventListener("mouseleave", leave);
    target.addEventListener("focus", focus);
    target.addEventListener("blur", blur);
  },
  updated(target, binding) {
    target.__appTooltip.binding = binding;
    target.__appTooltip.interactive = isInteractive(binding);
    if (!contentFrom(binding) && !isHtmlContent(binding)) removeTooltip(target);
  },
  unmounted(target) {
    const state = target.__appTooltip;
    if (!state) return;
    target.removeEventListener("mouseenter", state.enter);
    target.removeEventListener("mouseleave", state.leave);
    target.removeEventListener("focus", state.focus);
    target.removeEventListener("blur", state.blur);
    removeTooltip(target);
    delete target.__appTooltip;
  },
};

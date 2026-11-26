(function () {
  const editableSelector =
    'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"]';
  const isEditableTarget = (target) =>
    target instanceof Element && Boolean(target.closest(editableSelector));
  const preventPageCopy = (event) => {
    if (!isEditableTarget(event.target)) event.preventDefault();
  };

  document.addEventListener("copy", preventPageCopy, true);
  document.addEventListener("cut", preventPageCopy, true);
  document.addEventListener(
    "dragstart",
    (event) => {
      if (!isEditableTarget(event.target)) event.preventDefault();
    },
    true,
  );

  const storageKey = "pixelPathfinders.accessibility";
  const root = document.documentElement;
  const preferences = { textSize: 0, highContrast: false, reduceMotion: false };

  if (window.SiteCookieConsent?.allowsFunctionalPreferences()) {
    try {
      const storedPreferences = localStorage.getItem(storageKey);
      const saved = storedPreferences ? JSON.parse(storedPreferences) : {};
      if (saved && typeof saved === "object") {
        if ([0, 1, 2].includes(saved.textSize))
          preferences.textSize = saved.textSize;
        preferences.highContrast = saved.highContrast === true;
        preferences.reduceMotion = saved.reduceMotion === true;
      }
    } catch (error) {
      console.warn("Could not load accessibility preferences:", error);
    }
  }

  function applyPreferences() {
    root.dataset.a11yText = ["normal", "large", "larger"][preferences.textSize];
    root.dataset.a11yContrast = preferences.highContrast ? "high" : "normal";
    root.dataset.a11yMotion = preferences.reduceMotion ? "reduced" : "normal";

    const contrastButton = document.querySelector('[data-a11y-action="contrast"]');
    const motionButton = document.querySelector('[data-a11y-action="motion"]');
    const textStatus = document.querySelector("#a11yTextStatus");
    if (contrastButton)
      contrastButton.setAttribute("aria-pressed", String(preferences.highContrast));
    if (motionButton)
      motionButton.setAttribute("aria-pressed", String(preferences.reduceMotion));
    if (textStatus)
      textStatus.textContent = `Text size: ${["Standard", "Large", "Larger"][preferences.textSize]}`;
  }

  applyPreferences();

  function savePreferences() {
    if (!window.SiteCookieConsent?.allowsFunctionalPreferences())
      return "not-allowed";
    try {
      localStorage.setItem(storageKey, JSON.stringify(preferences));
      return "saved";
    } catch (error) {
      console.warn("Could not save accessibility preferences:", error);
      return "unavailable";
    }
  }

  function mountAccessibilityTools() {
    const main = document.querySelector("main");
    if (main) {
      if (!main.id) main.id = "main-content";
      if (!main.hasAttribute("tabindex")) main.setAttribute("tabindex", "-1");
      const skipLink = document.createElement("a");
      skipLink.className = "a11y-skip-link";
      skipLink.href = `#${main.id}`;
      skipLink.textContent = "Skip to main content";
      document.body.prepend(skipLink);
    }

    const widget = document.createElement("details");
    widget.className = "a11y-widget";
    widget.innerHTML = `
      <summary><span aria-hidden="true">Aa</span> Accessibility</summary>
      <div class="a11y-panel" role="group" aria-label="Accessibility settings">
        <p class="a11y-title">Display and motion</p>
        <div class="a11y-text-controls" role="group" aria-label="Text size">
          <button type="button" data-a11y-action="text-down" aria-label="Decrease text size">A−</button>
          <span id="a11yTextStatus" aria-live="polite"></span>
          <button type="button" data-a11y-action="text-up" aria-label="Increase text size">A+</button>
        </div>
        <button class="a11y-option" type="button" data-a11y-action="contrast" aria-pressed="false">High contrast</button>
        <button class="a11y-option" type="button" data-a11y-action="motion" aria-pressed="false">Reduce motion</button>
        <button class="a11y-reset" type="button" data-a11y-action="reset">Reset accessibility settings</button>
        <span class="a11y-status" role="status" aria-live="polite"></span>
      </div>`;
    document.body.append(widget);
    applyPreferences();

    widget.addEventListener("click", (event) => {
      const button =
        event.target instanceof Element
          ? event.target.closest("[data-a11y-action]")
          : null;
      if (!button) return;

      if (button.dataset.a11yAction === "text-down")
        preferences.textSize = Math.max(0, preferences.textSize - 1);
      else if (button.dataset.a11yAction === "text-up")
        preferences.textSize = Math.min(2, preferences.textSize + 1);
      else if (button.dataset.a11yAction === "contrast")
        preferences.highContrast = !preferences.highContrast;
      else if (button.dataset.a11yAction === "motion")
        preferences.reduceMotion = !preferences.reduceMotion;
      else if (button.dataset.a11yAction === "reset") {
        preferences.textSize = 0;
        preferences.highContrast = false;
        preferences.reduceMotion = false;
      }

      applyPreferences();
      const saveResult = savePreferences();
      const message =
        saveResult === "saved"
          ? "Accessibility settings updated."
          : saveResult === "not-allowed"
            ? "Settings apply for this visit. Allow functional preferences in Cookie settings to save them."
            : "Settings apply for this visit, but browser storage is unavailable.";
      const status = widget.querySelector(".a11y-status");
      status.textContent = message;
      status.className = `a11y-status ${saveResult === "unavailable" ? "err" : "ok"}`;
    });
  }

  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", mountAccessibilityTools, {
      once: true,
    });
  else mountAccessibilityTools();
})();

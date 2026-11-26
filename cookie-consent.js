(function () {
  const consentStorageKey = "pixelpathfinders:cookie-consent:v1";
  const optionalStorageKeys = [
    "pixelPathfinders.accessibility",
    "pixelpathfinders:member-dashboard-tour:v1:",
    "pixelpathfinders:admin-dashboard-tour:v1:",
  ];
  let preferences = null;
  let returnFocus = null;

  function readPreferences() {
    try {
      const saved = JSON.parse(
        window.localStorage.getItem(consentStorageKey) || "null",
      );
      return saved &&
        saved.essential === true &&
        typeof saved.functional === "boolean"
        ? saved
        : null;
    } catch (error) {
      console.error("Could not read cookie preferences:", error);
      return null;
    }
  }

  function removeOptionalPreferences() {
    try {
      optionalStorageKeys.forEach((key) => {
        if (key.endsWith(":")) {
          for (let index = window.localStorage.length - 1; index >= 0; index--) {
            const storedKey = window.localStorage.key(index);
            if (storedKey?.startsWith(key))
              window.localStorage.removeItem(storedKey);
          }
        } else {
          window.localStorage.removeItem(key);
        }
      });
    } catch (error) {
      console.error("Could not clear optional browser preferences:", error);
    }
  }

  preferences = readPreferences();

  function savePreferences(functional) {
    preferences = { essential: true, functional };
    if (!functional) removeOptionalPreferences();
    try {
      window.localStorage.setItem(
        consentStorageKey,
        JSON.stringify(preferences),
      );
      return true;
    } catch (error) {
      console.error("Could not save cookie preferences:", error);
      return false;
    }
  }

  window.SiteCookieConsent = {
    allowsFunctionalPreferences: () => preferences?.functional === true,
  };

  function initialize() {
    preferences = readPreferences();

    const banner = document.createElement("section");
    banner.className = "cookie-consent-banner";
    banner.setAttribute("aria-labelledby", "cookieConsentTitle");
    banner.innerHTML = `
      <div>
        <h2 id="cookieConsentTitle">Your cookie and storage choices</h2>
        <p>Essential browser storage keeps sign-in working and remembers this choice. Optional functional storage saves accessibility and dashboard-tour preferences. We do not use analytics or advertising cookies. <a href="/cookies.html">Read the Cookie Policy</a>.</p>
      </div>
      <div class="cookie-consent-actions">
        <button type="button" data-cookie-choice="essential">Essential only</button>
        <button type="button" data-open-cookie-preferences>Preferences</button>
        <button class="cookie-allow-button" type="button" data-cookie-choice="functional">Allow functional preferences</button>
      </div>`;

    const launcher = document.createElement("button");
    launcher.className = "cookie-settings-launcher";
    launcher.type = "button";
    launcher.textContent = "Cookie settings";
    launcher.setAttribute("aria-label", "Manage cookie and storage preferences");
    launcher.hidden = !preferences;

    const overlay = document.createElement("div");
    overlay.className = "cookie-settings-overlay";
    overlay.hidden = true;
    overlay.innerHTML = `
      <section class="cookie-settings-dialog" role="dialog" aria-modal="true" aria-labelledby="cookieSettingsTitle" aria-describedby="cookieSettingsDescription" tabindex="-1">
        <h2 id="cookieSettingsTitle">Cookie and storage preferences</h2>
        <p id="cookieSettingsDescription">Choose whether this browser may remember optional functional preferences. Essential storage is always active so account sign-in and your choice work correctly. There are no analytics or advertising cookies in use.</p>
        <div class="cookie-category">
          <label><input type="checkbox" checked disabled> Essential storage <span>Always on</span></label>
          <p>Supabase account sign-in and this consent choice.</p>
        </div>
        <div class="cookie-category">
          <label><input id="cookieFunctionalPreference" type="checkbox"> Functional preferences</label>
          <p>Remembers accessibility display settings and whether you have completed a dashboard tour. If disabled, these preferences are used only for the current visit.</p>
        </div>
        <p><a href="/cookies.html">Read the Cookie Policy</a></p>
        <div class="cookie-settings-actions">
          <button type="button" data-close-cookie-preferences>Cancel</button>
          <button type="button" data-cookie-choice="essential">Essential only</button>
          <button class="cookie-save-button" type="button" data-save-cookie-preferences>Save preferences</button>
        </div>
      </section>`;

    document.body.append(banner, launcher, overlay);
    const dialog = overlay.querySelector(".cookie-settings-dialog");
    const functionalToggle = document.querySelector(
      "#cookieFunctionalPreference",
    );
    const closeButton = overlay.querySelector("[data-close-cookie-preferences]");

    function openPreferences() {
      returnFocus = document.activeElement;
      functionalToggle.checked = preferences?.functional === true;
      overlay.hidden = false;
      dialog.focus();
    }

    function closePreferences() {
      overlay.hidden = true;
      if (returnFocus?.isConnected && !returnFocus.closest("[hidden]"))
        returnFocus.focus();
      else launcher.focus();
    }

    function saveChoice(functional) {
      const persisted = savePreferences(functional);
      banner.hidden = true;
      launcher.hidden = false;
      document.body.classList.remove("cookie-consent-open");
      closePreferences();
      window.SiteFeedback?.notify(
        persisted
          ? "Cookie and storage preferences saved."
          : "Preferences apply for this visit; browser storage is unavailable.",
        persisted ? "success" : "error",
      );
    }

    banner.addEventListener("click", (event) => {
      const button =
        event.target instanceof Element
          ? event.target.closest("button")
          : null;
      if (!button) return;
      if (button.hasAttribute("data-open-cookie-preferences"))
        openPreferences();
      else if (button.dataset.cookieChoice === "essential")
        saveChoice(false);
      else if (button.dataset.cookieChoice === "functional")
        saveChoice(true);
    });

    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) closePreferences();
      const button =
        event.target instanceof Element
          ? event.target.closest("button")
          : null;
      if (!button) return;
      if (button.hasAttribute("data-close-cookie-preferences"))
        closePreferences();
      else if (button.hasAttribute("data-save-cookie-preferences"))
        saveChoice(functionalToggle.checked);
      else if (button.dataset.cookieChoice === "essential")
        saveChoice(false);
    });

    launcher.addEventListener("click", openPreferences);
    document.addEventListener("click", (event) => {
      if (
        event.target instanceof Element &&
        event.target.closest("[data-open-cookie-preferences]") &&
        !banner.contains(event.target)
      )
        openPreferences();
    });
    document.addEventListener("keydown", (event) => {
      if (overlay.hidden) return;
      if (event.key === "Escape") {
        event.preventDefault();
        closePreferences();
      } else if (event.key === "Tab") {
        const controls = Array.from(
          dialog.querySelectorAll("button:not(:disabled), input:not(:disabled), a[href]"),
        );
        const firstControl = controls[0];
        const lastControl = controls[controls.length - 1];
        if (event.shiftKey && document.activeElement === firstControl) {
          event.preventDefault();
          lastControl.focus();
        } else if (!event.shiftKey && document.activeElement === lastControl) {
          event.preventDefault();
          firstControl.focus();
        }
      }
    });

    if (preferences) {
      banner.hidden = true;
      launcher.hidden = false;
    } else {
      document.body.classList.add("cookie-consent-open");
    }
  }

  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", initialize, { once: true });
  else initialize();
})();

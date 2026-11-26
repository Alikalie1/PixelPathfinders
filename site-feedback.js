(function () {
  const recentStatus = new WeakMap();
  let activeToast = null;
  let toastTimer;

  function showToast(message, type) {
    activeToast?.remove();
    window.clearTimeout(toastTimer);

    const toast = document.createElement("div");
    toast.className = `site-action-toast ${type}`;
    toast.dataset.siteFeedbackToast = "true";
    toast.setAttribute("role", type === "error" ? "alert" : "status");
    toast.setAttribute("aria-live", type === "error" ? "assertive" : "polite");
    toast.setAttribute("aria-atomic", "true");

    const icon = document.createElement("span");
    icon.className = "site-action-toast-icon";
    icon.setAttribute("aria-hidden", "true");
    icon.textContent = type === "error" ? "⚠️" : "😊";

    const text = document.createElement("span");
    text.className = "site-action-toast-message";
    text.textContent = message;

    const close = document.createElement("button");
    close.className = "site-action-toast-close";
    close.type = "button";
    close.setAttribute("aria-label", "Dismiss notification");
    close.textContent = "×";
    close.addEventListener("click", () => toast.remove());

    toast.append(icon, text, close);
    document.body.append(toast);
    activeToast = toast;
    toastTimer = window.setTimeout(() => {
      toast.remove();
      if (activeToast === toast) activeToast = null;
    }, type === "error" ? 8000 : 6000);
  }

  function processStatus(status) {
    if (status.closest("[data-site-feedback-toast]")) return;
    const message = status.textContent.trim();
    const type = status.matches(".ok, .success")
      ? "success"
      : status.matches(".err, .error")
        ? "error"
        : "";
    if (!message || !type) {
      recentStatus.delete(status);
      return;
    }

    const signature = `${type}:${message}`;
    if (recentStatus.get(status) === signature) return;
    recentStatus.set(status, signature);
    showToast(message, type);
  }

  function observeStatusMessages() {
    const observer = new MutationObserver((records) => {
      const statuses = new Set();
      records.forEach((record) => {
        const target =
          record.target instanceof Element
            ? record.target
            : record.target.parentElement;
        const status = target?.closest('[role="status"], [role="alert"]');
        if (status) statuses.add(status);
        record.addedNodes.forEach((node) => {
          if (!(node instanceof Element)) return;
          if (node.matches('[role="status"], [role="alert"]'))
            statuses.add(node);
          node.querySelectorAll('[role="status"], [role="alert"]').forEach(
            (child) => statuses.add(child),
          );
        });
      });
      statuses.forEach(processStatus);
    });

    observer.observe(document.body, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["class"],
    });
  }

  window.SiteFeedback = { notify: showToast };
  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", observeStatusMessages, {
      once: true,
    });
  else observeStatusMessages();
})();

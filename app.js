const ok = window.PP && !PP.url.startsWith("YOUR_") && window.supabase;
const db = ok ? supabase.createClient(PP.url, PP.key) : null;

const $ = (selector) => document.querySelector(selector);
const $$ = (selector, root = document) =>
  Array.from(root.querySelectorAll(selector));
const cmsValues = new Map();
const cmsBlocks = new Map();
let currentMember = null;
let currentMemberProfile = { full_name: "", phone: "", mode: "Virtual" };
const esc = (value) =>
  String(value ?? "").replace(
    /[&<>"]/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[character],
  );

const cmsPage = (
  location.pathname.split("/").filter(Boolean).pop() || "index.html"
).replace(/\.html$/, "");

function safeHref(value) {
  const href = String(value || "#").trim();
  return /^(https?:|mailto:|tel:|whatsapp:)/i.test(href) ||
    !/^[a-z][a-z\d+.-]*:/i.test(href)
    ? href
    : "#";
}

function safeRedirectUrl(value) {
  const href = String(value || "").trim();
  if (!href) return "";
  try {
    const url = new URL(href, location.href);
    return ["http:", "https:"].includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
}

function renderNavigation(locationName, items) {
  const headingSetting = {
    footer: "footer_explore_label",
    legal: "footer_legal_label",
  }[locationName];
  const container =
    document.querySelector(`[data-nav-location="${locationName}"]`) ||
    (headingSetting
      ? $$(".fg > div").find((element) =>
          element.querySelector(`[data-site-setting="${headingSetting}"]`),
        )
      : null);
  if (!container) return;

  const heading = container.querySelector("h4");
  if (heading) {
    Array.from(container.querySelectorAll("a")).forEach((link) =>
      link.remove(),
    );
  } else {
    container.replaceChildren();
  }
  const currentPage =
    location.pathname.split("/").filter(Boolean).pop() || "index.html";
  const navigationItems =
    locationName === "legal" &&
    !items.some((item) => item.href === "cookies.html")
      ? [...items, { label: "Cookie Policy", href: "cookies.html" }]
      : items;
  const links = navigationItems.map((item) => {
    const link = document.createElement("a");
    const href = safeHref(item.href);
    const [targetPage, targetHash] = href.split("#");
    const classes = [
      item.is_cta ? "btn sm" : "",
      targetPage === currentPage &&
      (!targetHash || location.hash === `#${targetHash}`)
        ? "on"
        : "",
    ]
      .filter(Boolean)
      .join(" ");
    link.href = href;
    link.textContent = item.label;
    if (classes) link.className = classes;
    return link;
  });
  let previous = heading;
  links.forEach((link) => {
    if (previous) previous.insertAdjacentElement("afterend", link);
    else container.append(link);
    previous = link;
  });
}

function renderContentBlock(section, block) {
  const image = block.image_url
    ? `<img src="${esc(block.image_url)}" alt="${esc(block.title)}" loading="lazy">`
    : "";
  const icon =
    block.extra && block.extra.icon
      ? `<i class="${esc(block.extra.icon)}" aria-hidden="true"></i>`
      : "";
  if (section === "home_pathway") {
    return `<li><h3>${esc(block.title)}</h3><p>${esc(block.body)}</p></li>`;
  }
  if (section === "home_partner_areas") {
    return `<span class="partner-logo">${esc(block.title)}</span>`;
  }
  if (section === "home_values") {
    return `<li>${esc(block.title)}</li>`;
  }
  if (section === "session_agenda") {
    const fileUrl = String(block.extra?.agenda_pdf_url || "").trim();
    const safeUrl = safeHref(fileUrl);
    if (!fileUrl || safeUrl === "#") return "";
    const [urlWithoutHash, hash = ""] = safeUrl.split("#", 2);
    const separator = urlWithoutHash.includes("?") ? "&" : "?";
    const downloadName = encodeURIComponent(`${block.title || "agenda"}.pdf`);
    const downloadUrl = `${urlWithoutHash}${separator}download=${downloadName}${hash ? `#${hash}` : ""}`;
    return `<a class="agenda-download" href="${esc(downloadUrl)}" download="${esc(`${block.title || "agenda"}.pdf`)}"><strong>${esc(block.title)}</strong>${block.body ? `<span>${esc(block.body)}</span>` : ""}<span class="agenda-download-label">Download PDF</span></a>`;
  }
  if (section === "session_short_courses") {
    return `<article class="card rv short-course-card"><h3>${esc(block.title)}</h3>${block.body ? `<p>${esc(block.body)}</p>` : ""}<a class="btn sm" href="join-session.html">Register</a></article>`;
  }
  if (section === "gallery_filters") {
    return `<button class="btn sm" type="button" data-c="${esc(block.title)}">${esc(block.title)}</button>`;
  }
  if (section === "about_values") {
    return `<article class="card rv">${image}${icon}<h3>${esc(block.title)}</h3><p>${esc(block.body)}</p></article>`;
  }
  return `<article class="card rv">${image}${icon}<h3>${esc(block.title)}</h3><p>${esc(block.body)}</p></article>`;
}

async function loadSiteContent() {
  if (!db) return;

  const [
    contentResult,
    settingsResult,
    navigationResult,
    pageResult,
    blocksResult,
  ] = await Promise.all([
    db
      .from("site_content")
      .select("content_key, value")
      .eq("page_slug", cmsPage)
      .eq("is_published", true),
    db.from("site_settings").select("setting_key, value").eq("is_public", true),
    db
      .from("site_navigation_items")
      .select("location, label, href, is_cta, sort_order")
      .eq("is_active", true)
      .order("sort_order"),
    db
      .from("site_pages")
      .select("is_published")
      .eq("slug", cmsPage)
      .maybeSingle(),
    db
      .from("content_blocks")
      .select("section_key, title, body, image_url, extra, sort_order")
      .eq("page_slug", cmsPage)
      .eq("is_published", true)
      .order("sort_order"),
  ]);

  if (contentResult.error)
    console.error("Could not load page content:", contentResult.error);
  else {
    const values = new Map(
      contentResult.data.map((item) => [item.content_key, item.value]),
    );
    cmsValues.clear();
    values.forEach((value, key) => cmsValues.set(key, value));
    $$("[data-cms-key]").forEach((element) => {
      const value = values.get(element.dataset.cmsKey);
      if (value !== undefined) element.textContent = value;
    });
    $$("[data-cms-href]").forEach((element) => {
      const value = values.get(element.dataset.cmsHref);
      if (value !== undefined) element.setAttribute("href", safeHref(value));
    });
    $$("[data-cms-placeholder]").forEach((element) => {
      const value = values.get(element.dataset.cmsPlaceholder);
      if (value !== undefined) element.setAttribute("placeholder", value);
    });
    const pageTitle = values.get("meta.title");
    if (pageTitle) document.title = pageTitle;
    const description = values.get("meta.description");
    if (description)
      document
        .querySelector('meta[name="description"]')
        ?.setAttribute("content", description);
    document.dispatchEvent(new Event("site-cms-loaded"));
  }

  if (settingsResult.error)
    console.error("Could not load site settings:", settingsResult.error);
  else {
    const settings = new Map(
      settingsResult.data.map((item) => [item.setting_key, item.value]),
    );
    const socialIcons = {
      facebook: "facebook_url",
      instagram: "instagram_url",
      x: "x_url",
      linkedin: "linkedin_url",
      youtube: "youtube_url",
      tiktok: "tiktok_url",
      whatsapp: "whatsapp_url",
      telegram: "telegram_url",
      github: "github_url",
      contact_email: "contact_email",
    };
    $$("[data-site-setting]").forEach((element) => {
      const value = settings.get(element.dataset.siteSetting);
      if (value === undefined) return;
      if (element.hasAttribute("data-site-href")) {
        const prefix = element.dataset.siteHref || "";
        element.setAttribute("href", prefix + safeHref(value));
      } else {
        element.textContent = value;
      }
    });
    $$("[data-site-image]").forEach((element) => {
      const value = String(
        settings.get(element.dataset.siteImage) || "",
      ).trim();
      const imageUrl = value ? safeHref(value) : "#";
      if (imageUrl === "#") {
        element.removeAttribute("src");
        element.hidden = true;
      } else {
        element.src = imageUrl;
        element.hidden = false;
      }
    });
    Object.entries(socialIcons).forEach(([name, settingKey]) => {
      const configuredValue = String(settings.get(settingKey) || "").trim();
      const placeholderValues = ["#", "hello@example.com"];
      const visible =
        settings.get(`show_social_${name}`) !== "false" &&
        configuredValue !== "" &&
        !placeholderValues.includes(configuredValue.toLowerCase());
      $$(`[data-site-setting="${settingKey}"]`).forEach((element) => {
        element.hidden = !visible;
      });
    });
    $$("[data-social-panel]").forEach((panel) => {
      panel.hidden = !Array.from(
        panel.querySelectorAll("[data-site-setting]"),
      ).some((element) => !element.hidden);
    });
  }

  if (navigationResult.error)
    console.error("Could not load site navigation:", navigationResult.error);
  else {
    for (const locationName of ["header", "footer", "legal"]) {
      renderNavigation(
        locationName,
        navigationResult.data.filter((item) => item.location === locationName),
      );
    }
  }

  if (pageResult.error)
    console.error("Could not load page status:", pageResult.error);
  else if (pageResult.data && !pageResult.data.is_published) {
    document.querySelector("main").textContent =
      "This page is temporarily unavailable.";
    return;
  }

  if (blocksResult.error) {
    console.error("Could not load page content blocks:", blocksResult.error);
    return;
  }
  const groups = new Map();
  $$("[data-cms-blocks]").forEach((container) => {
    container.replaceChildren();
  });
  const galleryFilters = document.querySelector(
    '[data-cms-blocks="gallery_filters"]',
  );
  if (galleryFilters)
    galleryFilters.innerHTML =
      '<button class="btn sm on" type="button" data-c="">All</button>';
  blocksResult.data.forEach((block) => {
    const group = groups.get(block.section_key) || [];
    group.push(block);
    groups.set(block.section_key, group);
  });
  cmsBlocks.clear();
  groups.forEach((blocks, section) => cmsBlocks.set(section, blocks));
  document.dispatchEvent(new Event("site-cms-loaded"));
  groups.forEach((blocks, section) => {
    const container = document.querySelector(`[data-cms-blocks="${section}"]`);
    if (!container || !blocks.length) return;
    const blockContent = blocks
      .map((block) => renderContentBlock(section, block))
      .join("");
    if (section === "gallery_filters")
      container.insertAdjacentHTML("beforeend", blockContent);
    else container.innerHTML = blockContent;
  });
  const agendaDownloads = document.querySelector(
    '[data-cms-blocks="session_agenda"]',
  );
  if (agendaDownloads && !agendaDownloads.querySelector(".agenda-download"))
    agendaDownloads.innerHTML =
      '<p class="mut">No downloadable agendas are available yet.</p>';
  const shortCourses = document.querySelector(
    '[data-cms-blocks="session_short_courses"]',
  );
  if (shortCourses && !shortCourses.querySelector(".short-course-card"))
    shortCourses.innerHTML =
      '<p class="mut">Short courses will be announced soon.</p>';
  watch();
}

const menuButton = $("#mb");
const navigation = $("#nv");
if (menuButton && navigation) {
  const closeMenu = () => {
    navigation.classList.remove("open");
    menuButton.setAttribute("aria-expanded", "false");
    menuButton.setAttribute("aria-label", "Open menu");
  };
  menuButton.onclick = () => {
    const isOpen = navigation.classList.toggle("open");
    menuButton.setAttribute("aria-expanded", String(isOpen));
    menuButton.setAttribute("aria-label", isOpen ? "Close menu" : "Open menu");
  };

  navigation.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", closeMenu);
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeMenu();
  });
}
const progressBar = $("#bar");
if (progressBar) {
  addEventListener("scroll", () => {
    const scrollableHeight = document.body.scrollHeight - innerHeight;
    progressBar.style.width =
      (scrollableHeight > 0 ? (scrollY / scrollableHeight) * 100 : 0) + "%";
  });
}
const io = new IntersectionObserver(
  (e) =>
    e.forEach((x) => {
      if (x.isIntersecting) {
        x.target.classList.add("in");
        io.unobserve(x.target);
      }
    }),
  { threshold: 0.15 },
);
const watch = () =>
  document.querySelectorAll(".rv:not(.in)").forEach((e) => io.observe(e));
watch();
document.querySelectorAll("[data-n]").forEach((el) => {
  const n = +el.dataset.n;
  let i = 0;
  const t = setInterval(() => {
    if (
      matchMedia("(prefers-reduced-motion:reduce)").matches ||
      document.documentElement.dataset.a11yMotion === "reduced"
    ) {
      el.textContent = String(n);
      clearInterval(t);
      return;
    }
    i += Math.max(1, n / 40);
    if (i >= n) {
      i = n;
      clearInterval(t);
    }
    el.textContent = Math.round(i);
  }, 35);
});
const cv = $("#cv");
if (
  cv &&
  !matchMedia("(prefers-reduced-motion:reduce)").matches &&
  document.documentElement.dataset.a11yMotion !== "reduced"
) {
  const x = cv.getContext("2d"),
    S = 30;
  let w,
    h,
    c,
    r,
    t = 0;
  const fit = () => {
    w = cv.width = cv.offsetWidth;
    h = cv.height = cv.offsetHeight;
    c = Math.ceil(w / S);
    r = Math.ceil(h / S);
  };
  fit();
  addEventListener("resize", fit);
  (function f() {
    if (document.documentElement.dataset.a11yMotion === "reduced") return;
    x.clearRect(0, 0, w, h);
    t += 0.012;
    const L = Math.min(c, r);
    for (let i = 0; i < c; i++)
      for (let j = 0; j < r; j++) {
        const a = 0.04 + 0.05 * Math.sin(t + i * 0.7 + j * 0.5);
        x.fillStyle = `rgba(120,170,255,${a})`;
        x.fillRect(i * S + 2, j * S + 2, S - 4, S - 4);
      }
    const n = 14,
      p = (t * 3) % (n + 6);
    for (let k = 0; k < n; k++) {
      const d = p - k;
      if (d < 0 || d > 6) continue;
      const px = Math.floor(c * 0.5) + k * 1 - 3,
        py = (r - 3 - k * Math.floor((r / n) * 0.9)) | 0;
      x.fillStyle =
        k > n - 5
          ? `rgba(75,224,143,${1 - d / 7})`
          : `rgba(106,167,255,${1 - d / 7})`;
      x.fillRect(px * S + 2, py * S + 2, S - 4, S - 4);
    }
    requestAnimationFrame(f);
  })();
}
const card = (img, t, p, tag, href) => {
  const projectUrl = safeRedirectUrl(href);
  return `<div class="card rv">${img ? `<img src="${esc(img)}" alt="${esc(t)}" loading="lazy">` : ""}${tag ? `<span class="tag">${esc(tag)}</span>` : ""}<h3>${esc(t)}</h3><p>${esc(p)}</p>${projectUrl ? `<a class="btn sm" href="${esc(projectUrl)}" target="_blank" rel="noopener noreferrer">View project</a>` : ""}</div>`;
};
async function list(tb, id, fn, ord = "created_at") {
  const el = $("#" + id);
  if (!db) {
    el.innerHTML =
      '<p class="mut">Connect Supabase (js/config.js) to show content here.</p>';
    return;
  }
  const { data, error } = await db
    .from(tb)
    .select("*")
    .eq("is_published", true)
    .order(ord, { ascending: true });
  if (error) {
    console.error(`Could not load ${tb}:`, error);
    el.innerHTML =
      '<p class="mut">Unable to load this content right now. Please try again later.</p>';
    return;
  }
  el.innerHTML = data.length
    ? data.map(fn).join("")
    : '<p class="mut">Nothing here yet. Check back soon.</p>';
  watch();
}
const team = async () => {
  const el = $("#tm");
  const render = (members) =>
    members
      .map(
        (member) =>
          `<div class="card rv">${member.photo_url ? `<img class="av" src="${esc(member.photo_url)}" alt="${esc(member.name)}" loading="lazy">` : `<div class="av">${esc(member.name[0])}</div>`}<h3>${esc(member.name)}</h3><span class="tag">${esc(member.role)}</span><p>${esc(member.bio || "")}</p></div>`,
      )
      .join("");

  if (!db) {
    el.innerHTML =
      '<p class="mut">Connect Supabase to show the team directory.</p>';
    return;
  }

  const { data, error } = await db
    .from("team_members")
    .select("name, role, bio, photo_url")
    .eq("is_published", true)
    .order("sort_order", { ascending: true });
  if (error) {
    console.error("Could not load team members:", error);
    el.innerHTML =
      '<p class="mut">The team directory is unavailable right now.</p>';
  } else {
    el.innerHTML = data.length
      ? render(data)
      : '<p class="mut">The team directory will be updated soon.</p>';
  }
  watch();
};
async function upcoming(id, n) {
  const el = $("#" + id);
  if (!db) {
    el.innerHTML =
      '<p class="mut">Sessions will appear here once Supabase is connected.</p>';
    return;
  }
  const { data, error } = await db
    .from("sessions")
    .select("*")
    .gte("session_date", new Date().toISOString())
    .eq("is_published", true)
    .order("session_date")
    .limit(n);
  if (error) {
    console.error("Could not load upcoming sessions:", error);
    el.innerHTML =
      '<p class="mut">Unable to load upcoming sessions. Please try again later.</p>';
    return;
  }
  el.innerHTML =
    data && data.length
      ? data
          .map(
            (s) =>
              `<div class="card rv">${s.image_url ? `<img src="${esc(s.image_url)}" alt="${esc(s.title)}" loading="lazy">` : ""}<span class="tag">${esc(s.platform || "Online")}</span><h3>${esc(s.title)}</h3><p>${new Date(s.session_date).toLocaleString([], { dateStyle: "full", timeStyle: "short" })}</p><p class="session-countdown" data-countdown-date="${esc(s.session_date)}"></p><p>${esc(s.topic)}</p><a class="btn sm" href="join-session.html?session=${encodeURIComponent(s.id)}">Register</a></div>`,
          )
          .join("")
      : '<p class="mut">New sessions will be announced soon.</p>';
  startCountdowns(el);
  watch();
}
async function upcomingEvents(id, n) {
  const el = $("#" + id);
  if (!db) {
    el.innerHTML =
      '<p class="mut">Events will appear here once Supabase is connected.</p>';
    return;
  }
  const { data, error } = await db
    .from("events")
    .select("id, title, description, event_date, venue, event_url, image_url")
    .gte("event_date", new Date().toISOString())
    .eq("is_published", true)
    .order("event_date", { ascending: true })
    .limit(n);
  if (error) {
    console.error("Could not load upcoming events:", error);
    el.innerHTML =
      '<p class="mut">Unable to load upcoming events. Please try again later.</p>';
    return;
  }
  el.innerHTML =
    data && data.length
      ? data
          .map((event) => {
            const eventUrl = safeHref(event.event_url);
            const eventLink =
              event.event_url && eventUrl !== "#"
                ? `<a class="btn sm" href="${esc(eventUrl)}" target="_blank" rel="noopener noreferrer">Event details</a>`
                : "";
            return `<article class="card rv event-card">${event.image_url ? `<img src="${esc(event.image_url)}" alt="${esc(event.title)} event flyer" loading="lazy">` : ""}<span class="tag">Event</span><h3>${esc(event.title)}</h3><p>${esc(new Date(event.event_date).toLocaleString([], { dateStyle: "full", timeStyle: "short" }))}</p><p class="session-countdown" data-countdown-date="${esc(event.event_date)}" data-countdown-label="Event"></p>${event.venue ? `<p class="event-location"><strong>Venue / location:</strong> ${esc(event.venue)}</p>` : ""}${event.description ? `<p>${esc(event.description)}</p>` : ""}${eventLink}</article>`;
          })
          .join("")
      : '<p class="mut">New events will be announced soon.</p>';
  startCountdowns(el);
  watch();
}
let countdownTimer;
function formatCountdown(date, now = Date.now(), itemLabel = "Session") {
  const startsAt = new Date(date).getTime();
  if (!Number.isFinite(startsAt)) return `${itemLabel} time unavailable`;

  const remaining = startsAt - now;
  if (remaining <= 0)
    return remaining > -60_000 ? "Starting now" : `${itemLabel} started`;

  const totalMinutes = Math.ceil(remaining / 60_000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  const parts = [];
  if (days) parts.push(`${days} day${days === 1 ? "" : "s"}`);
  if (hours) parts.push(`${hours} hour${hours === 1 ? "" : "s"}`);
  if (minutes) parts.push(`${minutes} minute${minutes === 1 ? "" : "s"}`);
  return `Starts in ${parts.join(", ")}`;
}
function updateCountdowns(root = document) {
  root.querySelectorAll("[data-countdown-date]").forEach((countdown) => {
    countdown.textContent = formatCountdown(
      countdown.dataset.countdownDate,
      Date.now(),
      countdown.dataset.countdownLabel || "Session",
    );
  });
}
function startCountdowns(root) {
  updateCountdowns(root);
  if (!countdownTimer && document.querySelector("[data-countdown-date]"))
    countdownTimer = window.setInterval(updateCountdowns, 30_000);
}
function gallery() {
  const go = async (c) => {
    const el = $("#gl");
    if (!db) {
      el.innerHTML = '<p class="mut">Connect Supabase to show the gallery.</p>';
      return;
    }
    let q = db
      .from("gallery_items")
      .select("*")
      .eq("is_published", true)
      .order("created_at", { ascending: false });
    if (c) q = q.eq("category", c);
    const { data, error } = await q;
    if (error) {
      console.error("Could not load gallery items:", error);
      el.innerHTML = '<p class="mut">The gallery is unavailable right now.</p>';
      return;
    }
    el.innerHTML =
      data && data.length
        ? data
            .map((g) => card(g.image_url, g.title, g.caption, g.category))
            .join("")
        : '<p class="mut">No photos yet.</p>';
    watch();
  };
  go("");
  const filters = $("#ft");
  if (filters)
    filters.addEventListener("click", (event) => {
      const button = event.target.closest("button[data-c]");
      if (!button) return;
      filters
        .querySelectorAll("button")
        .forEach((item) => item.classList.remove("on"));
      button.classList.add("on");
      go(button.dataset.c);
    });
}
function form(id, tb) {
  $("#" + id).onsubmit = async (e) => {
    e.preventDefault();
    const m = $("#ms");
    if (!db) {
      m.textContent = "Connect Supabase first (js/config.js).";
      return;
    }
    const { error } = await db
      .from(tb)
      .insert(Object.fromEntries(new FormData(e.target)));
    m.textContent = error
      ? "Sorry, something went wrong. Please try again."
      : "Thank you! Your message was sent.";
    if (!error) e.target.reset();
  };
}
function auth() {
  const message = $("#ms");
  const authPanel = $("#memberAuthPanel");
  const memberDashboard = $("#memberDashboard");
  const setMessage = (text, type = "") => {
    message.textContent = text;
    message.className = `member-status status ${type}`.trim();
  };
  const switchForm = (showRegister) => {
    $("#rf").hidden = !showRegister;
    $("#lf").hidden = showRegister;
    $("#t1").classList.toggle("active", showRegister);
    $("#t2").classList.toggle("active", !showRegister);
    $("#t1").setAttribute("aria-selected", String(showRegister));
    $("#t2").setAttribute("aria-selected", String(!showRegister));
    $("#t1").tabIndex = showRegister ? 0 : -1;
    $("#t2").tabIndex = showRegister ? -1 : 0;
    $("#memberAuthTitle").textContent = showRegister
      ? "Join the Pixel Pathfinders community"
      : "Welcome back";
    $("#memberAuthDescription").textContent = showRegister
      ? "Create a free account to keep your profile and track your session registrations and applications."
      : "Log in to update your profile and see your recent registrations and applications.";
    setMessage("");
  };
  const showSignedIn = (user) => {
    currentMember = user;
    window.location.assign("member-dashboard.html");
  };

  if (memberDashboard && !authPanel) {
    const gateStatus = $("#memberGateStatus");
    const setGateStatus = (text, type = "") => {
      gateStatus.textContent = text;
      gateStatus.className = `member-gate-status ${type}`.trim();
      gateStatus.hidden = false;
    };

    if (!db) {
      setGateStatus(
        "Member dashboard is unavailable until Supabase is configured.",
        "err",
      );
      return;
    }

    const dashboard = $("#memberDashboard");
    const sidebarToggle = $("#memberSidebarToggle");
    const backdrop = $("#memberSidebarBackdrop");
    const setMemberView = (viewName) => {
      $$("[data-member-panel]").forEach((panel) => {
        panel.hidden = panel.dataset.memberPanel !== viewName;
      });
      $$("[data-member-view]").forEach((button) => {
        const selected = button.dataset.memberView === viewName;
        button.classList.toggle("active", selected);
        if (selected) button.setAttribute("aria-current", "page");
        else button.removeAttribute("aria-current");
      });
      dashboard.classList.remove("sidebar-open");
      backdrop.hidden = true;
      sidebarToggle.setAttribute("aria-expanded", "false");
    };
    $$("[data-member-view]").forEach((button) => {
      button.addEventListener("click", () =>
        setMemberView(button.dataset.memberView),
      );
    });
    $$("[data-open-member-view]").forEach((button) => {
      button.addEventListener("click", () =>
        setMemberView(button.dataset.openMemberView),
      );
    });
    const closeSidebar = () => {
      dashboard.classList.remove("sidebar-open");
      backdrop.hidden = true;
      sidebarToggle.setAttribute("aria-expanded", "false");
    };
    sidebarToggle.addEventListener("click", () => {
      const isOpen = dashboard.classList.toggle("sidebar-open");
      backdrop.hidden = !isOpen;
      sidebarToggle.setAttribute("aria-expanded", String(isOpen));
    });
    backdrop.addEventListener("click", closeSidebar);
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closeSidebar();
    });

    const tourScrim = $("#memberTourScrim");
    const tourCard = $("#memberTourCard");
    const tourStepLabel = $("#memberTourStep");
    const tourTitle = $("#memberTourTitle");
    const tourDescription = $("#memberTourDescription");
    const tourBack = $("#memberTourBack");
    const tourSkip = $("#memberTourSkip");
    const tourNext = $("#memberTourNext");
    const tourStorageKey = () =>
      `pixelpathfinders:member-dashboard-tour:v1:${currentMember.id}`;
    const isMobileDashboard = window.matchMedia("(max-width: 800px)").matches;
    const tourSteps = [
      {
        target: "#memberTourStart",
        view: "overview",
        title: "Dashboard tour",
        description:
          "You can reopen this walkthrough any time with this button. Use Next and Back to move through it, or Skip tour to close it.",
      },
      {
        target: '[data-member-view="overview"]',
        view: "overview",
        sidebar: true,
        title: "Overview",
        description:
          "Return here for your member number, registration and application counts, profile summary, and upcoming sessions.",
      },
      ...(isMobileDashboard
        ? [
            {
              target: "#memberSidebarToggle",
              view: "overview",
              title: "Menu",
              description:
                "Open or close the dashboard navigation. You can also close it by tapping outside the menu or pressing Escape.",
            },
          ]
        : []),
      {
        target: ".member-sidebar-brand",
        view: "overview",
        sidebar: true,
        title: "Pixel Pathfinders logo",
        description:
          "Select the logo or organization name to return to the public website home page.",
      },
      {
        target: '[data-open-member-view="profile"]',
        view: "overview",
        title: "Edit profile",
        description:
          "This shortcut opens My profile so you can update your name, phone number, and preferred session format.",
      },
      {
        target: '[data-open-member-view="sessions"]',
        view: "overview",
        title: "Browse sessions",
        description:
          "Use this shortcut to see all available sessions and register with the contact and learning preferences shown there.",
      },
      {
        target: '[data-member-view="sessions"]',
        view: "sessions",
        sidebar: true,
        title: "Available sessions",
        description:
          "This section lists upcoming sessions. Enter your contact phone, choose how you will join and your level, then accept the consent checkbox before registering.",
      },
      {
        target: '[data-member-view="events"]',
        view: "events",
        sidebar: true,
        title: "Upcoming events",
        description:
          "See event announcements from the team. Open an event and choose RSVP to reserve a place; your sign-up will appear under My activity.",
      },
      {
        target: "#memberAvailableEvents [data-register-event]",
        view: "events",
        title: "RSVP to an event",
        description:
          "Use RSVP on an event card to register with your member account. The button changes after a successful sign-up, and event flyers, dates, locations, and links appear on each card.",
      },
      {
        target: "#memberAvailableSessions",
        view: "sessions",
        title: "Register for a session",
        description:
          "Choose Register for session on a session card to send your registration. The button changes to Already registered after a successful registration. If no sessions are listed, check back later.",
      },
      {
        target: '[data-member-view="volunteer"]',
        view: "volunteer",
        sidebar: true,
        title: "Volunteer",
        description:
          "Open this section to apply to volunteer. Complete the required course and contact details, choose at least one area where you can help, and give consent.",
      },
      {
        target: "#memberVolunteerSubmit",
        view: "volunteer",
        title: "Send volunteer application",
        description:
          "This submits your completed volunteer application. You can check whether it was received under My activity.",
      },
      {
        target: '[data-member-view="activity"]',
        view: "activity",
        sidebar: true,
        title: "My activity",
        description:
          "Review your recent session registrations and volunteer or partner applications here. This section is for checking activity, not editing submissions.",
      },
      {
        target: '[data-member-view="profile"]',
        view: "profile",
        sidebar: true,
        title: "My profile",
        description:
          "Open your account details. Your email is read-only; you can update your name, phone number, and preferred session format.",
      },
      {
        target: "#memberProfileSubmit",
        view: "profile",
        title: "Save my profile",
        description:
          "Save changes to your member profile. The dashboard will show a confirmation or an error after the save attempt.",
      },
      {
        target: "#lo",
        view: "overview",
        sidebar: true,
        title: "Log out",
        description:
          "End your member session and return to the login page. Use this on a shared device to protect your account.",
      },
    ];
    let activeTourTarget = null;
    let tourIndex = 0;
    let tourReturnFocus = null;

    const clearTourTarget = () => {
      if (activeTourTarget) {
        activeTourTarget.classList.remove("member-tour-highlight");
        activeTourTarget = null;
      }
      dashboard.classList.remove("member-tour-sidebar-target");
    };
    const closeDashboardTour = (markSeen) => {
      clearTourTarget();
      tourScrim.hidden = true;
      tourCard.hidden = true;
      closeSidebar();
      if (
        markSeen &&
        window.SiteCookieConsent?.allowsFunctionalPreferences()
      ) {
        try {
          window.localStorage.setItem(tourStorageKey(), "1");
        } catch (error) {
          console.error("Could not save dashboard tour preference:", error);
        }
      }
      if (tourReturnFocus?.isConnected) tourReturnFocus.focus();
    };
    const showTourStep = (index) => {
      tourIndex = index;
      const step = tourSteps[tourIndex];
      setMemberView(step.view);
      if (step.sidebar && isMobileDashboard) {
        dashboard.classList.add("sidebar-open", "member-tour-sidebar-target");
        backdrop.hidden = false;
        sidebarToggle.setAttribute("aria-expanded", "true");
      } else {
        closeSidebar();
      }
      clearTourTarget();
      if (step.sidebar && isMobileDashboard)
        dashboard.classList.add("member-tour-sidebar-target");

      const target =
        step.target === "#memberAvailableSessions"
          ? $("#memberAvailableSessions [data-register-session]") ||
            $("#memberAvailableSessions")
          : step.target === "#memberAvailableEvents [data-register-event]"
            ? $("#memberAvailableEvents [data-register-event]") ||
              $("#memberAvailableEvents")
          : document.querySelector(step.target);
      if (!target) {
        console.error(`Dashboard tour target not found: ${step.target}`);
        closeDashboardTour(false);
        return;
      }
      activeTourTarget = target;
      target.classList.add("member-tour-highlight");
      target.scrollIntoView({ block: "center", inline: "nearest" });
      tourStepLabel.textContent = `Step ${tourIndex + 1} of ${tourSteps.length}`;
      tourTitle.textContent = step.title;
      tourDescription.textContent = step.description;
      tourBack.disabled = tourIndex === 0;
      tourBack.hidden = tourIndex === 0;
      tourNext.textContent =
        tourIndex === tourSteps.length - 1 ? "Finish tour" : "Next";
      tourScrim.hidden = false;
      tourCard.hidden = false;
      tourNext.focus();
    };
    const startDashboardTour = () => {
      tourReturnFocus = document.activeElement;
      showTourStep(0);
    };

    $("#memberTourStart").addEventListener("click", startDashboardTour);
    tourBack.addEventListener("click", () => {
      if (tourIndex > 0) showTourStep(tourIndex - 1);
    });
    tourSkip.addEventListener("click", () => closeDashboardTour(true));
    tourNext.addEventListener("click", () => {
      if (tourIndex === tourSteps.length - 1) {
        closeDashboardTour(true);
      } else {
        showTourStep(tourIndex + 1);
      }
    });
    tourCard.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeDashboardTour(true);
      } else if (event.key === "ArrowRight" && !tourNext.disabled) {
        event.preventDefault();
        tourNext.click();
      } else if (event.key === "ArrowLeft" && !tourBack.disabled) {
        event.preventDefault();
        tourBack.click();
      } else if (event.key === "Tab") {
        const controls = $$("button:not([hidden]):not(:disabled)", tourCard);
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

    $("#memberProfileForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const button = $('button[type="submit"]', form);
      const originalLabel = button.textContent;
      const fields = Object.fromEntries(new FormData(form));
      const profileStatus = $("#memberProfileStatus");
      button.disabled = true;
      button.textContent = "Saving…";
      profileStatus.textContent = "";
      try {
        const { data, error } = await db
          .from("profiles")
          .update({
            full_name: String(fields.full_name || "").trim(),
            phone: String(fields.phone || "").trim() || null,
            mode: fields.mode,
          })
          .eq("id", currentMember.id)
          .select("full_name, phone, mode")
          .maybeSingle();
        if (error) throw error;
        if (!data) throw new Error("Member profile was not found.");
        renderMemberProfile(currentMember, data);
        profileStatus.textContent = "Your profile has been saved.";
        profileStatus.className = "member-activity-status ok";
      } catch (error) {
        console.error("Could not save member profile:", error);
        profileStatus.textContent =
          "Could not save your profile. Please try again.";
        profileStatus.className = "member-activity-status err";
      } finally {
        button.disabled = false;
        button.textContent = originalLabel;
      }
    });

    $("#memberAvailableSessions").addEventListener("click", async (event) => {
      const button = event.target.closest("[data-register-session]");
      if (!button) return;
      const form = $("#memberSessionForm");
      if (!form.reportValidity()) return;

      const sessionStatus = $("#memberSessionStatus");
      const originalLabel = button.textContent;
      button.disabled = true;
      button.textContent = "Registering…";
      sessionStatus.textContent = "";
      try {
        const { error } = await db.from("participants").insert({
          user_id: currentMember.id,
          full_name: currentMemberProfile.full_name,
          phone: form.elements.phone.value.trim(),
          email: currentMember.email,
          age_group: null,
          session_id: button.dataset.registerSession,
          mode: form.elements.mode.value,
          level: form.elements.level.value,
          goals: null,
          consent: true,
        });
        if (error) throw error;
        sessionStatus.textContent = "Your session registration was received.";
        sessionStatus.className = "member-activity-status ok";
        const redirectUrl = safeRedirectUrl(
          button.dataset.registrationRedirect,
        );
        if (redirectUrl) {
          location.assign(redirectUrl);
          return;
        }
        await loadMemberDashboard(currentMember);
      } catch (error) {
        console.error("Could not register member for session:", error);
        sessionStatus.textContent =
          error.message || "Could not register for this session. Please try again.";
        sessionStatus.className = "member-activity-status err";
      } finally {
        if (button.isConnected) {
          button.disabled = false;
          button.textContent = originalLabel;
        }
      }
    });

    $("#memberAvailableEvents").addEventListener("click", async (event) => {
      const button = event.target.closest("[data-register-event]");
      if (!button) return;

      const status = $("#memberEventStatus");
      const eventTitle = button.dataset.eventTitle;
      const originalLabel = button.textContent;
      button.disabled = true;
      button.textContent = "Sending RSVP…";
      status.textContent = "";
      try {
        const { error } = await db.from("event_registrations").insert({
          event_id: button.dataset.registerEvent,
          event_title: eventTitle,
          user_id: currentMember.id,
          full_name: currentMemberProfile.full_name || currentMember.email,
          email: currentMember.email,
        });
        if (error && error.code !== "23505") throw error;
        await loadMemberDashboard(currentMember);
        status.textContent =
          error?.code === "23505"
            ? `You are already registered for ${eventTitle}.`
            : `Your RSVP for ${eventTitle} was received.`;
        status.className = "member-activity-status ok";
      } catch (error) {
        console.error("Could not register member for event:", error);
        status.textContent =
          error.message || "Could not RSVP for this event. Please try again.";
        status.className = "member-activity-status err";
      } finally {
        if (button.isConnected) {
          button.disabled = false;
          button.textContent = originalLabel;
        }
      }
    });

    $("#memberVolunteerForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      if (!form.reportValidity()) return;
      const values = new FormData(form);
      const areas = values.getAll("areas");
      const status = $("#memberVolunteerStatus");
      if (!areas.length) {
        status.textContent = "Select at least one area where you can help.";
        status.className = "member-activity-status err";
        return;
      }

      const button = $('button[type="submit"]', form);
      const originalLabel = button.textContent;
      button.disabled = true;
      button.textContent = "Sending application…";
      status.textContent = "";
      try {
        const { error } = await db.from("volunteers").insert({
          user_id: currentMember.id,
          role: "volunteer",
          full_name: String(values.get("full_name") || "").trim(),
          organisation: null,
          phone: String(values.get("phone") || "").trim(),
          email: String(values.get("email") || "").trim(),
          course_completed: String(values.get("course_completed") || "").trim(),
          certificate_no:
            String(values.get("certificate_no") || "").trim() || null,
          mode: values.get("mode"),
          areas,
          availability: String(values.get("availability") || "").trim() || null,
          message: String(values.get("message") || "").trim() || null,
          consent: values.get("consent") === "on",
        });
        if (error) throw error;
        form.reset();
        renderMemberProfile(currentMember, currentMemberProfile);
        status.textContent = "Your volunteer application was received.";
        status.className = "member-activity-status ok";
        await loadMemberDashboard(currentMember);
      } catch (error) {
        console.error("Could not submit member volunteer application:", error);
        status.textContent =
          error.message || "Could not send your application. Please try again.";
        status.className = "member-activity-status err";
      } finally {
        button.disabled = false;
        button.textContent = originalLabel;
      }
    });

    $("#lo").addEventListener("click", async (event) => {
      const button = event.currentTarget;
      button.disabled = true;
      try {
        const { error } = await db.auth.signOut();
        if (error) throw error;
        window.location.replace("join.html?login=1");
      } catch (error) {
        console.error("Could not sign out member:", error);
        setGateStatus("Could not sign out. Please try again.", "err");
        button.disabled = false;
      }
    });

    db.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") window.location.replace("join.html?login=1");
    });
    db.auth
      .getSession()
      .then(async ({ data, error }) => {
        if (error) throw error;
        const user = data.session?.user;
        if (!user) {
          window.location.replace("join.html?login=1");
          return;
        }
        currentMember = user;
        $("#memberWelcome").textContent =
          user.user_metadata?.full_name || user.email?.split("@")[0] || "Member";
        $("#memberEmail").textContent = user.email || "";
        await loadMemberDashboard(user);
        $("#memberDashboard").hidden = false;
        $("#memberGate").hidden = true;
        let hasSeenTour = false;
        if (window.SiteCookieConsent?.allowsFunctionalPreferences()) {
          try {
            hasSeenTour =
              window.localStorage.getItem(tourStorageKey()) === "1";
          } catch (error) {
            console.error("Could not read dashboard tour preference:", error);
          }
        }
        if (!hasSeenTour) startDashboardTour();
      })
      .catch((error) => {
        console.error("Could not verify member session:", error);
        setGateStatus(
          "We could not load your dashboard. Please return to login and try again.",
          "err",
        );
      });
    return;
  }

  $("#t1").addEventListener("click", () => switchForm(true));
  $("#t2").addEventListener("click", () => switchForm(false));
  $$(".member-password-toggle").forEach((toggle) => {
    toggle.addEventListener("click", () => {
      const password = toggle
        .closest(".member-password-control")
        .querySelector("input");
      const showPassword = password.type === "password";
      password.type = showPassword ? "text" : "password";
      toggle.setAttribute(
        "aria-label",
        showPassword ? "Hide password" : "Show password",
      );
      toggle.setAttribute("aria-pressed", String(showPassword));
      const icon = $("i", toggle);
      icon.classList.toggle("fa-eye", !showPassword);
      icon.classList.toggle("fa-eye-slash", showPassword);
    });
  });

  $("#rf").addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!db)
      return setMessage(
        "Account registration is unavailable right now.",
        "err",
      );
    const form = event.currentTarget;
    const button = $('button[type="submit"]', form);
    const originalLabel = button.textContent;
    const fields = Object.fromEntries(new FormData(form));
    button.disabled = true;
    button.textContent = "Creating account…";
    setMessage("Creating your account…");
    try {
      const { data, error } = await db.auth.signUp({
        email: fields.email,
        password: fields.pw,
        options: {
          data: {
            full_name: fields.name,
            phone: fields.phone,
            mode: fields.mode,
          },
        },
      });
      if (error) throw error;
      if (data.session?.user) {
        await showSignedIn(data.session.user);
      } else {
        form.reset();
        switchForm(false);
        setMessage(
          "Account created. Check your email for the confirmation link, then log in here.",
          "ok",
        );
      }
    } catch (error) {
      console.error("Could not create member account:", error);
      setMessage(
        error instanceof Error
          ? error.message
          : "Could not create your account. Please try again.",
        "err",
      );
    } finally {
      button.disabled = false;
      button.textContent = originalLabel;
    }
  });

  $("#lf").addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!db) return setMessage("Sign in is unavailable right now.", "err");
    const form = event.currentTarget;
    const button = $('button[type="submit"]', form);
    const originalLabel = button.textContent;
    const fields = Object.fromEntries(new FormData(form));
    button.disabled = true;
    button.textContent = "Signing in…";
    setMessage("Signing in…");
    try {
      const { data, error } = await db.auth.signInWithPassword({
        email: fields.email,
        password: fields.pw,
      });
      if (error) throw error;
      await showSignedIn(data.user);
    } catch (error) {
      console.error("Could not sign in member:", error);
      setMessage(
        error instanceof Error
          ? error.message
          : "Could not sign in. Check your details and try again.",
        "err",
      );
    } finally {
      button.disabled = false;
      button.textContent = originalLabel;
    }
  });

  switchForm(new URLSearchParams(location.search).get("login") !== "1");
  if (!db) {
    setMessage("Connect Supabase to create or access a member account.", "err");
    return;
  }
  db.auth
    .getSession()
    .then(({ data, error }) => {
      if (error) throw error;
      if (data.session?.user) showSignedIn(data.session.user);
    })
    .catch((error) => {
      console.error("Could not restore member session:", error);
      setMessage("Could not restore your sign-in. Please log in again.", "err");
    });
}

function renderMemberProfile(user, profile) {
  const hasSavedProfile = profile !== null && profile !== undefined;
  currentMemberProfile = {
    full_name:
      (hasSavedProfile ? profile.full_name : user.user_metadata?.full_name) ||
      user.email ||
      "",
    phone: hasSavedProfile
      ? profile.phone || ""
      : user.user_metadata?.phone || "",
    mode: hasSavedProfile
      ? profile.mode || "Virtual"
      : user.user_metadata?.mode || "Virtual",
  };
  const { full_name, phone, mode } = currentMemberProfile;
  const email = user.email || "";

  $("#memberWelcome").textContent = full_name || "Member";
  $("#memberEmail").textContent = email;
  $("#memberSidebarName").textContent = full_name || "Member";
  $("#memberSidebarEmail").textContent = email;
  $("#memberOverviewName").textContent = full_name || "Not provided";
  $("#memberOverviewEmail").textContent = email || "Not available";
  $("#memberOverviewPhone").textContent = phone || "Add a contact number";

  const profileForm = $("#memberProfileForm");
  profileForm.elements.full_name.value = full_name;
  profileForm.elements.phone.value = phone;
  profileForm.elements.mode.value = mode;
  $("#memberProfileEmail").value = email;

  const sessionPhone = $("#memberSessionPhone");
  sessionPhone.value = phone;
  $("#memberSessionForm").elements.mode.value =
    mode === "Physical" ? "In person" : "Virtual";
  const volunteerForm = $("#memberVolunteerForm");
  volunteerForm.elements.full_name.value = full_name;
  volunteerForm.elements.email.value = email;
  volunteerForm.elements.phone.value = phone;
  volunteerForm.elements.mode.value = mode;
}

function renderMemberSessions(sessions, registrations) {
  const registeredIds = new Set(
    registrations
      .map((registration) => registration.session_id)
      .filter((sessionId) => sessionId && sessionId !== "any"),
  );
  const renderCards = (items) =>
    items.length
      ? items
          .map((session) => {
            const registered = registeredIds.has(session.id);
            return `<article class="member-session-card">
              <span class="tag">${esc(session.platform || "Online")}</span>
              <h3>${esc(session.title)}</h3>
              <p class="member-session-date">${esc(new Date(session.session_date).toLocaleString([], { dateStyle: "full", timeStyle: "short" }))}</p>
              <p class="session-countdown" data-countdown-date="${esc(session.session_date)}"></p>
              ${session.topic ? `<p>${esc(session.topic)}</p>` : ""}
              <button class="btn sm" type="button" data-register-session="${esc(session.id)}" data-registration-redirect="${esc(safeRedirectUrl(session.registration_redirect_url))}" ${registered ? "disabled" : ""}>
                ${registered ? "Already registered" : "Register for session"}
              </button>
            </article>`;
          })
          .join("")
      : '<p class="member-empty">No upcoming sessions are available right now.</p>';

  $("#memberAvailableSessions").innerHTML = renderCards(sessions);
  $("#memberUpcomingSessions").innerHTML = renderCards(sessions.slice(0, 3));
  startCountdowns($("#memberAvailableSessions"));
  startCountdowns($("#memberUpcomingSessions"));
}

function renderMemberEvents(events, registrations, registrationAvailable) {
  const registeredIds = new Set(
    registrations.map((registration) => registration.event_id),
  );
  const unregisteredEvents = events.filter(
    (event) => !registeredIds.has(event.id),
  );
  const badge = $("#memberEventBadge");
  badge.textContent = String(unregisteredEvents.length);
  badge.hidden = unregisteredEvents.length === 0;

  const notification = $("#memberEventNotification");
  notification.hidden = unregisteredEvents.length === 0;
  if (unregisteredEvents.length) {
    const firstEvent = unregisteredEvents[0];
    $("#memberEventNotificationTitle").textContent =
      unregisteredEvents.length === 1
        ? "A new event is open for RSVP"
        : `${unregisteredEvents.length} events are open for RSVP`;
    $("#memberEventNotificationText").textContent =
      `${firstEvent.title} · ${new Date(firstEvent.event_date).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}`;
  }

  $("#memberAvailableEvents").innerHTML = events.length
    ? events
        .map((event) => {
          const registered = registeredIds.has(event.id);
          const eventUrl = safeHref(event.event_url);
          const eventLink =
            event.event_url && eventUrl !== "#"
              ? `<a class="btn sm ghost" href="${esc(eventUrl)}" target="_blank" rel="noopener noreferrer">Event details</a>`
              : "";
          const actionLabel = registered
            ? "RSVP received"
            : registrationAvailable
              ? "RSVP to this event"
              : "RSVP unavailable";
          return `<article class="member-session-card member-event-card">
            ${event.image_url ? `<img class="member-event-image" src="${esc(event.image_url)}" alt="${esc(event.title)} event flyer" loading="lazy">` : ""}
            <span class="tag">Event</span>
            <h3>${esc(event.title)}</h3>
            <p class="member-session-date">${esc(new Date(event.event_date).toLocaleString([], { dateStyle: "full", timeStyle: "short" }))}</p>
            <p class="session-countdown" data-countdown-date="${esc(event.event_date)}" data-countdown-label="Event"></p>
            ${event.venue ? `<p><strong>Venue / location:</strong> ${esc(event.venue)}</p>` : ""}
            ${event.description ? `<p>${esc(event.description)}</p>` : ""}
            <div class="member-event-actions">
              <button class="btn sm" type="button" data-register-event="${esc(event.id)}" data-event-title="${esc(event.title)}" ${registered || !registrationAvailable ? "disabled" : ""}>${actionLabel}</button>
              ${eventLink}
            </div>
          </article>`;
        })
        .join("")
    : '<p class="member-empty">No upcoming events are available right now.</p>';
  startCountdowns($("#memberAvailableEvents"));
}

async function loadMemberDashboard(user) {
  const [
    profileResult,
    registrationsResult,
    applicationsResult,
    sessionsResult,
    registeredSessionsResult,
    eventsResult,
    eventRegistrationsResult,
  ] = await Promise.all([
    db
      .from("profiles")
      .select("full_name, phone, mode, member_no")
      .eq("id", user.id)
      .maybeSingle(),
    db
      .from("participants")
      .select("id, session_id, mode, created_at", { count: "exact" })
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(5),
    db
      .from("volunteers")
      .select("id, role, organisation, created_at", { count: "exact" })
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(5),
    db
      .from("sessions")
      .select("id, title, topic, session_date, platform, registration_redirect_url")
      .gte("session_date", new Date().toISOString())
      .eq("is_published", true)
      .order("session_date", { ascending: true }),
    db
      .from("participants")
      .select("session_id")
      .eq("user_id", user.id),
    db
      .from("events")
      .select("id, title, description, event_date, venue, event_url, image_url")
      .gte("event_date", new Date().toISOString())
      .eq("is_published", true)
      .order("event_date", { ascending: true })
      .limit(50),
    db
      .from("event_registrations")
      .select("id, event_id, event_title, created_at", { count: "exact" })
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }),
  ]);

  const profileStatus = $("#memberProfileStatus");
  if (profileResult.error) {
    console.error("Could not load member profile:", profileResult.error);
    profileStatus.textContent =
      `Your profile could not be loaded: ${profileResult.error.message} Run the latest member dashboard migration.`;
    profileStatus.className = "member-activity-status err";
    renderMemberProfile(user, null);
  } else if (profileResult.data) {
    renderMemberProfile(user, profileResult.data);
    $("#memberNumber").textContent = profileResult.data.member_no || "—";
  } else {
    profileStatus.textContent =
      "Your profile record is missing. Run the latest member dashboard migration.";
    profileStatus.className = "member-activity-status err";
    renderMemberProfile(user, null);
  }

  if (sessionsResult.error) {
    console.error("Could not load member sessions:", sessionsResult.error);
    $("#memberSessionStatus").textContent =
      `Upcoming sessions could not be loaded: ${sessionsResult.error.message}`;
    $("#memberSessionStatus").className = "member-activity-status err";
    renderMemberSessions([], registeredSessionsResult.data || []);
  } else {
    renderMemberSessions(
      sessionsResult.data || [],
      registeredSessionsResult.data || [],
    );
  }

  const eventStatus = $("#memberEventStatus");
  if (eventsResult.error) {
    console.error("Could not load member events:", eventsResult.error);
    eventStatus.textContent =
      "Upcoming events could not be loaded. Please try again later.";
    eventStatus.className = "member-activity-status err";
    renderMemberEvents([], [], false);
  } else if (eventRegistrationsResult.error) {
    console.error(
      "Could not load member event registrations:",
      eventRegistrationsResult.error,
    );
    eventStatus.textContent =
      "Event RSVPs are not set up yet. Please contact the website administrator.";
    eventStatus.className = "member-activity-status err";
    renderMemberEvents(eventsResult.data || [], [], false);
  } else {
    eventStatus.textContent = "";
    eventStatus.className = "member-activity-status";
    renderMemberEvents(
      eventsResult.data || [],
      eventRegistrationsResult.data || [],
      true,
    );
  }

  const activityErrors = [];
  $("#memberRegistrationCount").textContent = registrationsResult.count ?? "—";
  if (registrationsResult.error) {
    console.error(
      "Could not load member registrations:",
      registrationsResult.error,
    );
    activityErrors.push(
      `Your registrations could not be loaded: ${registrationsResult.error.message} Run the latest member dashboard migration.`,
    );
  } else {
    $("#memberRegistrations").innerHTML = registrationsResult.data.length
      ? registrationsResult.data
          .map(
            (item) => `<article class="member-activity-item">
              <strong>Session registration</strong>
              <span>${item.session_id && item.session_id !== "any" ? "Selected session" : "Any upcoming session"} · ${esc(item.mode || "Format not selected")}</span>
              <small>${esc(new Date(item.created_at).toLocaleDateString())}</small>
            </article>`,
          )
          .join("")
      : '<p class="member-empty">Your session registrations will appear here.</p>';
  }

  if (registeredSessionsResult.error) {
    console.error(
      "Could not load registered session IDs:",
      registeredSessionsResult.error,
    );
    activityErrors.push(
      `Registration status could not be checked: ${registeredSessionsResult.error.message}`,
    );
  }

  $("#memberApplicationCount").textContent = applicationsResult.count ?? "—";
  if (applicationsResult.error) {
    console.error(
      "Could not load member applications:",
      applicationsResult.error,
    );
    activityErrors.push(
      `Your applications could not be loaded: ${applicationsResult.error.message} Run the latest member dashboard migration.`,
    );
  } else {
    $("#memberApplications").innerHTML = applicationsResult.data.length
      ? applicationsResult.data
          .map(
            (item) => `<article class="member-activity-item">
              <strong>${item.role === "partner" ? "Partner application" : "Volunteer application"}</strong>
              <span>${esc(item.organisation || "Application received")}</span>
              <small>${esc(new Date(item.created_at).toLocaleDateString())}</small>
            </article>`,
          )
          .join("")
      : '<p class="member-empty">Your volunteer and partner applications will appear here.</p>';
  }
  $("#memberEventRegistrationCount").textContent =
    eventRegistrationsResult.count ?? "—";
  $("#memberEventRegistrations").innerHTML = eventRegistrationsResult.error
    ? '<p class="member-empty">Event RSVP history is unavailable.</p>'
    : eventRegistrationsResult.data.length
      ? eventRegistrationsResult.data
          .slice(0, 5)
          .map(
            (item) => `<article class="member-activity-item">
              <strong>Event RSVP</strong>
              <span>${esc(item.event_title)}</span>
              <small>${esc(new Date(item.created_at).toLocaleDateString())}</small>
            </article>`,
          )
          .join("")
      : '<p class="member-empty">Your event RSVPs will appear here.</p>';
  const activityStatus = $("#memberActivityStatus");
  activityStatus.textContent = activityErrors.join(" ");
  activityStatus.className = activityErrors.length
    ? "member-activity-status err"
    : "member-activity-status";
}

const volunteerAreas = [
  "Teaching support",
  "Design",
  "Media and social media",
  "Technical support",
  "Events",
  "Administration",
];
const partnerAreas = [
  "Sponsorship",
  "Venue",
  "Mentoring",
  "Equipment",
  "Other",
];

function registrationForms() {
  const participantForm = $("#participantForm");
  const volunteerForm = $("#volunteerForm");
  if (!participantForm && !volunteerForm) return;

  const participantTab = $("#participantTab");
  const volunteerTab = $("#volunteerTab");
  const participantStatus = $("#participantStatus");
  const sessionSelect = $("#p-session");
  const sessionRedirectUrls = new Map();
  let selectedSession = new URLSearchParams(location.search).get("session");
  if (sessionSelect) document.addEventListener("site-cms-loaded", () => {
    const option = sessionSelect.querySelector('option[value="any"]');
    const label = cmsValues.get("form.any_session");
    if (option && label) option.textContent = label;
  });

  const selectTab = (type) => {
    if (!participantTab || !volunteerTab || !participantForm || !volunteerForm)
      return;
    const showParticipant = type === "participant";
    participantTab.setAttribute("aria-selected", String(showParticipant));
    volunteerTab.setAttribute("aria-selected", String(!showParticipant));
    participantTab.tabIndex = showParticipant ? 0 : -1;
    volunteerTab.tabIndex = showParticipant ? -1 : 0;
    participantForm.hidden = !showParticipant;
    volunteerForm.hidden = showParticipant;
  };

  const setRole = (role) => {
    if (!volunteerForm) return;
    const isPartner = role === "partner";
    $$('input[name="role"]', volunteerForm).forEach((input) => {
      if (input.type === "hidden") input.value = role;
      else input.checked = input.value === role;
    });
    $$(".only-partner", volunteerForm).forEach((field) => {
      field.hidden = !isPartner;
    });
    $$(".only-volunteer", volunteerForm).forEach((field) => {
      field.hidden = isPartner;
    });
    const courseField = $("#v-course");
    if (courseField) courseField.required = !isPartner;
    const areasLegend = $("#areas-legend");
    if (areasLegend) areasLegend.textContent =
      cmsValues.get(
        isPartner ? "form.partner_areas" : "form.volunteer_areas",
      ) || (isPartner ? "How can you support us?" : "Where can you help?");
    const messageLabel = $("#msg-label");
    if (messageLabel) messageLabel.textContent =
      cmsValues.get(
        isPartner ? "form.partner_message" : "form.volunteer_message",
      ) ||
      (isPartner
        ? "Tell us about your organisation and what you can offer"
        : "Tell us a little about yourself");
    const configuredAreas = cmsBlocks.get(
      isPartner ? "join_partner_areas" : "join_volunteer_areas",
    );
    const areas = configuredAreas?.length
      ? configuredAreas.map((block) => block.title)
      : isPartner
        ? partnerAreas
        : volunteerAreas;
    const areaOptions = $("#areaOpts");
    if (areaOptions) areaOptions.innerHTML = areas
      .map(
        (area) =>
          `<label class="opt"><input type="checkbox" name="areas" value="${esc(area)}"> ${esc(area)}</label>`,
      )
      .join("");
  };

  if (participantTab && volunteerTab) {
    participantTab.addEventListener("click", () => selectTab("participant"));
    volunteerTab.addEventListener("click", () => selectTab("volunteer"));
    [participantTab, volunteerTab].forEach((tab, index, tabs) => {
      tab.addEventListener("keydown", (event) => {
        if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
          const nextTab = tabs[1 - index];
          nextTab.click();
          nextTab.focus();
        }
      });
    });
  }
  if (volunteerForm) {
    $$('input[name="role"]', volunteerForm).forEach((input) => {
      input.addEventListener("change", () => setRole(input.value));
    });
    document.addEventListener("site-cms-loaded", () => {
      const selectedRole =
        $('input[name="role"]:checked', volunteerForm)?.value ||
        $('input[name="role"][type="hidden"]', volunteerForm)?.value;
      if (selectedRole) setRole(selectedRole);
    });
  }

  const requestedApplication = new URLSearchParams(location.search).get(
    "apply",
  );
  if (volunteerForm) {
    const defaultRole =
      $('input[name="role"][type="hidden"]', volunteerForm)?.value ||
      "volunteer";
    const role =
      requestedApplication === "partner" ||
      requestedApplication === "volunteer"
        ? requestedApplication
        : defaultRole;
    if (participantForm && participantTab && volunteerTab)
      selectTab("volunteer");
    setRole(role);
  }

  const loadSessions = async () => {
    if (!db || !participantForm || !sessionSelect) return;
    const { data, error } = await db
      .from("sessions")
      .select("id, title, session_date, registration_redirect_url")
      .gte("session_date", new Date().toISOString())
      .eq("is_published", true)
      .order("session_date", { ascending: true });

    if (error) {
      console.error("Could not load registration sessions:", error);
      if (participantStatus) {
        participantStatus.textContent =
          "Upcoming sessions could not be loaded. You can still register for any upcoming session.";
        participantStatus.hidden = false;
      }
      return;
    }

    sessionRedirectUrls.clear();
    (data || []).forEach((session) => {
      const redirectUrl = safeRedirectUrl(session.registration_redirect_url);
      if (redirectUrl) sessionRedirectUrls.set(session.id, redirectUrl);
    });
    sessionSelect.innerHTML =
      `<option value="any" data-cms-key="form.any_session">${esc(cmsValues.get("form.any_session") || "Any upcoming session")}</option>` +
      (data || [])
        .map(
          (session) =>
            `<option value="${esc(session.id)}">${esc(new Date(session.session_date).toLocaleString([], { dateStyle: "full", timeStyle: "short" }))}: ${esc(session.title)}</option>`,
        )
        .join("");
    if (selectedSession) sessionSelect.value = selectedSession;
  };

  if (participantForm) participantForm.addEventListener("submit", (event) => {
    const values = new FormData(participantForm);
    submitRegistration(event, participantForm, "participants", {
      full_name: String(values.get("full_name") || "").trim(),
      user_id: currentMember?.id || null,
      phone: String(values.get("phone") || "").trim(),
      email: String(values.get("email") || "").trim() || null,
      age_group: values.get("age_group") || null,
      session_id: values.get("session_id") || "any",
      mode: values.get("mode"),
      level: values.get("level"),
      goals: String(values.get("goals") || "").trim() || null,
      consent: values.get("consent") === "on",
    }, sessionRedirectUrls.get(String(values.get("session_id") || "")));
  });

  if (volunteerForm) volunteerForm.addEventListener("submit", (event) => {
    const values = new FormData(volunteerForm);
    const isPartner = values.get("role") === "partner";
    submitRegistration(event, volunteerForm, "volunteers", {
      role: isPartner ? "partner" : "volunteer",
      user_id: currentMember?.id || null,
      full_name: String(values.get("full_name") || "").trim(),
      organisation: String(values.get("organisation") || "").trim() || null,
      phone: String(values.get("phone") || "").trim(),
      email: String(values.get("email") || "").trim(),
      course_completed: isPartner
        ? null
        : String(values.get("course_completed") || "").trim(),
      certificate_no: String(values.get("certificate_no") || "").trim() || null,
      mode: isPartner ? null : values.get("mode"),
      areas: values.getAll("areas"),
      availability: String(values.get("availability") || "").trim() || null,
      message: String(values.get("message") || "").trim() || null,
      consent: values.get("consent") === "on",
    });
  });

  if (participantForm) loadSessions();
}

async function submitRegistration(event, formElement, table, row, redirectUrl) {
  event.preventDefault();
  const status = $(".status", formElement);
  const button = $('button[type="submit"]', formElement);
  const formData = new FormData(formElement);

  if (formData.get("website")) return;
  if (!formElement.reportValidity()) return;

  const showError = (message) => {
    status.textContent = message;
    status.className = "status err";
    status.hidden = false;
  };
  if (!db) {
    showError("Registration is unavailable until Supabase is configured.");
    return;
  }

  const originalLabel = button.textContent;
  button.disabled = true;
  button.textContent = "Sending…";
  try {
    const {
      data: { session },
      error: sessionError,
    } = await db.auth.getSession();
    if (sessionError) throw sessionError;
    row.user_id = session?.user.id || row.user_id || null;
    const { error } = await db.from(table).insert(row);
    if (error) throw error;

    status.textContent =
      table === "participants"
        ? "You’re registered. We’ll send you a reminder before the session."
        : "Thank you. We’ve received your application and will contact you soon.";
    status.className = "status ok";
    status.hidden = false;
    const hasSelectedSession =
      typeof row.session_id === "string" &&
      row.session_id.trim() !== "" &&
      row.session_id !== "any";
    if (table === "participants" && hasSelectedSession && redirectUrl) {
      location.assign(redirectUrl);
      return;
    }
    formElement.reset();
    if (table === "volunteers") {
      const selectedRole = $('input[name="role"]:checked', formElement);
      if (selectedRole) selectedRole.dispatchEvent(new Event("change"));
    }
    if (currentMember) await loadMemberDashboard(currentMember);
  } catch (error) {
    console.error(`Could not submit ${table} form:`, error);
    showError(
      "We couldn’t send your form. Please try again or contact us directly.",
    );
  } finally {
    button.disabled = false;
    button.textContent = originalLabel;
  }
}

loadSiteContent();

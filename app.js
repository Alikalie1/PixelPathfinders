const ok = window.PP && !PP.url.startsWith("YOUR_") && window.supabase;
const db = ok ? supabase.createClient(PP.url, PP.key) : null;

const $ = (selector) => document.querySelector(selector);
const $$ = (selector, root = document) =>
  Array.from(root.querySelectorAll(selector));
const cmsValues = new Map();
const cmsBlocks = new Map();
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
  const links = items.map((item) => {
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
    return `<span>${esc(block.title)}</span>`;
  }
  if (section === "home_values") {
    return `<li>${esc(block.title)}</li>`;
  }
  if (section === "session_agenda") {
    const items = Array.isArray(block.extra?.items) ? block.extra.items : [];
    return `<article class="card ag rv"><h3>${esc(block.title)}</h3><small>${esc(block.body)}</small><ol>${items
      .map((item) => {
        const [label, text] = String(item).split("|", 2);
        return `<li><b>${esc(label)}</b> ${esc(text || "")}</li>`;
      })
      .join("")}</ol></article>`;
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
  watch();
}

const menuButton = $("#mb");
const navigation = $("#nv");
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
addEventListener("scroll", () => {
  $("#bar").style.width =
    (scrollY / (document.body.scrollHeight - innerHeight)) * 100 + "%";
});
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
    i += Math.max(1, n / 40);
    if (i >= n) {
      i = n;
      clearInterval(t);
    }
    el.textContent = Math.round(i);
  }, 35);
});
const cv = $("#cv");
if (cv && !matchMedia("(prefers-reduced-motion:reduce)").matches) {
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
const card = (img, t, p, tag) =>
  `<div class="card rv">${img ? `<img src="${esc(img)}" alt="${esc(t)}" loading="lazy">` : ""}${tag ? `<span class="tag">${esc(tag)}</span>` : ""}<h3>${esc(t)}</h3><p>${esc(p)}</p></div>`;
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
              `<div class="card rv"><span class="tag">${esc(s.platform || "Online")}</span><h3>${esc(s.title)}</h3><p>${new Date(s.session_date).toLocaleString([], { dateStyle: "full", timeStyle: "short" })}</p><p>${esc(s.topic)}</p><a class="btn sm" href="join.html?session=${encodeURIComponent(s.id)}#applications">Register</a></div>`,
          )
          .join("")
      : '<p class="mut">New sessions will be announced soon.</p>';
  watch();
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
  const m = $("#ms"),
    sw = (a) => {
      $("#rf").hidden = !a;
      $("#lf").hidden = a;
      $("#t1").classList.toggle("on", a);
      $("#t2").classList.toggle("on", !a);
    };
  $("#t1").onclick = () => sw(true);
  $("#t2").onclick = () => sw(false);
  if (db)
    db.auth.getUser().then(({ data }) => {
      if (data.user) {
        m.textContent =
          "Welcome, " +
          (data.user.user_metadata.full_name || data.user.email) +
          "! You are logged in.";
        $("#lo").hidden = false;
      }
    });
  $("#lo").onclick = async () => {
    await db.auth.signOut();
    location.reload();
  };
  $("#rf").onsubmit = async (e) => {
    e.preventDefault();
    if (!db) {
      m.textContent = "Connect Supabase first (js/config.js).";
      return;
    }
    const f = Object.fromEntries(new FormData(e.target));
    const { error } = await db.auth.signUp({
      email: f.email,
      password: f.pw,
      options: { data: { full_name: f.name, phone: f.phone, mode: f.mode } },
    });
    m.textContent = error
      ? error.message
      : "Account created! Check your email to confirm, then log in.";
  };
  $("#lf").onsubmit = async (e) => {
    e.preventDefault();
    if (!db) {
      m.textContent = "Connect Supabase first (js/config.js).";
      return;
    }
    const f = Object.fromEntries(new FormData(e.target));
    const { error } = await db.auth.signInWithPassword({
      email: f.email,
      password: f.pw,
    });
    m.textContent = error ? error.message : "Logged in!";
    if (!error) location.reload();
  };
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
  if (!participantForm || !volunteerForm) return;

  const participantTab = $("#participantTab");
  const volunteerTab = $("#volunteerTab");
  const participantStatus = $("#participantStatus");
  const volunteerStatus = $("#volunteerStatus");
  const sessionSelect = $("#p-session");
  let selectedSession = new URLSearchParams(location.search).get("session");
  document.addEventListener("site-cms-loaded", () => {
    const option = sessionSelect.querySelector('option[value="any"]');
    const label = cmsValues.get("form.any_session");
    if (option && label) option.textContent = label;
  });

  const selectTab = (type) => {
    const showParticipant = type === "participant";
    participantTab.setAttribute("aria-selected", String(showParticipant));
    volunteerTab.setAttribute("aria-selected", String(!showParticipant));
    participantTab.tabIndex = showParticipant ? 0 : -1;
    volunteerTab.tabIndex = showParticipant ? -1 : 0;
    participantForm.hidden = !showParticipant;
    volunteerForm.hidden = showParticipant;
  };

  const setRole = (role) => {
    const isPartner = role === "partner";
    $$('input[name="role"]', volunteerForm).forEach((input) => {
      input.checked = input.value === role;
    });
    $$(".only-partner", volunteerForm).forEach((field) => {
      field.hidden = !isPartner;
    });
    $$(".only-volunteer", volunteerForm).forEach((field) => {
      field.hidden = isPartner;
    });
    $("#v-course").required = !isPartner;
    $("#areas-legend").textContent =
      cmsValues.get(
        isPartner ? "form.partner_areas" : "form.volunteer_areas",
      ) || (isPartner ? "How can you support us?" : "Where can you help?");
    $("#msg-label").textContent =
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
    $("#areaOpts").innerHTML = areas
      .map(
        (area) =>
          `<label class="opt"><input type="checkbox" name="areas" value="${esc(area)}"> ${esc(area)}</label>`,
      )
      .join("");
  };

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
  $$('input[name="role"]', volunteerForm).forEach((input) => {
    input.addEventListener("change", () => setRole(input.value));
  });
  document.addEventListener("site-cms-loaded", () => {
    const selectedRole = $('input[name="role"]:checked', volunteerForm)?.value;
    if (selectedRole) setRole(selectedRole);
  });

  const requestedApplication = new URLSearchParams(location.search).get(
    "apply",
  );
  if (
    requestedApplication === "partner" ||
    requestedApplication === "volunteer"
  ) {
    selectTab("volunteer");
    setRole(requestedApplication);
  } else {
    setRole("volunteer");
  }

  const loadSessions = async () => {
    if (!db) return;
    const { data, error } = await db
      .from("sessions")
      .select("id, title, session_date")
      .gte("session_date", new Date().toISOString())
      .eq("is_published", true)
      .order("session_date", { ascending: true });

    if (error) {
      console.error("Could not load registration sessions:", error);
      participantStatus.textContent =
        "Upcoming sessions could not be loaded. You can still register for any upcoming session.";
      participantStatus.hidden = false;
      return;
    }

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

  participantForm.addEventListener("submit", (event) => {
    const values = new FormData(participantForm);
    submitRegistration(event, participantForm, "participants", {
      full_name: String(values.get("full_name") || "").trim(),
      phone: String(values.get("phone") || "").trim(),
      email: String(values.get("email") || "").trim() || null,
      age_group: values.get("age_group") || null,
      session_id: values.get("session_id") || "any",
      mode: values.get("mode"),
      level: values.get("level"),
      goals: String(values.get("goals") || "").trim() || null,
      consent: values.get("consent") === "on",
    });
  });

  volunteerForm.addEventListener("submit", (event) => {
    const values = new FormData(volunteerForm);
    const isPartner = values.get("role") === "partner";
    submitRegistration(event, volunteerForm, "volunteers", {
      role: isPartner ? "partner" : "volunteer",
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

  loadSessions();
}

async function submitRegistration(event, formElement, table, row) {
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
    const { error } = await db.from(table).insert(row);
    if (error) throw error;

    status.textContent =
      table === "participants"
        ? "You’re registered. We’ll send you a reminder before the session."
        : "Thank you. We’ve received your application and will contact you soon.";
    status.className = "status ok";
    status.hidden = false;
    formElement.reset();
    if (table === "volunteers") {
      const selectedRole = $('input[name="role"]:checked', formElement);
      if (selectedRole) selectedRole.dispatchEvent(new Event("change"));
    }
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

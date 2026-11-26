const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const escapeHtml = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[character],
  );

const client =
  window.PP?.url && window.PP?.key && window.supabase
    ? window.supabase.createClient(window.PP.url, window.PP.key)
    : null;
const pageTitles = new Map();
const recordCache = new Map();
let currentUser = null;
let currentRole = null;
let activeRecordTable = "team_members";
const sections = {
  overview: ["Overview", "See submissions and website activity in one place."],
  home_hero: ["Home hero", "Edit the home page headline, buttons, statistics and image."],
  pages: ["Pages", "Choose which website pages are visible to visitors."],
  content: ["Page text", "Edit the copy and labels shown across each page."],
  blocks: [
    "Content cards",
    "Manage cards, pathways, values and agenda content.",
  ],
  navigation: ["Navigation", "Update the public header and footer links."],
  settings: [
    "Site settings",
    "Manage the brand, contact details and social links.",
  ],
  team: ["Team", "Manage team members shown on the public website."],
  projects: ["Projects", "Manage project cards and project links."],
  sessions: ["Sessions", "Manage session details, images and redirects."],
  events: ["Events", "Post events with flyers, countdowns, locations and links."],
  gallery: ["Gallery", "Manage public gallery photos and captions."],
  contact_messages: ["Contact messages", "Review and manage visitor messages."],
  registrations: ["Registrations", "Review and manage session registrations."],
  event_registrations: ["Event registrations", "Review member RSVPs for published events."],
  applications: ["Applications", "Review volunteer and partner applications."],
  members: ["Members", "Review and manage member accounts."],
  admins: ["Administrator access", "Invite and manage website administrators."],
};

const sectionPanels = {
  team: "records",
  projects: "records",
  sessions: "records",
  events: "records",
  gallery: "records",
  contact_messages: "inbox",
  registrations: "inbox",
  event_registrations: "inbox",
  applications: "inbox",
  members: "inbox",
};
const recordSectionTables = {
  team: "team_members",
  projects: "projects",
  sessions: "sessions",
  events: "events",
  gallery: "gallery_items",
};
const inboxSectionTables = {
  contact_messages: "messages",
  registrations: "participants",
  event_registrations: "event_registrations",
  applications: "volunteers",
  members: "profiles",
};

const recordDefinitions = {
  team_members: {
    label: "Team members",
    fields: [
      ["name", "Name", "text", true],
      ["role", "Role", "text"],
      ["bio", "Biography", "textarea"],
      ["photo_url", "Photo URL", "url"],
      ["sort_order", "Display order", "number"],
      ["is_published", "Published", "checkbox"],
    ],
  },
  projects: {
    label: "Projects",
    fields: [
      ["title", "Title", "text", true],
      ["summary", "Summary", "textarea"],
      ["status", "Status", "text"],
      ["image_url", "Image URL", "url"],
      ["project_url", "Project URL", "url"],
      ["is_published", "Published", "checkbox"],
    ],
  },
  sessions: {
    label: "Sessions",
    fields: [
      ["title", "Title", "text", true],
      ["topic", "Topic", "textarea"],
      ["session_date", "Date and time", "datetime-local", true],
      ["platform", "Platform", "text"],
      ["link", "Session link", "url"],
      ["image_url", "Image URL", "url"],
      ["registration_redirect_url", "After-registration redirect URL", "text"],
      ["is_published", "Published", "checkbox"],
    ],
  },
  events: {
    label: "Events",
    fields: [
      ["title", "Event title", "text", true],
      ["description", "Description", "textarea", true],
      ["event_date", "Date and time", "datetime-local", true],
      ["venue", "Venue or location", "text"],
      ["event_url", "Event link", "url"],
      ["image_url", "Flyer image URL", "url"],
      ["is_published", "Published", "checkbox"],
    ],
  },
  gallery_items: {
    label: "Gallery items",
    fields: [
      ["title", "Title", "text"],
      ["caption", "Caption", "textarea"],
      ["category", "Category", "text"],
      ["image_url", "Image URL", "url"],
      ["is_published", "Published", "checkbox"],
    ],
  },
};

function setStatus(element, message, type = "") {
  if (!element) return;
  element.textContent = message;
  element.className = `status ${type}`.trim();
}

function setDashboardStatus(message, type = "") {
  setStatus($("#dashboardStatus"), message, type);
}

function showLogin(message = "") {
  $("#loginPanel").hidden = false;
  $("#dashboardPanel").hidden = true;
  $("#accountBar").hidden = true;
  if (message) setStatus($("#loginStatus"), message, "error");
}

function showDashboard() {
  $("#loginPanel").hidden = true;
  $("#dashboardPanel").hidden = false;
  $("#accountBar").hidden = false;
  $("#roleBadge").textContent = currentRole.replace("_", " ");
  $("#accountEmail").textContent = currentUser?.email || "";
  $$("[data-super-admin]").forEach((item) => {
    item.hidden = currentRole !== "super_admin";
  });
}

async function verifyAdmin(user) {
  currentUser = user;
  const { data, error } = await client
    .from("admin_roles")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) {
    console.error("Could not verify admin account:", error);
    showLogin(
      "Could not verify admin permissions. Check the database migration.",
    );
    return false;
  }
  if (!data || !["admin", "super_admin"].includes(data.role)) {
    showLogin("This account does not have website admin access.");
    return false;
  }

  currentRole = data.role;
  showDashboard();
  await loadOverview();
  if (!adminTourAutoStarted && !hasSeenAdminTour()) {
    adminTourAutoStarted = true;
    window.setTimeout(startAdminTour, 0);
  }
  return true;
}

async function initialize() {
  if (!client) {
    showLogin("Supabase is not configured for this website.");
    return;
  }
  const { data, error } = await client.auth.getSession();
  if (error) {
    console.error("Could not restore the admin session:", error);
    showLogin("Could not restore your sign-in. Please sign in again.");
    return;
  }
  if (data.session?.user) await verifyAdmin(data.session.user);
  else showLogin();
}

$("#loginForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!client) return showLogin("Supabase is not configured for this website.");
  const form = new FormData(event.currentTarget);
  setStatus($("#loginStatus"), "Signing in…");
  const { data, error } = await client.auth.signInWithPassword({
    email: String(form.get("email") || "").trim(),
    password: String(form.get("password") || ""),
  });
  if (error) {
    console.error("Admin sign in failed:", error);
    setStatus($("#loginStatus"), error.message, "error");
    return;
  }
  await verifyAdmin(data.user);
});

$("#togglePassword").addEventListener("click", () => {
  const password = $("#adminPassword");
  const showPassword = password.type === "password";
  password.type = showPassword ? "text" : "password";
  $("#togglePassword").setAttribute(
    "aria-label",
    showPassword ? "Hide password" : "Show password",
  );
  $("#togglePassword").setAttribute("aria-pressed", String(showPassword));
});

$("#signOutButton").addEventListener("click", async () => {
  if (!client) return;
  const { error } = await client.auth.signOut();
  if (error) {
    console.error("Could not sign out:", error);
    setDashboardStatus("Could not sign out. Please try again.", "error");
    return;
  }
  currentUser = null;
  currentRole = null;
  showLogin();
});

$$("[data-tab]").forEach((button) => {
  button.addEventListener("click", async () => {
    if (button.hidden) return;
    await openSection(button.dataset.tab);
  });
});

const adminTourScrim = $("#adminTourScrim");
const adminTourCard = $("#adminTourCard");
const adminTourStepsLabel = $("#adminTourStep");
const adminTourTitle = $("#adminTourTitle");
const adminTourDescription = $("#adminTourDescription");
const adminTourBack = $("#adminTourBack");
const adminTourSkip = $("#adminTourSkip");
const adminTourNext = $("#adminTourNext");
const adminTourStorageKey = () =>
  `pixelpathfinders:admin-dashboard-tour:v1:${currentUser.id}`;
const isMobileAdminDashboard = () =>
  window.matchMedia("(max-width: 760px)").matches;
const adminTourSteps = () => [
  {
    target: "#adminTourStart",
    title: "Admin dashboard tour",
    description:
      "This walkthrough explains the main dashboard sections. Use Next and Back to explore, or Skip tour to close it. Reopen it any time with the Dashboard tour button. On small screens, Dashboard menu opens the section list.",
  },
  {
    target: '[data-tab="overview"]',
    sidebar: true,
    title: "Overview",
    description:
      "See totals for website content and incoming submissions. The quick-action buttons open registrations, sessions, or the home hero directly.",
  },
  {
    target: '[data-tab="home_hero"]',
    sidebar: true,
    title: "Home hero",
    description:
      "Edit the homepage headline, buttons and destinations, statistics, and hero image. Choose Save home hero to publish your changes.",
  },
  {
    target: '[data-tab="pages"]',
    sidebar: true,
    title: "Page visibility",
    description:
      "Publish or hide a page for visitors. Hiding a page does not delete its content.",
  },
  {
    target: '[data-tab="content"]',
    sidebar: true,
    title: "Page text",
    description:
      "Choose a page to edit its headings, descriptions, form labels, or legal copy. Save page text to apply the updates; Preview selected page opens the public page separately.",
  },
  {
    target: '[data-tab="blocks"]',
    sidebar: true,
    title: "Content cards",
    description:
      "Add, edit, order, and publish cards and page sections. This includes partner names, session agendas, and short courses. Save card applies the changes.",
  },
  {
    target: '[data-tab="navigation"]',
    sidebar: true,
    title: "Navigation links",
    description:
      "Manage links in the public header and footer. Site settings is a separate tab for the brand, contact details, social links, and footer information.",
  },
  {
    target: '[data-tab="settings"]',
    sidebar: true,
    title: "Site settings",
    description:
      "Update shared website details such as branding, contact information, social profiles, and footer text, then save the settings.",
  },
  {
    target: '[data-tab="events"]',
    sidebar: true,
    title: "Website content",
    description:
      "Team, Projects, Sessions, Events, and Gallery each have their own tab. Add or edit items, upload images, and publish them. Sessions can have registration redirects; events include flyers, dates, locations, and links.",
  },
  {
    target: '[data-tab="registrations"]',
    sidebar: true,
    title: "Submissions and members",
    description:
      "Use Contact messages, Registrations, Applications, and Members to review incoming information. Event RSVPs have their own tab. These inboxes contain private details; open a submission to review its full information.",
  },
  {
    target: '[data-tab="event_registrations"]',
    sidebar: true,
    title: "Event RSVPs",
    description:
      "Review which signed-in members have reserved a place at each event. This private inbox includes the event title and the member’s submitted contact details.",
  },
  ...(currentRole === "super_admin"
    ? [
        {
          target: '[data-tab="admins"]',
          sidebar: true,
          title: "Admin access",
          description:
            "Super admins can invite or remove website administrators here. Only grant access to people who should manage website data.",
        },
      ]
    : []),
  {
    target: ".sidebar-site-link",
    sidebar: true,
    title: "Open the public website",
    description:
      "Open the visitor-facing website in a new tab to check how published changes look.",
  },
  {
    target: "#signOutButton",
    header: true,
    title: "Sign out",
    description:
      "End your admin session when you are finished, especially on a shared device.",
  },
];
let adminTourIndex = 0;
let adminTourTarget = null;
let adminTourReturnFocus = null;
let adminTourAutoStarted = false;

function hasSeenAdminTour() {
  if (!window.SiteCookieConsent?.allowsFunctionalPreferences()) return false;
  try {
    return window.localStorage.getItem(adminTourStorageKey()) === "1";
  } catch (error) {
    console.error("Could not read admin dashboard tour preference:", error);
    return false;
  }
}

function clearAdminTourTarget() {
  if (adminTourTarget) {
    adminTourTarget.classList.remove("admin-tour-highlight");
    adminTourTarget = null;
  }
  $("#dashboardSidebar").classList.remove("admin-tour-sidebar-target");
  document.body.classList.remove("admin-tour-header-target");
}

function closeAdminTour(markSeen) {
  clearAdminTourTarget();
  adminTourScrim.hidden = true;
  adminTourCard.hidden = true;
  closeSidebar();
  if (
    markSeen &&
    window.SiteCookieConsent?.allowsFunctionalPreferences()
  ) {
    try {
      window.localStorage.setItem(adminTourStorageKey(), "1");
    } catch (error) {
      console.error("Could not save admin dashboard tour preference:", error);
    }
  }
  if (adminTourReturnFocus?.isConnected) adminTourReturnFocus.focus();
}

function showAdminTourStep(index) {
  const steps = adminTourSteps();
  adminTourIndex = index;
  const step = steps[adminTourIndex];
  clearAdminTourTarget();
  const sidebar = $("#dashboardSidebar");
  if (step.sidebar && isMobileAdminDashboard()) {
    sidebar.classList.add("open");
    $("#sidebarBackdrop").hidden = false;
    $("#sidebarToggle").setAttribute("aria-expanded", "true");
  } else {
    closeSidebar();
  }
  if (step.sidebar) sidebar.classList.add("admin-tour-sidebar-target");
  if (step.header) document.body.classList.add("admin-tour-header-target");

  const target = document.querySelector(step.target);
  if (!target || target.hidden) {
    console.error(`Admin dashboard tour target not found: ${step.target}`);
    closeAdminTour(false);
    return;
  }
  adminTourTarget = target;
  target.classList.add("admin-tour-highlight");
  target.scrollIntoView({ block: "center", inline: "nearest" });
  adminTourStepsLabel.textContent = `Step ${adminTourIndex + 1} of ${steps.length}`;
  adminTourTitle.textContent = step.title;
  adminTourDescription.textContent = step.description;
  adminTourBack.hidden = adminTourIndex === 0;
  adminTourBack.disabled = adminTourIndex === 0;
  adminTourNext.textContent =
    adminTourIndex === steps.length - 1 ? "Finish tour" : "Next";
  adminTourScrim.hidden = false;
  adminTourCard.hidden = false;
  adminTourNext.focus();
}

function startAdminTour() {
  adminTourReturnFocus = document.activeElement;
  showAdminTourStep(0);
}

$("#adminTourStart").addEventListener("click", startAdminTour);
adminTourBack.addEventListener("click", () => {
  if (adminTourIndex > 0) showAdminTourStep(adminTourIndex - 1);
});
adminTourSkip.addEventListener("click", () => closeAdminTour(true));
adminTourNext.addEventListener("click", () => {
  const steps = adminTourSteps();
  if (adminTourIndex === steps.length - 1) {
    closeAdminTour(true);
  } else {
    showAdminTourStep(adminTourIndex + 1);
  }
});
adminTourCard.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    event.preventDefault();
    closeAdminTour(true);
  } else if (event.key === "ArrowRight" && !adminTourNext.disabled) {
    event.preventDefault();
    adminTourNext.click();
  } else if (event.key === "ArrowLeft" && !adminTourBack.disabled) {
    event.preventDefault();
    adminTourBack.click();
  } else if (event.key === "Tab") {
    const controls = $$(
      "button:not([hidden]):not(:disabled)",
      adminTourCard,
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

async function openSection(section) {
  const activeSection = sections[section] ? section : "overview";
  const panelSection = sectionPanels[activeSection] || activeSection;
  const [title, description] = sections[activeSection];
  $$("[data-tab]").forEach((tab) =>
    tab.classList.toggle("active", tab.dataset.tab === activeSection),
  );
  $$("[data-panel]").forEach(
    (panel) => (panel.hidden = panel.dataset.panel !== panelSection),
  );
  $("#sectionTitle").textContent = title;
  $("#sectionDescription").textContent = description;
  setDashboardStatus("");
  closeSidebar();
  await loadSection(activeSection);
}

function closeSidebar() {
  $("#dashboardSidebar").classList.remove("open");
  $("#sidebarBackdrop").hidden = true;
  $("#sidebarToggle").setAttribute("aria-expanded", "false");
}

$("#sidebarToggle").addEventListener("click", () => {
  $("#dashboardSidebar").classList.add("open");
  $("#sidebarBackdrop").hidden = false;
  $("#sidebarToggle").setAttribute("aria-expanded", "true");
});
$("#sidebarClose").addEventListener("click", closeSidebar);
$("#sidebarBackdrop").addEventListener("click", closeSidebar);
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeSidebar();
});
$$("[data-open-tab]").forEach((button) => {
  button.addEventListener("click", () => openSection(button.dataset.openTab));
});

async function loadSection(section) {
  if (section === "overview") return loadOverview();
  if (section === "home_hero") return loadHeroEditor();
  if (section === "pages") return loadPagesPanel();
  if (section === "content") return loadContentEditor();
  if (section === "blocks") return loadBlocks();
  if (section === "navigation") return loadNavigation();
  if (section === "settings") return loadSettings();
  if (recordSectionTables[section]) {
    $("#recordType").value = recordSectionTables[section];
    $("#recordForm").reset();
    $("#recordForm").elements.id.value = "";
    return loadRecords();
  }
  if (inboxSectionTables[section]) {
    $("#inboxType").value = inboxSectionTables[section];
    return loadInbox();
  }
  if (section === "admins" && currentRole === "super_admin")
    return loadAdmins();
}

async function uploadImageIntoField(input, file) {
  if (!file.type.startsWith("image/")) {
    setDashboardStatus("Choose an image file to upload.", "error");
    input.value = "";
    return;
  }
  if (file.size > 8 * 1024 * 1024) {
    setDashboardStatus("Images must be 8 MB or smaller.", "error");
    input.value = "";
    return;
  }
  const form = input.closest("form");
  const urlField = form?.elements.namedItem(input.dataset.imageUploadFor);
  if (!(urlField instanceof HTMLInputElement)) {
    setDashboardStatus("The image URL field was not found.", "error");
    input.value = "";
    return;
  }
  const extension =
    file.name
      .split(".")
      .pop()
      ?.toLowerCase()
      .replace(/[^a-z0-9]/g, "") || "img";
  const uniqueName = `${Date.now()}-${Math.random().toString(36).slice(2)}.${extension}`;
  input.disabled = true;
  setDashboardStatus("Uploading image to Supabase Storage…");
  const { data, error } = await client.storage
    .from("media")
    .upload(uniqueName, file, {
      cacheControl: "3600",
      contentType: file.type,
      upsert: false,
    });
  input.disabled = false;
  if (error) {
    console.error("Could not upload website image:", error);
    setDashboardStatus(
      "Image upload failed. Check the media bucket and admin upload policy.",
      "error",
    );
    input.value = "";
    return;
  }
  const { data: publicUrl } = client.storage
    .from("media")
    .getPublicUrl(data.path);
  urlField.value = publicUrl.publicUrl;
  setDashboardStatus(
    "Image uploaded. Save the form to publish its URL.",
    "success",
  );
  input.value = "";
}

async function uploadAgendaPdfIntoField(input, file) {
  const isPdf =
    file.name.toLowerCase().endsWith(".pdf") &&
    (!file.type || file.type === "application/pdf");
  if (!isPdf) {
    setDashboardStatus("Choose a PDF file to upload.", "error");
    input.value = "";
    return;
  }
  if (file.size > 10 * 1024 * 1024) {
    setDashboardStatus("Agenda PDFs must be 10 MB or smaller.", "error");
    input.value = "";
    return;
  }
  const form = input.closest("form");
  const urlField = form?.elements.namedItem(input.dataset.agendaPdfUploadFor);
  if (!(urlField instanceof HTMLInputElement)) {
    setDashboardStatus("The agenda PDF URL field was not found.", "error");
    input.value = "";
    return;
  }

  const uniqueName = `agendas/${Date.now()}-${Math.random().toString(36).slice(2)}.pdf`;
  input.disabled = true;
  setDashboardStatus("Uploading agenda PDF to Supabase Storage…");
  try {
    const { data, error } = await client.storage.from("media").upload(
      uniqueName,
      file,
      {
        cacheControl: "3600",
        contentType: "application/pdf",
        upsert: false,
      },
    );
    if (error) {
      console.error("Could not upload agenda PDF:", error);
      setDashboardStatus(
        "Agenda PDF upload failed. Check the media bucket and admin upload policy.",
        "error",
      );
      return;
    }
    const { data: publicUrl } = client.storage
      .from("media")
      .getPublicUrl(data.path);
    urlField.value = publicUrl.publicUrl;
    setDashboardStatus(
      "Agenda PDF uploaded. Save the agenda entry to publish its download link.",
      "success",
    );
  } catch (error) {
    console.error("Could not upload agenda PDF:", error);
    setDashboardStatus(
      "Agenda PDF upload failed. Check your connection and storage access.",
      "error",
    );
  } finally {
    input.disabled = false;
    input.value = "";
  }
}

async function loadOverview() {
  const collections = [
    ["Team members", "team_members"],
    ["Projects", "projects"],
    ["Sessions", "sessions"],
    ["Events", "events"],
    ["Contact messages", "messages"],
    ["Session registrations", "participants"],
    ["Event registrations", "event_registrations"],
    ["Volunteer and partner forms", "volunteers"],
  ];
  const counts = await Promise.all(
    collections.map(async ([label, table]) => {
      const { count, error } = await client
        .from(table)
        .select("id", { count: "exact", head: true });
      if (error) {
        console.error(`Could not count ${table}:`, error);
        return { label, count: "—" };
      }
      return { label, count: count ?? 0 };
    }),
  );
  $("#overviewCounts").innerHTML = counts
    .map(
      ({ label, count }) =>
        `<article class="count-card"><strong>${escapeHtml(count)}</strong><span>${escapeHtml(label)}</span></article>`,
    )
    .join("");
}

async function loadPages(select) {
  const { data, error } = await client
    .from("site_pages")
    .select("slug, title")
    .order("title");
  if (error) throw error;
  pageTitles.clear();
  data.forEach((page) => pageTitles.set(page.slug, page.title));
  select.innerHTML = data
    .map(
      (page) =>
        `<option value="${escapeHtml(page.slug)}">${escapeHtml(page.title)}</option>`,
    )
    .join("");
  return data;
}

async function loadPagesPanel() {
  const { data, error } = await client
    .from("site_pages")
    .select("slug, title, description, is_published")
    .order("title");
  if (error) {
    console.error("Could not load website pages:", error);
    setDashboardStatus("Could not load website pages.", "error");
    return;
  }
  data.forEach((page) => pageTitles.set(page.slug, page.title));
  $("#pagesList").innerHTML = data
    .map(
      (page) => `<article class="record-card page-record">
        <div>
          <h3>${escapeHtml(page.title)}</h3>
          <p>${escapeHtml(page.description || page.slug + ".html")}</p>
        </div>
        <div class="record-actions">
          <span class="page-state ${page.is_published ? "published" : "hidden-page"}">${page.is_published ? "Published" : "Hidden from visitors"}</span>
          <button class="button ${page.is_published ? "button-quiet" : "button-primary"}" type="button" data-toggle-page="${escapeHtml(page.slug)}" data-published="${page.is_published}" title="${page.is_published ? "Hide this page from public visitors without deleting its content" : "Make this page visible to public visitors"}">${page.is_published ? "Unpublish page" : "Publish page"}</button>
        </div>
      </article>`,
    )
    .join("");
}

$("#pagesList").addEventListener("click", async (event) => {
  const button = event.target.closest("[data-toggle-page]");
  if (!button) return;
  const isPublished = button.dataset.published === "true";
  const action = isPublished ? "unpublish" : "publish";
  if (
    !confirm(
      `Are you sure you want to ${action} this page? Its saved content will not be deleted.`,
    )
  )
    return;
  button.disabled = true;
  const { error } = await client
    .from("site_pages")
    .update({ is_published: !isPublished })
    .eq("slug", button.dataset.togglePage);
  button.disabled = false;
  if (error) {
    console.error(`Could not ${action} page:`, error);
    setDashboardStatus(`Could not ${action} this page.`, "error");
    return;
  }
  setDashboardStatus(
    isPublished
      ? "Page is now hidden from visitors."
      : "Page is now published.",
    "success",
  );
  await loadPagesPanel();
});

async function loadContentEditor() {
  try {
    const select = $("#contentPage");
    if (!select.options.length) {
      await loadPages(select);
      select.addEventListener("change", () => {
        updatePagePreview();
        loadContentRows();
      });
    }
    updatePagePreview();
    await loadContentRows();
  } catch (error) {
    console.error("Could not load editable page content:", error);
    setDashboardStatus("Could not load page content.", "error");
  }
}

async function loadHeroEditor() {
  const saveButton = $('#heroForm button[type="submit"]');
  saveButton.disabled = true;
  const [contentResult, settingsResult] = await Promise.all([
    client
      .from("site_content")
      .select("content_key, label, value, input_type")
      .eq("page_slug", "index")
      .order("sort_order"),
    client
      .from("site_settings")
      .select("setting_key, label, value")
      .in("setting_key", [
        "hero_image_url",
        "founders_count",
        "saturdays_count",
        "open_percent",
      ]),
  ]);
  if (contentResult.error || settingsResult.error) {
    const error = contentResult.error || settingsResult.error;
    console.error("Could not load home hero settings:", error);
    $("#heroEditor").replaceChildren();
    setDashboardStatus(
      "Could not load all home hero settings. Check the website CMS database setup.",
      "error",
    );
    return;
  }

  const settings = new Map(
    settingsResult.data.map((setting) => [setting.setting_key, setting]),
  );
  const expectedContentKeys = [
    "hero.founded",
    "hero.title_prefix",
    "hero.title_focus",
    "hero.title_suffix",
    "hero.body",
    "hero.primary",
    "hero.primary_url",
    "hero.secondary",
    "hero.secondary_url",
    "stats.founders_label",
    "stats.saturdays_label",
    "stats.open_label",
  ];
  const contentOrder = new Map(
    expectedContentKeys.map((key, index) => [key, index]),
  );
  const heroContent = contentResult.data.filter(
    (item) =>
      item.content_key.startsWith("hero.") ||
      item.content_key.startsWith("stats."),
  );
  const orderedContent = [...heroContent].sort(
    (left, right) =>
      (contentOrder.get(left.content_key) ?? Number.MAX_SAFE_INTEGER) -
      (contentOrder.get(right.content_key) ?? Number.MAX_SAFE_INTEGER),
  );
  const contentFields = orderedContent
    .map((item) => {
      const field =
        item.input_type === "textarea"
          ? `<textarea name="${escapeHtml(item.content_key)}" data-hero-content-key rows="3">${escapeHtml(item.value)}</textarea>`
          : `<input name="${escapeHtml(item.content_key)}" data-hero-content-key type="${escapeHtml(item.input_type)}" value="${escapeHtml(item.value)}">`;
      return `<label class="editor-field">${escapeHtml(item.label)}${field}</label>`;
    })
    .join("");
  const imageSetting = settings.get("hero_image_url");
  const imageField = imageSetting
    ? `<div class="editor-field"><label>${escapeHtml(imageSetting.label)}<input name="hero_image_url" type="url" value="${escapeHtml(imageSetting.value)}"></label><label class="setting-upload">Upload replacement image<input type="file" accept="image/*" data-image-upload-for="hero_image_url"><small>Upload an image (up to 8 MB), then save the hero.</small></label></div>`
    : "";
  const statSettings = ["founders_count", "saturdays_count", "open_percent"]
    .map((key) => settings.get(key))
    .filter(Boolean)
    .map(
      (setting) =>
        `<label class="editor-field">${escapeHtml(setting.label)}<input name="${escapeHtml(setting.setting_key)}" data-hero-setting type="number" value="${escapeHtml(setting.value)}"></label>`,
    )
    .join("");
  $("#heroEditor").innerHTML = `${contentFields}${imageField}${statSettings}`;
  const availableContentKeys = new Set(
    heroContent.map((item) => item.content_key),
  );
  const missingSetting =
    !imageSetting ||
    ["founders_count", "saturdays_count", "open_percent"].some(
      (key) => !settings.has(key),
    );
  const missingFields =
    missingSetting ||
    expectedContentKeys.some((key) => !availableContentKeys.has(key));
  saveButton.disabled = missingFields;
  if (missingFields) {
    setDashboardStatus(
      "Some hero fields are missing. Re-run the website CMS SQL setup, then reload this tab.",
      "error",
    );
  }
}

$("#heroForm").addEventListener("change", async (event) => {
  const upload =
    event.target instanceof Element
      ? event.target.closest("[data-image-upload-for]")
      : null;
  const file = upload?.files?.[0];
  if (upload && file) await uploadImageIntoField(upload, file);
});

$("#heroForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const contentRows = $$("[data-hero-content-key]", form).map((field) => ({
    content_key: field.name,
    value: field.value,
  }));
  const settingRows = $$("[data-hero-setting]", form).map((field) => ({
    setting_key: field.name,
    value: field.value,
  }));
  const imageField = form.elements.namedItem("hero_image_url");
  if (imageField) {
    settingRows.push({
      setting_key: "hero_image_url",
      value: String(imageField.value || "").trim(),
    });
  }
  const results = await Promise.all([
    ...contentRows.map((row) =>
      client
        .from("site_content")
        .update({ value: row.value })
        .eq("page_slug", "index")
        .eq("content_key", row.content_key),
    ),
    ...settingRows.map((row) =>
      client
        .from("site_settings")
        .update({ value: row.value })
        .eq("setting_key", row.setting_key),
    ),
  ]);
  const failed = results.find((result) => result.error);
  if (failed) {
    console.error("Could not save home hero:", failed.error);
    setDashboardStatus("Could not save all home hero changes.", "error");
    return;
  }
  setDashboardStatus("Home hero saved.", "success");
});

function updatePagePreview() {
  const slug = $("#contentPage").value || "index";
  $("#pagePreviewLink").href = `/${slug}.html`;
}

async function loadContentRows() {
  const slug = $("#contentPage").value;
  if (!slug) return;
  const { data, error } = await client
    .from("site_content")
    .select("content_key, label, value, input_type")
    .eq("page_slug", slug)
    .order("sort_order");
  if (error) {
    console.error("Could not load page text:", error);
    setDashboardStatus("Could not load page text.", "error");
    return;
  }
  const pageContent =
    slug === "index"
      ? data.filter(
          (item) =>
            !item.content_key.startsWith("hero.") &&
            !item.content_key.startsWith("stats."),
        )
      : data;
  $("#contentEditor").innerHTML = pageContent
    .map((item) => {
      const field =
        item.input_type === "textarea"
          ? `<textarea name="${escapeHtml(item.content_key)}" rows="3">${escapeHtml(item.value)}</textarea>`
          : `<input name="${escapeHtml(item.content_key)}" type="${escapeHtml(item.input_type)}" value="${escapeHtml(item.value)}">`;
      return `<label class="editor-field">${escapeHtml(item.label)}${field}</label>`;
    })
    .join("");
}

$("#contentForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const pageSlug = $("#contentPage").value;
  const rows = $$("[name]", $("#contentEditor")).map((field) => ({
    page_slug: pageSlug,
    content_key: field.name,
    value: field.value,
  }));
  if (!rows.length)
    return setDashboardStatus("There is no page content to save.");
  const results = await Promise.all(
    rows.map((row) =>
      client
        .from("site_content")
        .update({ value: row.value })
        .eq("page_slug", row.page_slug)
        .eq("content_key", row.content_key),
    ),
  );
  const failed = results.find((result) => result.error);
  if (failed) {
    console.error("Could not save page content:", failed.error);
    setDashboardStatus("Could not save page content.", "error");
    return;
  }
  setDashboardStatus("Page content saved.", "success");
});

async function loadBlocks() {
  try {
    if (!$("#blockPage").options.length) await loadPages($("#blockPage"));
    const { data, error } = await client
      .from("content_blocks")
      .select("*")
      .order("page_slug")
      .order("section_key")
      .order("sort_order");
    if (error) throw error;
    $("#blocksList").innerHTML = data.map(renderBlockCard).join("");
  } catch (error) {
    console.error("Could not load content cards:", error);
    setDashboardStatus("Could not load content cards.", "error");
  }
}

function renderBlockCard(block) {
  recordCache.set(`block:${block.id}`, block);
  return `<article class="record-card">
    ${block.image_url ? `<img class="record-image" src="${escapeHtml(block.image_url)}" alt="" loading="lazy">` : ""}
    <h3>${escapeHtml(block.title)}</h3>
    <p>${escapeHtml(pageTitles.get(block.page_slug) || block.page_slug)} · ${escapeHtml(block.section_key)} · order ${escapeHtml(block.sort_order)}</p>
    <p>${escapeHtml(block.body)}</p>
    <p>${block.is_published ? "Published" : "Hidden"}${
      block.section_key === "session_agenda"
        ? ` · ${block.extra?.agenda_pdf_url ? "PDF uploaded" : "No PDF uploaded"}`
        : ""
    }</p>
    <div class="record-actions">
      <button class="button button-quiet" type="button" data-edit-block="${escapeHtml(block.id)}" title="Load this card into the editor so you can change and save it">Edit card</button>
      <button class="button button-danger" type="button" data-delete-block="${escapeHtml(block.id)}" title="Permanently remove this card from Supabase and the website">Delete card</button>
    </div>
  </article>`;
}

$("#blockForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const formElement = event.currentTarget;
  const form = new FormData(formElement);
  let extra;
  try {
    extra = JSON.parse(String(form.get("extra") || "{}"));
  } catch {
    setDashboardStatus("Extra data must be valid JSON.", "error");
    return;
  }
  if (!extra || typeof extra !== "object" || Array.isArray(extra)) {
    setDashboardStatus("Extra data must be a JSON object.", "error");
    return;
  }
  const sectionKey = String(form.get("section_key") || "");
  const agendaPdfUrl = String(form.get("agenda_pdf_url") || "").trim();
  if (sectionKey === "session_agenda") {
    if (agendaPdfUrl) extra.agenda_pdf_url = agendaPdfUrl;
    else delete extra.agenda_pdf_url;
  } else {
    delete extra.agenda_pdf_url;
  }
  const id = String(form.get("id") || "");
  const payload = {
    page_slug: form.get("page_slug"),
    section_key: sectionKey,
    title: String(form.get("title") || "").trim(),
    body: String(form.get("body") || "").trim(),
    image_url: String(form.get("image_url") || "").trim() || null,
    extra,
    sort_order: Number(form.get("sort_order") || 0),
    is_published: form.get("is_published") === "on",
  };
  const query = id
    ? client.from("content_blocks").update(payload).eq("id", id)
    : client.from("content_blocks").insert(payload);
  const { error } = await query;
  if (error) {
    console.error("Could not save content card:", error);
    setDashboardStatus("Could not save the content card.", "error");
    return;
  }
  formElement.reset();
  formElement.elements.id.value = "";
  setDashboardStatus("Content card saved.", "success");
  await loadBlocks();
});

$("#blockForm").addEventListener("change", async (event) => {
  if (!(event.target instanceof Element)) return;
  const agendaUpload = event.target.closest("[data-agenda-pdf-upload-for]");
  const agendaFile = agendaUpload?.files?.[0];
  if (agendaUpload && agendaFile) {
    await uploadAgendaPdfIntoField(agendaUpload, agendaFile);
    return;
  }
  const upload = event.target.closest("[data-image-upload-for]");
  const file = upload?.files?.[0];
  if (!upload || !file) return;
  await uploadImageIntoField(upload, file);
});

const blockForm = $("#blockForm");
const agendaUploadFields = $("#agendaUploadFields");
const blockSectionField = blockForm.elements.namedItem("section_key");
function updateAgendaUploadFields() {
  agendaUploadFields.hidden = blockSectionField.value !== "session_agenda";
}
blockSectionField.addEventListener("change", updateAgendaUploadFields);
blockForm.addEventListener("reset", () =>
  requestAnimationFrame(updateAgendaUploadFields),
);
updateAgendaUploadFields();

$("#blocksList").addEventListener("click", async (event) => {
  const edit = event.target.closest("[data-edit-block]");
  const remove = event.target.closest("[data-delete-block]");
  if (edit) {
    const block = recordCache.get(`block:${edit.dataset.editBlock}`);
    if (!block) return;
    const form = $("#blockForm");
    for (const [key, value] of Object.entries(block)) {
      const field = form.elements.namedItem(key);
      if (!field) continue;
      if (key === "is_published") field.checked = value;
      else if (key === "extra") field.value = JSON.stringify(value, null, 2);
      else field.value = value ?? "";
    }
    form.elements.namedItem("agenda_pdf_url").value =
      block.extra?.agenda_pdf_url || "";
    updateAgendaUploadFields();
    form.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  if (remove) {
    if (
      !confirm(
        "Permanently delete this content card from Supabase and the public website?",
      )
    )
      return;
    const { error } = await client
      .from("content_blocks")
      .delete()
      .eq("id", remove.dataset.deleteBlock);
    if (error) {
      console.error("Could not delete content card:", error);
      setDashboardStatus("Could not delete the content card.", "error");
      return;
    }
    setDashboardStatus("Content card deleted.", "success");
    await loadBlocks();
  }
});

async function loadNavigation() {
  const { data, error } = await client
    .from("site_navigation_items")
    .select("*")
    .order("location")
    .order("sort_order");
  if (error) {
    console.error("Could not load navigation:", error);
    setDashboardStatus("Could not load navigation links.", "error");
    return;
  }
  $("#navigationList").innerHTML = data
    .map((item) => {
      recordCache.set(`navigation:${item.id}`, item);
      return `<article class="record-card">
        <h3>${escapeHtml(item.label)}</h3>
        <p>${escapeHtml(item.location)} · ${escapeHtml(item.href)} · order ${escapeHtml(item.sort_order)}</p>
        <p>${item.is_active ? "Visible" : "Hidden"}${item.is_cta ? " · Button style" : ""}</p>
        <div class="record-actions">
          <button class="button button-quiet" type="button" data-edit-navigation="${escapeHtml(item.id)}" title="Load this link into the editor so you can change and save it">Edit link</button>
          <button class="button button-danger" type="button" data-delete-navigation="${escapeHtml(item.id)}" title="Permanently remove this link from the public menu">Delete link</button>
        </div>
      </article>`;
    })
    .join("");
}

$("#navigationForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const formElement = event.currentTarget;
  const form = new FormData(formElement);
  const id = String(form.get("id") || "");
  const href = String(form.get("href") || "").trim();
  if (/^\s*(javascript|data):/i.test(href)) {
    setDashboardStatus("That link type is not allowed.", "error");
    return;
  }
  const payload = {
    location: form.get("location"),
    label: String(form.get("label") || "").trim(),
    href,
    sort_order: Number(form.get("sort_order") || 0),
    is_cta: form.get("is_cta") === "on",
    is_active: form.get("is_active") === "on",
  };
  const query = id
    ? client.from("site_navigation_items").update(payload).eq("id", id)
    : client.from("site_navigation_items").insert(payload);
  const { error } = await query;
  if (error) {
    console.error("Could not save navigation:", error);
    setDashboardStatus(
      "Could not save this link. Check for duplicate URLs.",
      "error",
    );
    return;
  }
  formElement.reset();
  formElement.elements.id.value = "";
  setDashboardStatus("Navigation saved.", "success");
  await loadNavigation();
});

$("#navigationList").addEventListener("click", async (event) => {
  const edit = event.target.closest("[data-edit-navigation]");
  const remove = event.target.closest("[data-delete-navigation]");
  if (edit) {
    const item = recordCache.get(`navigation:${edit.dataset.editNavigation}`);
    if (!item) return;
    const form = $("#navigationForm");
    for (const [key, value] of Object.entries(item)) {
      const field = form.elements.namedItem(key);
      if (!field) continue;
      if (["is_active", "is_cta"].includes(key)) field.checked = value;
      else field.value = value ?? "";
    }
    form.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  if (remove) {
    if (!confirm("Delete this navigation link?")) return;
    const { error } = await client
      .from("site_navigation_items")
      .delete()
      .eq("id", remove.dataset.deleteNavigation);
    if (error) {
      console.error("Could not delete navigation:", error);
      setDashboardStatus("Could not delete this link.", "error");
      return;
    }
    setDashboardStatus("Navigation link deleted.", "success");
    await loadNavigation();
  }
});

async function loadSettings() {
  const { data, error } = await client
    .from("site_settings")
    .select("setting_key, label, value, input_type, sort_order, is_public")
    .order("sort_order");
  if (error) {
    console.error("Could not load site settings:", error);
    setDashboardStatus("Could not load site settings.", "error");
    return;
  }
  const generalSettings = data.filter(
    (setting) =>
      ![
        "hero_image_url",
        "founders_count",
        "saturdays_count",
        "open_percent",
      ].includes(setting.setting_key),
  );
  $("#settingsEditor").innerHTML = generalSettings
    .map((setting) => {
      const socialToggle = setting.setting_key.startsWith("show_social_");
      const control = socialToggle
        ? `<input name="${escapeHtml(setting.setting_key)}" type="checkbox"${setting.value !== "false" ? " checked" : ""}>`
        : setting.input_type === "textarea"
          ? `<textarea name="${escapeHtml(setting.setting_key)}" rows="3">${escapeHtml(setting.value)}</textarea>`
          : `<input name="${escapeHtml(setting.setting_key)}" type="${escapeHtml(setting.input_type)}" value="${escapeHtml(setting.value)}">`;
      return `<label class="editor-field${socialToggle ? " check-field" : ""}">${escapeHtml(setting.label)}${control}</label>`;
    })
    .join("");
}

$("#settingsForm").addEventListener("change", async (event) => {
  const upload =
    event.target instanceof Element
      ? event.target.closest("[data-image-upload-for]")
      : null;
  const file = upload?.files?.[0];
  if (!upload || !file) return;
  await uploadImageIntoField(upload, file);
});

$("#settingsForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const fields = $$("[name]", $("#settingsEditor"));
  const payload = fields.map((field) => ({
    setting_key: field.name,
    value: field.type === "checkbox" ? String(field.checked) : field.value,
  }));
  if (!payload.length)
    return setDashboardStatus("There are no site settings to save.");
  const results = await Promise.all(
    payload.map((setting) =>
      client
        .from("site_settings")
        .update({ value: setting.value })
        .eq("setting_key", setting.setting_key),
    ),
  );
  const failed = results.find((result) => result.error);
  if (failed) {
    console.error("Could not save site settings:", failed.error);
    setDashboardStatus("Could not save site settings.", "error");
    return;
  }
  setDashboardStatus("Site settings saved.", "success");
});

function buildRecordFields(table) {
  const config = recordDefinitions[table];
  $("#recordFields").innerHTML = config.fields
    .map(([key, label, type, required]) => {
      if (type === "checkbox") {
        return `<label class="check-field"><input name="${key}" type="checkbox" checked>${escapeHtml(label)}</label>`;
      }
      const control =
        type === "textarea"
          ? `<textarea name="${key}" rows="3"${required ? " required" : ""}></textarea>`
          : `<input name="${key}" type="${type}"${key === "registration_redirect_url" ? ' placeholder="/thank-you.html or https://example.com/thank-you"' : ""}${required ? " required" : ""}>`;
      const upload = ["photo_url", "image_url"].includes(key)
        ? `<label class="upload-field wide">Upload ${table === "events" ? "flyer" : "image"}<input type="file" accept="image/*" data-image-upload-for="${key}"><small>Upload an image (up to 8 MB) to Supabase Storage. Saving the item publishes this image URL.</small></label>`
        : "";
      const help =
        key === "project_url"
          ? "<small>Optional link opened by the project card’s View project button.</small>"
          : key === "registration_redirect_url"
            ? "<small>Optional URL to open after someone successfully registers for this session.</small>"
            : key === "event_url"
              ? "<small>Optional public page or registration link for this event.</small>"
            : "";
      return `<label>${escapeHtml(label)}${control}${help}</label>${upload}`;
    })
    .join("");
}

function formatRecordValue(value) {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Published" : "Hidden";
  return String(value);
}

async function loadRecords() {
  activeRecordTable = $("#recordType").value;
  buildRecordFields(activeRecordTable);
  const { data, error } = await client
    .from(activeRecordTable)
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) {
    console.error(`Could not load ${activeRecordTable}:`, error);
    setDashboardStatus(
      `Could not load ${recordDefinitions[activeRecordTable].label}.`,
      "error",
    );
    return;
  }
  data.forEach((record) => recordCache.set(`record:${record.id}`, record));
  $("#recordList").innerHTML =
    data
      .map((record) => {
        const title =
          record.title || record.name || record.full_name || "Website record";
        const fields = recordDefinitions[activeRecordTable].fields
          .filter(([key]) => key !== "is_published")
          .map(
            ([key, label]) =>
              `<p><strong>${escapeHtml(label)}:</strong> ${escapeHtml(formatRecordValue(record[key]))}</p>`,
          )
          .join("");
        return `<article class="record-card">
        ${record.image_url || record.photo_url ? `<img class="record-image" src="${escapeHtml(record.image_url || record.photo_url)}" alt="" loading="lazy">` : ""}
        <h3>${escapeHtml(title)}</h3>
        ${fields}
        <p>${record.is_published ? "Published" : "Hidden"}</p>
        <div class="record-actions">
          <button class="button button-quiet" type="button" data-edit-record="${escapeHtml(record.id)}" title="Load this item into the form so you can change and save it">Edit item</button>
          <button class="button button-danger" type="button" data-delete-record="${escapeHtml(record.id)}" title="Permanently delete this item from Supabase and the public website">Delete item</button>
        </div>
      </article>`;
      })
      .join("") || '<p class="muted">No records yet.</p>';
}

$("#recordType").addEventListener("change", () => {
  const form = $("#recordForm");
  form.reset();
  form.elements.id.value = "";
  loadRecords();
});

$("#recordForm").addEventListener("change", async (event) => {
  const upload = event.target.closest("[data-image-upload-for]");
  const file = upload?.files?.[0];
  if (!upload || !file) return;
  await uploadImageIntoField(upload, file);
});

$("#recordForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const formData = new FormData(form);
  const config = recordDefinitions[activeRecordTable];
  const payload = {};
  for (const [key, , type] of config.fields) {
    const value = formData.get(key);
    if (type === "checkbox") payload[key] = value === "on";
    else if (type === "number") payload[key] = Number(value || 0);
    else if (type === "datetime-local")
      payload[key] = value ? new Date(String(value)).toISOString() : null;
    else payload[key] = String(value || "").trim() || null;
  }
  const id = String(formData.get("id") || "");
  const query = id
    ? client.from(activeRecordTable).update(payload).eq("id", id)
    : client.from(activeRecordTable).insert(payload);
  const { error } = await query;
  if (error) {
    console.error(`Could not save ${activeRecordTable}:`, error);
    setDashboardStatus("Could not save this record.", "error");
    return;
  }
  form.reset();
  form.elements.id.value = "";
  setDashboardStatus("Record saved.", "success");
  await loadRecords();
});

$("#recordList").addEventListener("click", async (event) => {
  const edit = event.target.closest("[data-edit-record]");
  const remove = event.target.closest("[data-delete-record]");
  if (edit) {
    const record = recordCache.get(`record:${edit.dataset.editRecord}`);
    if (!record) return;
    const form = $("#recordForm");
    form.elements.id.value = record.id;
    for (const [key, , type] of recordDefinitions[activeRecordTable].fields) {
      const field = form.elements.namedItem(key);
      if (!field) continue;
      if (type === "checkbox") field.checked = Boolean(record[key]);
      else if (type === "datetime-local") {
        const date = record[key] ? new Date(record[key]) : null;
        if (date && Number.isFinite(date.getTime())) {
          const localDate = new Date(
            date.getTime() - date.getTimezoneOffset() * 60_000,
          );
          field.value = localDate.toISOString().slice(0, 16);
        } else field.value = "";
      } else field.value = record[key] ?? "";
    }
    form.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  if (remove) {
    if (
      !confirm(
        "Permanently delete this item from Supabase and the public website?",
      )
    )
      return;
    const { error } = await client
      .from(activeRecordTable)
      .delete()
      .eq("id", remove.dataset.deleteRecord);
    if (error) {
      console.error(`Could not delete ${activeRecordTable}:`, error);
      setDashboardStatus("Could not delete this record.", "error");
      return;
    }
    setDashboardStatus("Record deleted.", "success");
    await loadRecords();
  }
});

$("#inboxType").addEventListener("change", loadInbox);

const inboxTableLabels = {
  messages: "Contact message",
  participants: "Session registration",
  event_registrations: "Event RSVP",
  volunteers: "Volunteer or partner application",
  profiles: "Member account",
};
const inboxFieldLabels = {
  age_group: "Age group",
  certificate_no: "Certificate number",
  course_completed: "Course completed",
  created_at: "Submitted",
  event_title: "Event",
  full_name: "Full name",
  member_no: "Member number",
  organisation: "Organisation",
  session_id: "Session reference",
};

function formatInboxValue(key, value) {
  if (key === "consent") return value ? "Consent given" : "Not given";
  if (value === null || value === undefined || value === "") return "Not provided";
  if (Array.isArray(value))
    return value.length
      ? `<span class="submission-chip-list">${value
          .map(
            (item) =>
              `<span class="submission-chip">${escapeHtml(item)}</span>`,
          )
          .join("")}</span>`
      : "Not provided";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "object") return escapeHtml(JSON.stringify(value));
  return escapeHtml(value);
}

function formatInboxDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? escapeHtml(value)
    : escapeHtml(
        new Intl.DateTimeFormat(undefined, {
          dateStyle: "medium",
          timeStyle: "short",
        }).format(date),
      );
}

async function loadInbox() {
  const table = $("#inboxType").value;
  const query = client.from(table).select("*");
  const { data, error } = await query
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) {
    console.error(`Could not load ${table}:`, error);
    setDashboardStatus("Could not load form submissions.", "error");
    return;
  }
  $("#inboxList").innerHTML =
    data
      .map((record) => {
        const title =
          record.subject ||
          record.full_name ||
          record.name ||
          record.email ||
          "Submission";
        const details = Object.entries(record)
          .filter(
            ([key]) =>
              !["id", "user_id", "created_at"].includes(key) &&
              !(table === "event_registrations" && key === "event_id"),
          )
          .map(([key, value]) => {
            const label =
              inboxFieldLabels[key] ||
              key
                .replace(/_/g, " ")
                .replace(/\b\w/g, (letter) => letter.toUpperCase());
            const wide =
              ["goals", "message", "availability"].includes(key) ||
              (typeof value === "string" && value.length > 100);
            return `<div class="submission-detail${wide ? " wide" : ""}"><dt>${escapeHtml(label)}</dt><dd>${formatInboxValue(key, value)}</dd></div>`;
          })
          .join("");
        const submittedAt = record.created_at
          ? `<time datetime="${escapeHtml(record.created_at)}">${formatInboxDate(record.created_at)}</time>`
          : "";
        const memberNumber = record.member_no
          ? `<span class="submission-reference">Member #${escapeHtml(record.member_no)}</span>`
          : "";
        return `<article class="record-card">
        <header class="submission-card-header">
          <div class="submission-identity">
            <span class="submission-marker" aria-hidden="true">${table === "profiles" ? "ID" : "IN"}</span>
            <div><p class="submission-type">${escapeHtml(inboxTableLabels[table] || "Submission")}</p><h3>${escapeHtml(title)}</h3></div>
          </div>
          ${memberNumber}
        </header>
        <dl class="submission-details">${details || '<div class="submission-detail"><dt>Details</dt><dd>No additional details provided.</dd></div>'}</dl>
        <footer class="submission-card-footer">
          ${submittedAt ? `<span class="submission-date">Received ${submittedAt}</span>` : "<span></span>"}
        ${
          table === "profiles"
            ? ""
            : `<div class="record-actions"><button class="button button-danger" type="button" data-delete-submission="${escapeHtml(record.id)}" title="Permanently delete this submission from Supabase">Delete submission</button></div>`
        }
        </footer>
      </article>`;
      })
      .join("") || '<p class="muted">No submissions yet.</p>';
}

$("#inboxList").addEventListener("click", async (event) => {
  const button = event.target.closest("[data-delete-submission]");
  if (!button || !confirm("Permanently delete this submission from Supabase?"))
    return;
  const table = $("#inboxType").value;
  const { error } = await client
    .from(table)
    .delete()
    .eq("id", button.dataset.deleteSubmission);
  if (error) {
    console.error(`Could not delete ${table} submission:`, error);
    setDashboardStatus("Could not delete this submission.", "error");
    return;
  }
  setDashboardStatus("Submission deleted.", "success");
  await loadInbox();
});

async function loadAdmins() {
  if (currentRole !== "super_admin") return;
  const { data, error } = await client.functions.invoke("invite-admin", {
    body: { action: "list" },
  });
  if (error) {
    console.error("Could not load admin accounts:", error);
    setDashboardStatus(
      "Could not load admin accounts. Check the invite-admin function deployment.",
      "error",
    );
    return;
  }
  $("#adminsList").innerHTML =
    (data.admins || [])
      .map(
        (admin) => `<article class="record-card">
        <h3>${escapeHtml(admin.email || admin.user_id)}</h3>
        <p>${escapeHtml(admin.role)} · added ${escapeHtml(new Date(admin.created_at).toLocaleDateString())}</p>
        ${
          admin.role === "admin"
            ? `<div class="record-actions"><button class="button button-danger" type="button" data-remove-admin="${escapeHtml(admin.user_id)}">Remove admin</button></div>`
            : ""
        }
      </article>`,
      )
      .join("") || '<p class="muted">No admin accounts were returned.</p>';
}

$("#inviteForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const email = String(new FormData(form).get("email") || "")
    .trim()
    .toLowerCase();
  const { data, error } = await client.functions.invoke("invite-admin", {
    body: { action: "invite", email },
  });
  if (error) {
    console.error("Could not invite admin:", error);
    setDashboardStatus(
      "Could not invite this admin. Check function deployment and permissions.",
      "error",
    );
    return;
  }
  setDashboardStatus(data.message, "success");
  form.reset();
  await loadAdmins();
});

$("#adminsList").addEventListener("click", async (event) => {
  const button = event.target.closest("[data-remove-admin]");
  if (!button || !confirm("Remove this user's admin access?")) return;
  const { data, error } = await client.functions.invoke("invite-admin", {
    body: { action: "remove", user_id: button.dataset.removeAdmin },
  });
  if (error) {
    console.error("Could not remove admin:", error);
    setDashboardStatus("Could not remove this admin.", "error");
    return;
  }
  setDashboardStatus(data.message, "success");
  await loadAdmins();
});

initialize();

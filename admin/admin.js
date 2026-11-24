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
  records: [
    "Website data",
    "Manage team, projects, sessions and gallery content.",
  ],
  inbox: ["Form inbox", "Review contact messages and visitor applications."],
  admins: ["Administrator access", "Invite and manage website administrators."],
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

async function openSection(section) {
  const [title, description] = sections[section] || sections.overview;
  $$("[data-tab]").forEach((tab) =>
    tab.classList.toggle("active", tab.dataset.tab === section),
  );
  $$("[data-panel]").forEach(
    (panel) => (panel.hidden = panel.dataset.panel !== section),
  );
  $("#sectionTitle").textContent = title;
  $("#sectionDescription").textContent = description;
  setDashboardStatus("");
  closeSidebar();
  await loadSection(section);
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
  if (section === "pages") return loadPagesPanel();
  if (section === "content") return loadContentEditor();
  if (section === "blocks") return loadBlocks();
  if (section === "navigation") return loadNavigation();
  if (section === "settings") return loadSettings();
  if (section === "records") return loadRecords();
  if (section === "inbox") return loadInbox();
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

async function loadOverview() {
  const collections = [
    ["Team members", "team_members"],
    ["Projects", "projects"],
    ["Sessions", "sessions"],
    ["Contact messages", "messages"],
    ["Session registrations", "participants"],
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
  $("#contentEditor").innerHTML = data
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
    <p>${block.is_published ? "Published" : "Hidden"}</p>
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
  const id = String(form.get("id") || "");
  const payload = {
    page_slug: form.get("page_slug"),
    section_key: form.get("section_key"),
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
  const upload = event.target.closest("[data-image-upload-for]");
  const file = upload?.files?.[0];
  if (!upload || !file) return;
  await uploadImageIntoField(upload, file);
});

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
  $("#settingsEditor").innerHTML = data
    .map((setting) => {
      const socialToggle = setting.setting_key.startsWith("show_social_");
      const control = socialToggle
        ? `<input name="${escapeHtml(setting.setting_key)}" type="checkbox"${setting.value !== "false" ? " checked" : ""}>`
        : setting.input_type === "textarea"
          ? `<textarea name="${escapeHtml(setting.setting_key)}" rows="3">${escapeHtml(setting.value)}</textarea>`
          : `<input name="${escapeHtml(setting.setting_key)}" type="${escapeHtml(setting.input_type)}" value="${escapeHtml(setting.value)}">`;
      if (setting.setting_key === "hero_image_url")
        return `<div class="editor-field"><label>${escapeHtml(setting.label)}${control}</label><label class="setting-upload">Upload replacement hero image<input type="file" accept="image/*" data-image-upload-for="hero_image_url"><small>Upload an image (up to 8 MB) to Supabase Storage, then save site settings to publish it.</small></label></div>`;
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
          : `<input name="${key}" type="${type}"${required ? " required" : ""}>`;
      const upload = ["photo_url", "image_url"].includes(key)
        ? `<label class="upload-field wide">Upload image<input type="file" accept="image/*" data-image-upload-for="${key}"><small>Upload an image (up to 8 MB) to Supabase Storage. Saving the item publishes this image URL.</small></label>`
        : "";
      return `<label>${escapeHtml(label)}${control}</label>${upload}`;
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
      else if (type === "datetime-local")
        field.value = record[key]
          ? new Date(record[key]).toISOString().slice(0, 16)
          : "";
      else field.value = record[key] ?? "";
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
        const body = escapeHtml(JSON.stringify(record, null, 2));
        return `<article class="record-card">
        <h3>${escapeHtml(title)}</h3>
        <pre>${body}</pre>
        ${
          table === "profiles"
            ? ""
            : `<div class="record-actions"><button class="button button-danger" type="button" data-delete-submission="${escapeHtml(record.id)}" title="Permanently delete this submission from Supabase">Delete submission</button></div>`
        }
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

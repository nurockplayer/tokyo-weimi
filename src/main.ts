import "./styles.css";
import { filterKeys, getCopy, getLanguageOption, languageOptions } from "./i18n.ts";
import { imageSrc } from "./media.ts";
import { contact, heroImages, hotels, profiles } from "./site-data.ts";
import type { Dictionary, FilterKey, LanguageCode, Profile, ProfileCopy } from "./types.ts";

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) throw new Error("Missing #app root");

const phoneLink = `tel:${contact.phone.replaceAll("-", "")}`;
const languageStorageKey = "tokyo-weimi-language";
const protectedImageAttributes = `data-protected-media draggable="false"`;
const languageRoutes: Record<string, LanguageCode> = {
  "/zh-hant/": "zh-Hant",
  "/zh-hans/": "zh-Hans",
  "/ja/": "ja",
  "/ko/": "ko",
  "/en/": "en",
};
const filterRules = {
  japanese: (profile: Profile) => profile.tags.includes("日本人") || profile.title.includes("日本人"),
  china: (profile: Profile) => profile.origin === "中國" || profile.tags.includes("中國"),
  newcomer: (profile: Profile) => profile.tags.includes("新人") || profile.title.includes("新人"),
  recommended: (profile: Profile) => ["推薦", "人氣", "好評"].some((tag) => profile.tags.includes(tag)),
  premium: (profile: Profile) => profile.tags.includes("高級") || profile.title.includes("高級") || profile.title.includes("AV 女優"),
  room: (profile: Profile) => profile.tags.includes("提供房間") || profile.title.includes("提供房間"),
} satisfies Record<Exclude<FilterKey, "all">, (profile: Profile) => boolean>;

let activeFilter: FilterKey = "all";
let query = "";
const storedLanguage = localStorage.getItem(languageStorageKey) as LanguageCode | null;
const routedLanguage = languageRoutes[window.location.pathname];
let currentLanguage: LanguageCode =
  routedLanguage || (languageOptions.some((option) => option.code === storedLanguage) ? storedLanguage! : "zh-Hant");

const currentCopy = () => getCopy(currentLanguage);
const currentLanguageOption = () => getLanguageOption(currentLanguage);

const updateDocumentLanguage = (copy: Dictionary) => {
  document.documentElement.lang = currentLanguageOption().htmlLang;
  document.title = copy.meta.title;
  document.querySelector('meta[name="description"]')?.setAttribute("content", copy.meta.description);
};

const trackEvent = (eventName: string, detail: Record<string, unknown> = {}) => {
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push({
    event: eventName,
    language: currentLanguage,
    ...detail,
  });
};

const formatDate = (date: string) =>
  new Intl.DateTimeFormat(currentLanguageOption().locale, {
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(date));

const formatPhotoCount = (count: number, copy: Dictionary) =>
  ["ja", "ko"].includes(currentLanguage) ? `${count}${copy.labels.photos}` : `${count} ${copy.labels.photos}`;

const getProfileCopy = (profile: Profile, copy: Dictionary = currentCopy()): Profile & ProfileCopy => ({
  ...profile,
  ...(copy.profiles[profile.id] || {}),
});

const getPhotoAria = (index: number, copy: Dictionary) => {
  const number = index + 1;
  if (currentLanguage.startsWith("zh")) return `${copy.labels.viewPhoto} ${number} ${copy.labels.photoOrdinalSuffix}`;
  if (currentLanguage === "en") return `${copy.labels.viewPhoto} ${number}`;
  return `${copy.labels.viewPhoto} ${number} ${copy.labels.photoOrdinalSuffix}`;
};

const profileMatches = (profile: Profile) => {
  const profileText = getProfileCopy(profile);
  const haystack = `${profile.name} ${profile.title} ${profile.origin} ${profile.tags.join(" ")} ${profile.summary} ${profileText.title} ${profileText.origin} ${profileText.tags.join(" ")} ${profileText.summary}`;
  const filterOk = activeFilter === "all" ? true : filterRules[activeFilter](profile);
  const queryOk = !query || haystack.toLowerCase().includes(query.toLowerCase());
  return filterOk && queryOk;
};

const renderLanguageSwitcher = () => {
  const copy = currentCopy();
  return `
    <label class="language-switcher">
      <span>${copy.languageAria}</span>
      <select data-language-select aria-label="${copy.languageAria}">
        ${languageOptions
          .map(
            (option) =>
              `<option value="${option.code}" ${option.code === currentLanguage ? "selected" : ""}>${option.label}</option>`,
          )
          .join("")}
      </select>
    </label>
  `;
};

const renderNav = () => {
  const copy = currentCopy();
  return `
  <header class="site-header">
    <a class="brand-mark" href="#top" aria-label="${copy.homeAria}">
      <span>TW</span>
      <strong>${copy.brand}</strong>
    </a>
    <nav aria-label="${copy.navAria}">
      ${copy.nav.map(([id, label]) => `<a href="#${id}">${label}</a>`).join("")}
    </nav>
    ${renderLanguageSwitcher()}
    <a class="header-call" href="${phoneLink}">${contact.phone}</a>
  </header>
`;
};

const renderHero = () => {
  const copy = currentCopy();
  return `
  <section class="hero" id="top" aria-label="${copy.hero.label}">
    <div class="hero-media" aria-hidden="true">
      ${heroImages.map((image, index) => `<img ${protectedImageAttributes} src="${imageSrc(image)}" alt="" style="--delay: ${index * 120}ms" />`).join("")}
    </div>
    <div class="hero-shade"></div>
    <div class="hero-content">
      <p class="eyebrow">${copy.hero.eyebrow}</p>
      <h1>${copy.hero.title}</h1>
      <p class="hero-copy">${copy.hero.copy}</p>
      <div class="hero-actions">
        <a class="button primary" data-track="hero_view_today" href="#today">${copy.actions.viewToday}</a>
        <a class="button ghost" data-track="hero_call" href="${phoneLink}">${copy.actions.call}</a>
      </div>
    </div>
    <div class="hero-status" aria-label="${copy.hero.statusAria}">
      <span>${copy.hero.daily}</span>
      <span>${copy.hero.phonePrefix} ${contact.phone}</span>
      <span>${copy.contact.area}</span>
    </div>
  </section>
`;
};

const renderIntro = () => {
  const copy = currentCopy();
  return `
  <section class="intro-band" aria-label="${copy.intro.title}">
    <div>
      <span class="section-kicker">${copy.intro.kicker}</span>
      <h2>${copy.intro.title}</h2>
    </div>
    <p>${copy.intro.copy}</p>
  </section>
`;
};

const renderFilters = () => {
  const copy = currentCopy();
  return `
  <div class="tool-row">
    <div class="filter-group" role="group" aria-label="${copy.labels.filterAria}">
      ${filterKeys
        .map(
          (filter) => `
            <button class="filter-button ${filter === activeFilter ? "is-active" : ""}" data-filter="${filter}" type="button">
              ${copy.filters[filter]}
            </button>`,
        )
        .join("")}
    </div>
    <label class="search-box">
      <span>${copy.labels.search}</span>
      <input type="search" placeholder="${copy.labels.searchPlaceholder}" value="${query}" />
    </label>
  </div>
`;
};

const renderProfileCard = (profile: Profile) => {
  const copy = currentCopy();
  const profileText = getProfileCopy(profile, copy);
  const photoTotal = profile.gallery?.length || 1;
  return `
  <article class="profile-card">
    <div class="profile-image">
      <img ${protectedImageAttributes} src="${imageSrc(profile.image)}" alt="${profile.name} ${profileText.title}" loading="lazy" />
      <span class="date-badge">${formatDate(profile.date)} ${copy.labels.updated}</span>
      <span class="photo-badge">${formatPhotoCount(photoTotal, copy)}</span>
    </div>
    <div class="profile-body">
      <div class="profile-heading">
        <div>
          <p>${profileText.title}</p>
          <h3>${profile.name}</h3>
        </div>
        <strong>${profileText.origin}</strong>
      </div>
      <dl class="profile-specs">
        <div><dt>${copy.labels.age}</dt><dd>${profile.age}</dd></div>
        <div><dt>${copy.labels.height}</dt><dd>${profile.height}</dd></div>
        <div><dt>${copy.labels.weight}</dt><dd>${profile.weight}</dd></div>
        <div><dt>${copy.labels.cup}</dt><dd>${profile.cup}</dd></div>
      </dl>
      <p class="profile-summary">${profileText.summary}</p>
      <div class="tag-row">${profileText.tags.map((tag) => `<span>${tag}</span>`).join("")}</div>
      <div class="price-line">${profileText.price}</div>
      <div class="card-actions">
        <a class="button small primary" data-track="profile_call" data-track-profile="${profile.id}" href="${phoneLink}">${copy.actions.call}</a>
        <button class="button small ghost" data-profile="${profile.id}" type="button">${copy.actions.viewInfo}</button>
      </div>
    </div>
  </article>
`;
};

const renderProfiles = () => {
  const copy = currentCopy();
  const filtered = profiles.filter(profileMatches);
  return `
    <section class="content-section" id="today">
      <div class="section-head">
        <span class="section-kicker">${copy.sections.todayKicker}</span>
        <h2>${copy.sections.todayTitle}</h2>
        <p>${copy.sections.todayCopy}</p>
      </div>
      ${renderFilters()}
      <div class="profile-grid">
        ${
          filtered.length
            ? filtered.map(renderProfileCard).join("")
            : `<p class="empty-state">${copy.labels.empty}</p>`
        }
      </div>
    </section>
  `;
};

const renderPrices = () => {
  const copy = currentCopy();
  return `
  <section class="content-section split-section" id="price">
    <div class="section-head">
      <span class="section-kicker">${copy.sections.priceKicker}</span>
      <h2>${copy.sections.priceTitle}</h2>
      <p>${copy.sections.priceCopy}</p>
    </div>
    <div class="price-grid">
      ${copy.pricePlans
        .map(
          (plan) => `
            <article class="price-card">
              <h3>${plan.name}</h3>
              <p>${plan.note}</p>
              <ul>${plan.rows.map((row) => `<li>${row}</li>`).join("")}</ul>
            </article>
          `,
        )
        .join("")}
    </div>
  </section>
`;
};

const renderHotels = () => {
  const copy = currentCopy();
  return `
  <section class="content-section" id="hotels">
    <div class="section-head">
      <span class="section-kicker">${copy.sections.hotelsKicker}</span>
      <h2>${copy.sections.hotelsTitle}</h2>
      <p>${copy.sections.hotelsCopy}</p>
    </div>
    <div class="hotel-grid">
      ${hotels
        .map(
          (hotel) => `
            <article class="hotel-card">
              <img ${protectedImageAttributes} src="${imageSrc(hotel.image)}" alt="${copy.hotelArea} ${copy.labels.hotelAlt}" loading="lazy" />
              <div>
                <span>${copy.hotelArea}</span>
                <h3>${hotel.address}</h3>
              </div>
            </article>
          `,
        )
        .join("")}
    </div>
  </section>
`;
};

const renderContact = () => {
  const copy = currentCopy();
  return `
  <section class="contact-section" id="contact">
    <div>
      <span class="section-kicker">${copy.sections.contactKicker}</span>
      <h2>${copy.sections.contactTitle}</h2>
      <p>${copy.sections.contactCopy}</p>
    </div>
    <div class="contact-panel">
      <a class="phone-number" href="${phoneLink}">${contact.phone}</a>
      <dl>
        <div><dt>${copy.labels.serviceArea}</dt><dd>${copy.contact.area}</dd></div>
        <div><dt>LINE</dt><dd><a data-track="contact_line_1" href="${contact.line}" target="_blank" rel="noreferrer">${copy.contact.lineOne}</a> / <a data-track="contact_line_2" href="${contact.secondaryLine}" target="_blank" rel="noreferrer">${copy.contact.lineTwo}</a></dd></div>
        <div><dt>WeChat</dt><dd>${copy.contact.wechat}</dd></div>
        <div><dt>${copy.labels.updateFrequency}</dt><dd>${copy.contact.hours}</dd></div>
      </dl>
    </div>
    <div class="contact-qr-grid">
      <article class="qr-card">
        <img ${protectedImageAttributes} src="${imageSrc(contact.lineQr)}" alt="${copy.labels.qrAltMain}" loading="lazy" />
        <div>
          <span>LINE</span>
          <h3>${copy.contact.lineOne}</h3>
          <a data-track="qr_line_1" href="${contact.line}" target="_blank" rel="noreferrer">${copy.actions.openLine}</a>
        </div>
      </article>
      <article class="qr-card">
        <img ${protectedImageAttributes} src="${imageSrc(contact.secondaryLineQr)}" alt="${copy.labels.qrAltSecond}" loading="lazy" />
        <div>
          <span>LINE</span>
          <h3>${copy.contact.lineTwo}</h3>
          <a data-track="qr_line_2" href="${contact.secondaryLine}" target="_blank" rel="noreferrer">${copy.actions.openLine}</a>
        </div>
      </article>
    </div>
  </section>
`;
};

const renderExchange = () => {
  const copy = currentCopy();
  return `
  <section class="exchange-band" id="exchange">
    <div>
      <span class="section-kicker">${copy.sections.exchangeKicker}</span>
      <h2>${copy.sections.exchangeTitle}</h2>
    </div>
    <p>${copy.sections.exchangeCopy}</p>
  </section>
`;
};

const renderAgeGate = () => {
  const copy = currentCopy();
  return `
  <div class="age-gate" role="dialog" aria-modal="true" aria-labelledby="age-title">
    <div class="age-panel">
      <div class="age-language">${renderLanguageSwitcher()}</div>
      <span class="section-kicker">${copy.ageGate.kicker}</span>
      <h2 id="age-title">${copy.ageGate.title}</h2>
      <p>${copy.ageGate.copy}</p>
      <div class="age-actions">
        <button class="button primary" data-age-confirm type="button">${copy.actions.confirmAge}</button>
        <a class="button ghost" href="https://www.google.com/">${copy.actions.leave}</a>
      </div>
    </div>
  </div>
`;
};

const renderModal = () => {
  const copy = currentCopy();
  return `
  <dialog class="profile-dialog">
    <button class="dialog-close" aria-label="${copy.labels.close}" type="button">×</button>
    <div class="dialog-content"></div>
  </dialog>
`;
};

const renderFooter = () => {
  const copy = currentCopy();
  return `
  <footer class="site-footer">
    <div>
      <p>${copy.footer.title}</p>
      <span>${copy.footer.copy}</span>
    </div>
    <nav aria-label="${copy.footer.title}">
      <a href="/privacy.html">${copy.footer.privacy}</a>
      <a href="/disclaimer.html">${copy.footer.disclaimer}</a>
    </nav>
  </footer>
  <div class="sticky-actions">
    <a class="sticky-call" data-track="sticky_call" href="${phoneLink}">${copy.actions.call}</a>
    <a data-track="sticky_line_1" href="${contact.line}" target="_blank" rel="noreferrer">${copy.contact.lineOne}</a>
    <a data-track="sticky_line_2" href="${contact.secondaryLine}" target="_blank" rel="noreferrer">${copy.contact.lineTwo}</a>
  </div>
`;
};

const renderApp = () => {
  const copy = currentCopy();
  updateDocumentLanguage(copy);
  app.innerHTML = `
    ${renderNav()}
    <main>
      ${renderHero()}
      ${renderIntro()}
      ${renderProfiles()}
      ${renderPrices()}
      ${renderHotels()}
      ${renderContact()}
      ${renderExchange()}
    </main>
    ${renderFooter()}
    ${renderModal()}
    ${localStorage.getItem("tokyo-weimi-age-ok") ? "" : renderAgeGate()}
  `;
  bindEvents();
};

const openProfile = (id: string | undefined) => {
  if (!id) return;
  const profile = profiles.find((item) => item.id === id);
  if (!profile) return;
  const copy = currentCopy();
  const profileText = getProfileCopy(profile, copy);
  const gallery = profile.gallery?.length ? profile.gallery : [profile.image];
  const dialog = document.querySelector<HTMLDialogElement>(".profile-dialog");
  const content = dialog?.querySelector<HTMLElement>(".dialog-content");
  if (!dialog || !content) return;
  const firstImage = gallery[0] || profile.image;
  content.innerHTML = `
    <div class="dialog-gallery">
      <img class="dialog-main-image" ${protectedImageAttributes} data-gallery-main src="${imageSrc(firstImage)}" alt="${profile.name} ${profileText.title}" />
      <div class="dialog-thumbs" aria-label="${profile.name} ${copy.labels.lineGallery}">
        ${gallery
          .map(
            (image, index) => `
              <button class="${index === 0 ? "is-active" : ""}" data-gallery-image="${image}" type="button" aria-label="${getPhotoAria(index, copy)}">
                <img ${protectedImageAttributes} src="${imageSrc(image)}" alt="" loading="lazy" />
              </button>
            `,
          )
          .join("")}
      </div>
    </div>
    <div>
      <span class="section-kicker">${formatDate(profile.date)} ${copy.labels.updated}</span>
      <h2>${profile.name}｜${profileText.title}</h2>
      <p>${profileText.summary}</p>
      <p class="gallery-count">${formatPhotoCount(gallery.length, copy)}</p>
      <dl class="dialog-specs">
        <div><dt>${copy.labels.hometown}</dt><dd>${profileText.origin}</dd></div>
        <div><dt>${copy.labels.age}</dt><dd>${profile.age}</dd></div>
        <div><dt>${copy.labels.height}</dt><dd>${profile.height}</dd></div>
        <div><dt>${copy.labels.weight}</dt><dd>${profile.weight}</dd></div>
        <div><dt>${copy.labels.cup}</dt><dd>${profile.cup}</dd></div>
      </dl>
      <p class="price-line">${profileText.price}</p>
      <div class="dialog-actions">
        <a class="button primary" data-track="dialog_call" data-track-profile="${profile.id}" href="${phoneLink}">${copy.actions.call}</a>
      </div>
    </div>
  `;
  dialog.showModal();
  content.querySelectorAll<HTMLButtonElement>("[data-gallery-image]").forEach((button) => {
    button.addEventListener("click", () => {
      const mainImage = content.querySelector<HTMLImageElement>("[data-gallery-main]");
      const imageId = button.dataset.galleryImage;
      if (mainImage && imageId) mainImage.src = imageSrc(imageId);
      content
        .querySelectorAll<HTMLButtonElement>("[data-gallery-image]")
        .forEach((item) => item.classList.toggle("is-active", item === button));
    });
  });
};

const bindEvents = () => {
  document.querySelectorAll<HTMLSelectElement>("[data-language-select]").forEach((select) => select.addEventListener("change", (event) => {
    currentLanguage = (event.currentTarget as HTMLSelectElement).value as LanguageCode;
    localStorage.setItem(languageStorageKey, currentLanguage);
    renderApp();
  }));

  document.querySelectorAll<HTMLButtonElement>("[data-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      const filter = button.dataset.filter as FilterKey | undefined;
      if (!filter) return;
      activeFilter = filter;
      renderApp();
      document.querySelector("#today")?.scrollIntoView({ block: "start" });
    });
  });

  document.querySelector<HTMLInputElement>(".search-box input")?.addEventListener("input", (event) => {
    const copy = currentCopy();
    query = (event.currentTarget as HTMLInputElement).value;
    const filtered = profiles.filter(profileMatches);
    const profileGrid = document.querySelector<HTMLElement>(".profile-grid");
    if (profileGrid) {
      profileGrid.innerHTML = filtered.length
        ? filtered.map(renderProfileCard).join("")
        : `<p class="empty-state">${copy.labels.empty}</p>`;
    }
    bindProfileButtons();
  });

  bindProfileButtons();

  document.querySelectorAll<HTMLElement>("[data-track]").forEach((element) => {
    element.addEventListener("click", () => {
      trackEvent(element.dataset.track || "unknown_click", {
        profile: element.dataset.trackProfile,
        href: element.getAttribute("href"),
      });
    });
  });

  document.querySelector("[data-age-confirm]")?.addEventListener("click", () => {
    localStorage.setItem("tokyo-weimi-age-ok", "1");
    document.querySelector(".age-gate")?.remove();
  });

  const dialog = document.querySelector<HTMLDialogElement>(".profile-dialog");
  document.querySelector<HTMLButtonElement>(".dialog-close")?.addEventListener("click", () => dialog?.close());
  dialog?.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });
};

const bindProfileButtons = () => {
  document.querySelectorAll<HTMLButtonElement>("[data-profile]").forEach((button) => {
    button.addEventListener("click", () => {
      trackEvent("profile_view", { profile: button.dataset.profile });
      openProfile(button.dataset.profile);
    });
  });
};

const protectedMediaSelector = "[data-protected-media], .profile-image, .hero-media, .hotel-card, .dialog-gallery";

const isProtectedMediaEvent = (event: Event) =>
  event.target instanceof Element && Boolean(event.target.closest(protectedMediaSelector));

const preventProtectedMediaAction = (event: Event) => {
  if (isProtectedMediaEvent(event)) event.preventDefault();
};

document.addEventListener("contextmenu", preventProtectedMediaAction, { capture: true });
document.addEventListener("dragstart", preventProtectedMediaAction, { capture: true });
document.addEventListener("selectstart", preventProtectedMediaAction, { capture: true });

renderApp();

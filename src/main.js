import { contact, heroImages, hotels, navItems, pricePlans, profiles } from "./site-data.js";

const app = document.querySelector("#app");
const phoneLink = `tel:${contact.phone.replaceAll("-", "")}`;
const filterSet = ["全部", "日本人", "中國", "新人", "推薦", "高級", "提供房間"];

let activeFilter = "全部";
let query = "";

const formatDate = (date) =>
  new Intl.DateTimeFormat("zh-TW", {
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(date));

const profileMatches = (profile) => {
  const haystack = `${profile.name} ${profile.title} ${profile.origin} ${profile.tags.join(" ")}`;
  const filterOk = activeFilter === "全部" || haystack.includes(activeFilter);
  const queryOk = !query || haystack.toLowerCase().includes(query.toLowerCase());
  return filterOk && queryOk;
};

const renderNav = () => `
  <header class="site-header">
    <a class="brand-mark" href="#top" aria-label="回到首頁">
      <span>TW</span>
      <strong>東京維密天使</strong>
    </a>
    <nav aria-label="主選單">
      ${navItems.map(([id, label]) => `<a href="#${id}">${label}</a>`).join("")}
    </nav>
    <a class="header-call" href="${phoneLink}">${contact.phone}</a>
  </header>
`;

const renderHero = () => `
  <section class="hero" id="top" aria-label="東京維密天使">
    <div class="hero-media" aria-hidden="true">
      ${heroImages.map((image, index) => `<img src="${image}" alt="" style="--delay: ${index * 120}ms" />`).join("")}
    </div>
    <div class="hero-shade"></div>
    <div class="hero-content">
      <p class="eyebrow">Tokyo / Ikebukuro / Reservation</p>
      <h1>東京維密天使</h1>
      <p class="hero-copy">
        今日出勤、價格、推薦飯店與聯絡方式集中整理。每日更新檔期資訊，
        讓預約流程更快、更清楚，也更方便在手機上瀏覽。
      </p>
      <div class="hero-actions">
        <a class="button primary" href="#today">查看今日出勤</a>
        <a class="button ghost" href="${phoneLink}">電話預約</a>
      </div>
    </div>
    <div class="hero-status" aria-label="網站狀態">
      <span>每日更新</span>
      <span>預約專線 ${contact.phone}</span>
      <span>${contact.area}</span>
    </div>
  </section>
`;

const renderIntro = () => `
  <section class="intro-band" aria-label="預約提醒">
    <div>
      <span class="section-kicker">Notice</span>
      <h2>出勤資訊、價格與聯絡方式集中整理。</h2>
    </div>
    <p>
      預約建議直接電話確認；LINE 與 QR 碼可快速加入。部分檔期與價格會依日期、
      人選與飯店安排變動，請以客服確認後的當日資訊為準。
    </p>
  </section>
`;

const renderFilters = () => `
  <div class="tool-row">
    <div class="filter-group" role="group" aria-label="篩選出勤">
      ${filterSet
        .map(
          (filter) =>
            `<button class="filter-button ${filter === activeFilter ? "is-active" : ""}" data-filter="${filter}" type="button">${filter}</button>`,
        )
        .join("")}
    </div>
    <label class="search-box">
      <span>搜尋</span>
      <input type="search" placeholder="輸入名稱、地區或標籤" value="${query}" />
    </label>
  </div>
`;

const renderProfileCard = (profile) => `
  <article class="profile-card">
    <div class="profile-image">
      <img src="${profile.image}" alt="${profile.name} ${profile.title}" loading="lazy" />
      <span class="date-badge">${formatDate(profile.date)} 更新</span>
      <span class="photo-badge">${profile.gallery?.length || 1} 張照片</span>
    </div>
    <div class="profile-body">
      <div class="profile-heading">
        <div>
          <p>${profile.title}</p>
          <h3>${profile.name}</h3>
        </div>
        <strong>${profile.origin}</strong>
      </div>
      <dl class="profile-specs">
        <div><dt>年齡</dt><dd>${profile.age}</dd></div>
        <div><dt>身高</dt><dd>${profile.height}</dd></div>
        <div><dt>體重</dt><dd>${profile.weight}</dd></div>
        <div><dt>罩杯</dt><dd>${profile.cup}</dd></div>
      </dl>
      <p class="profile-summary">${profile.summary}</p>
      <div class="tag-row">${profile.tags.map((tag) => `<span>${tag}</span>`).join("")}</div>
      <div class="price-line">${profile.price}</div>
      <div class="card-actions">
        <a class="button small primary" href="${phoneLink}">電話預約</a>
        <button class="button small ghost" data-profile="${profile.id}" type="button">查看資訊</button>
      </div>
    </div>
  </article>
`;

const renderProfiles = () => {
  const filtered = profiles.filter(profileMatches);
  return `
    <section class="content-section" id="today">
      <div class="section-head">
        <span class="section-kicker">Today</span>
        <h2>今日出勤</h2>
        <p>近期可預約名單支援標籤篩選、關鍵字搜尋與快速電話預約。</p>
      </div>
      ${renderFilters()}
      <div class="profile-grid">
        ${
          filtered.length
            ? filtered.map(renderProfileCard).join("")
            : `<p class="empty-state">沒有符合條件的出勤資料，換個關鍵字試試。</p>`
        }
      </div>
    </section>
  `;
};

const renderPrices = () => `
  <section class="content-section split-section" id="price">
    <div class="section-head">
      <span class="section-kicker">Pricing</span>
      <h2>價格表</h2>
      <p>依近期出勤資訊整理常見方案，實際金額請於預約時再次確認。</p>
    </div>
    <div class="price-grid">
      ${pricePlans
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

const renderHotels = () => `
  <section class="content-section" id="hotels">
    <div class="section-head">
      <span class="section-kicker">Hotels</span>
      <h2>推薦飯店</h2>
      <p>池袋周邊常用地點與地址資訊，方便預約前確認集合安排。</p>
    </div>
    <div class="hotel-grid">
      ${hotels
        .map(
          (hotel) => `
            <article class="hotel-card">
              <img src="${hotel.image}" alt="${hotel.area} 推薦飯店" loading="lazy" />
              <div>
                <span>${hotel.area}</span>
                <h3>${hotel.address}</h3>
              </div>
            </article>
          `,
        )
        .join("")}
    </div>
  </section>
`;

const renderContact = () => `
  <section class="contact-section" id="contact">
    <div>
      <span class="section-kicker">Contact</span>
      <h2>聯絡方式</h2>
      <p>近期通訊狀態可能變動，建議優先電話預約，確認檔期、價格與集合方式。也可使用 LINE 1號或 LINE 2號加入客服。</p>
    </div>
    <div class="contact-panel">
      <a class="phone-number" href="${phoneLink}">${contact.phone}</a>
      <dl>
        <div><dt>服務區域</dt><dd>${contact.area}</dd></div>
        <div><dt>LINE</dt><dd><a href="${contact.line}" target="_blank" rel="noreferrer">LINE 1號</a> / <a href="${contact.secondaryLine}" target="_blank" rel="noreferrer">LINE 2號</a></dd></div>
        <div><dt>WeChat</dt><dd>${contact.wechat}</dd></div>
        <div><dt>更新頻率</dt><dd>${contact.hours}</dd></div>
      </dl>
    </div>
    <div class="contact-qr-grid">
      <article class="qr-card">
        <img src="${contact.lineQr}" alt="LINE 官方 QR Code" loading="lazy" />
        <div>
          <span>LINE</span>
          <h3>LINE 1號</h3>
          <a href="${contact.line}" target="_blank" rel="noreferrer">開啟 LINE</a>
        </div>
      </article>
      <article class="qr-card">
        <img src="${contact.secondaryLineQr}" alt="LINE 2號 QR Code" loading="lazy" />
        <div>
          <span>LINE</span>
          <h3>LINE 2號</h3>
          <a href="${contact.secondaryLine}" target="_blank" rel="noreferrer">開啟 LINE</a>
        </div>
      </article>
    </div>
  </section>
`;

const renderExchange = () => `
  <section class="exchange-band" id="exchange">
    <div>
      <span class="section-kicker">Exchange</span>
      <h2>外幣兌換</h2>
    </div>
    <p>
      外幣兌換資訊請直接向客服確認當日匯率、可兌幣別與預約方式。
      後續可依營運需求加入即時匯率與預約表單。
    </p>
  </section>
`;

const renderAgeGate = () => `
  <div class="age-gate" role="dialog" aria-modal="true" aria-labelledby="age-title">
    <div class="age-panel">
      <span class="section-kicker">Age Check</span>
      <h2 id="age-title">請確認你已達法定年齡</h2>
      <p>本網站整理成人預約資訊，未滿 20 歲或不適合瀏覽者請離開。</p>
      <div class="age-actions">
        <button class="button primary" data-age-confirm type="button">我已滿 20 歲</button>
        <a class="button ghost" href="https://www.google.com/">離開</a>
      </div>
    </div>
  </div>
`;

const renderModal = () => `
  <dialog class="profile-dialog">
    <button class="dialog-close" aria-label="關閉" type="button">×</button>
    <div class="dialog-content"></div>
  </dialog>
`;

const renderFooter = () => `
  <footer class="site-footer">
    <p>Tokyo Weimi Angels</p>
    <span>Tokyo reservation information, updated for mobile browsing.</span>
  </footer>
  <a class="sticky-call" href="${phoneLink}">電話預約 ${contact.phone}</a>
`;

const renderApp = () => {
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

const openProfile = (id) => {
  const profile = profiles.find((item) => item.id === id);
  const gallery = profile.gallery?.length ? profile.gallery : [profile.image];
  const dialog = document.querySelector(".profile-dialog");
  const content = dialog.querySelector(".dialog-content");
  content.innerHTML = `
    <div class="dialog-gallery">
      <img class="dialog-main-image" data-gallery-main src="${gallery[0]}" alt="${profile.name} ${profile.title}" />
      <div class="dialog-thumbs" aria-label="${profile.name} 圖片集">
        ${gallery
          .map(
            (image, index) => `
              <button class="${index === 0 ? "is-active" : ""}" data-gallery-image="${image}" type="button" aria-label="查看第 ${index + 1} 張照片">
                <img src="${image}" alt="" loading="lazy" />
              </button>
            `,
          )
          .join("")}
      </div>
    </div>
    <div>
      <span class="section-kicker">${formatDate(profile.date)} 更新</span>
      <h2>${profile.name}｜${profile.title}</h2>
      <p>${profile.summary}</p>
      <p class="gallery-count">${gallery.length} 張照片</p>
      <dl class="dialog-specs">
        <div><dt>家鄉</dt><dd>${profile.origin}</dd></div>
        <div><dt>年齡</dt><dd>${profile.age}</dd></div>
        <div><dt>身高</dt><dd>${profile.height}</dd></div>
        <div><dt>體重</dt><dd>${profile.weight}</dd></div>
        <div><dt>罩杯</dt><dd>${profile.cup}</dd></div>
      </dl>
      <p class="price-line">${profile.price}</p>
      <a class="button primary" href="${phoneLink}">電話預約</a>
    </div>
  `;
  dialog.showModal();
  content.querySelectorAll("[data-gallery-image]").forEach((button) => {
    button.addEventListener("click", () => {
      const mainImage = content.querySelector("[data-gallery-main]");
      mainImage.src = button.dataset.galleryImage;
      content
        .querySelectorAll("[data-gallery-image]")
        .forEach((item) => item.classList.toggle("is-active", item === button));
    });
  });
};

const bindEvents = () => {
  document.querySelectorAll("[data-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      activeFilter = button.dataset.filter;
      renderApp();
      document.querySelector("#today").scrollIntoView({ block: "start" });
    });
  });

  document.querySelector(".search-box input")?.addEventListener("input", (event) => {
    query = event.target.value;
    const filtered = profiles.filter(profileMatches);
    document.querySelector(".profile-grid").innerHTML = filtered.length
      ? filtered.map(renderProfileCard).join("")
      : `<p class="empty-state">沒有符合條件的出勤資料，換個關鍵字試試。</p>`;
    bindProfileButtons();
  });

  bindProfileButtons();

  document.querySelector("[data-age-confirm]")?.addEventListener("click", () => {
    localStorage.setItem("tokyo-weimi-age-ok", "1");
    document.querySelector(".age-gate")?.remove();
  });

  const dialog = document.querySelector(".profile-dialog");
  document.querySelector(".dialog-close")?.addEventListener("click", () => dialog.close());
  dialog?.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });
};

const bindProfileButtons = () => {
  document.querySelectorAll("[data-profile]").forEach((button) => {
    button.addEventListener("click", () => openProfile(button.dataset.profile));
  });
};

renderApp();

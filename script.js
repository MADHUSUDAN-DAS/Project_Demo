const DB_KEY = "fintrack_database_v1";
const SESSION_KEY = "fintrack_session_v1";

const credentials = {
  user: { username: "user", password: "user123", redirect: "dashboard.html" },
  admin: { username: "admin", password: "admin123", redirect: "admin.html" }
};

let captchaAnswer = 0;

function readDB() {
  return JSON.parse(localStorage.getItem(DB_KEY)) || { records: [] };
}

function writeDB(database) {
  localStorage.setItem(DB_KEY, JSON.stringify(database));
}

function setSession(role, username) {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify({ role, username }));
}

function getSession() {
  return JSON.parse(sessionStorage.getItem(SESSION_KEY) || "null");
}

function clearSession() {
  sessionStorage.removeItem(SESSION_KEY);
}

function money(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0
  }).format(value || 0);
}

function generateCaptcha() {
  const first = Math.floor(Math.random() * 40) + 10;
  const second = Math.floor(Math.random() * 40) + 10;
  captchaAnswer = first + second;

  const question = document.querySelector("#captchaQuestion");
  if (question) {
    question.textContent = `${first} + ${second} = ?`;
  }
}

function protectPage() {
  const requiredRole = document.body.dataset.protected;
  if (!requiredRole) return;

  const session = getSession();
  if (!session || session.role !== requiredRole) {
    window.location.href = "index.html";
  }
}

function initLogin() {
  const form = document.querySelector("#loginForm");
  if (!form) return;

  const roleInput = document.querySelector("#loginRole");
  const username = document.querySelector("#username");
  const password = document.querySelector("#password");
  const captchaInput = document.querySelector("#captchaAnswer");
  const message = document.querySelector("#loginMessage");
  const tabs = document.querySelectorAll(".tab-button");

  generateCaptcha();

  document.querySelector("#refreshCaptcha").addEventListener("click", function () {
    captchaInput.value = "";
    generateCaptcha();
  });

  tabs.forEach(function (tab) {
    tab.addEventListener("click", function () {
      tabs.forEach(function (button) {
        button.classList.remove("active");
      });
      tab.classList.add("active");
      roleInput.value = tab.dataset.role;
      username.placeholder = credentials[tab.dataset.role].username;
      password.placeholder = credentials[tab.dataset.role].password;
      message.textContent = "";
      generateCaptcha();
    });
  });

  form.addEventListener("submit", function (event) {
    event.preventDefault();

    const role = roleInput.value;
    const account = credentials[role];
    const answer = Number(captchaInput.value);

    if (answer !== captchaAnswer) {
      message.textContent = "Security number is incorrect.";
      generateCaptcha();
      captchaInput.value = "";
      return;
    }

    if (username.value.trim() !== account.username || password.value !== account.password) {
      message.textContent = "Invalid username or password.";
      return;
    }

    setSession(role, account.username);
    window.location.href = account.redirect;
  });
}

function initLogout() {
  const button = document.querySelector("#logoutBtn");
  if (!button) return;

  button.addEventListener("click", function () {
    clearSession();
    window.location.href = "index.html";
  });
}

function recordTotals(records) {
  return records.reduce(function (totals, record) {
    totals[record.type] = (totals[record.type] || 0) + Number(record.amount);
    return totals;
  }, { income: 0, expense: 0, lent: 0, borrowed: 0 });
}

function netBalance(totals) {
  return totals.income + totals.borrowed - totals.expense - totals.lent;
}

function renderRecords(containerId, records) {
  const container = document.querySelector(containerId);
  if (!container) return;

  if (!records.length) {
    container.innerHTML = '<div class="empty-state">No records saved yet.</div>';
    return;
  }

  container.innerHTML = records.map(function (record) {
    return `
      <article class="record-item">
        <div>
          <span class="record-type ${record.type}">${record.type}</span>
          <b>${record.title}</b>
          <small>${record.month}${record.note ? " - " + record.note : ""}</small>
        </div>
        <strong>${money(record.amount)}</strong>
      </article>
    `;
  }).join("");
}

function initRecordForm() {
  const form = document.querySelector("[data-record-form]");
  if (!form) return;

  const monthInput = form.querySelector('input[name="month"]');
  if (monthInput && !monthInput.value) {
    monthInput.value = new Date().toISOString().slice(0, 7);
  }

  form.addEventListener("submit", function (event) {
    event.preventDefault();

    const database = readDB();
    const formData = new FormData(form);
    const type = form.dataset.type || formData.get("type");
    const record = {
      id: Date.now().toString(),
      type,
      title: formData.get("title").trim(),
      amount: Number(formData.get("amount")),
      month: formData.get("month"),
      note: formData.get("note").trim(),
      createdAt: new Date().toISOString()
    };

    database.records.unshift(record);
    writeDB(database);
    form.reset();
    if (monthInput) monthInput.value = new Date().toISOString().slice(0, 7);
    renderCurrentPage();
  });
}

function renderDashboard() {
  const records = readDB().records;
  const totals = recordTotals(records);

  const ids = {
    totalIncome: totals.income,
    totalExpense: totals.expense,
    totalLent: totals.lent,
    totalBorrowed: totals.borrowed,
    netBalance: netBalance(totals)
  };

  Object.keys(ids).forEach(function (id) {
    const element = document.querySelector(`#${id}`);
    if (element) element.textContent = money(ids[id]);
  });

  renderRecords("#recentRecords", records.slice(0, 6));
}

function renderPageRecords(typeFilter) {
  const records = readDB().records.filter(function (record) {
    if (Array.isArray(typeFilter)) return typeFilter.includes(record.type);
    return record.type === typeFilter;
  });
  renderRecords("#pageRecords", records);
}

function renderReports() {
  const body = document.querySelector("#reportRows");
  if (!body) return;

  const records = readDB().records;
  const months = Array.from(new Set(records.map(function (record) {
    return record.month;
  }))).sort().reverse();

  if (!months.length) {
    body.innerHTML = '<tr><td colspan="6">No report data available.</td></tr>';
    return;
  }

  body.innerHTML = months.map(function (month) {
    const totals = recordTotals(records.filter(function (record) {
      return record.month === month;
    }));
    return `
      <tr>
        <td>${month}</td>
        <td>${money(totals.income)}</td>
        <td>${money(totals.expense)}</td>
        <td>${money(totals.lent)}</td>
        <td>${money(totals.borrowed)}</td>
        <td>${money(netBalance(totals))}</td>
      </tr>
    `;
  }).join("");
}

function initClearButtons() {
  const userClear = document.querySelector("#clearDataBtn");
  if (userClear) {
    userClear.addEventListener("click", function () {
      if (confirm("Clear all saved financial records?")) {
        writeDB({ records: [] });
        renderCurrentPage();
      }
    });
  }

  const adminReset = document.querySelector("#adminResetBtn");
  if (adminReset) {
    adminReset.addEventListener("click", function () {
      if (confirm("Reset the full local database?")) {
        writeDB({ records: [] });
        renderCurrentPage();
      }
    });
  }
}

function renderAdmin() {
  const records = readDB().records;
  const totals = recordTotals(records);
  const values = {
    adminRecordCount: records.length,
    adminIncome: money(totals.income),
    adminExpense: money(totals.expense),
    adminBalance: money(netBalance(totals))
  };

  Object.keys(values).forEach(function (id) {
    const element = document.querySelector(`#${id}`);
    if (element) element.textContent = values[id];
  });

  renderRecords("#adminRecords", records);
}

function renderCurrentPage() {
  const page = document.body.dataset.page;

  if (page === "dashboard") renderDashboard();
  if (page === "income") renderPageRecords("income");
  if (page === "expense") renderPageRecords("expense");
  if (page === "lendBorrow") renderPageRecords(["lent", "borrowed"]);
  if (page === "reports") renderReports();
  if (page === "admin") renderAdmin();
}

protectPage();
initLogin();
initLogout();
initRecordForm();
initClearButtons();
renderCurrentPage();

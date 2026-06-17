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

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
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
  const canDelete = containerId === "#adminRecords" || containerId === "#pageRecords";

  if (!records.length) {
    container.innerHTML = '<div class="empty-state">No records saved yet.</div>';
    return;
  }

  container.innerHTML = records.map(function (record) {
    const category = record.category ? `Category: ${escapeHtml(record.category)} - ` : "";
    const owner = record.user ? `User: ${escapeHtml(record.user)} - ` : "";

    return `
      <article class="record-item">
        <div>
          <span class="record-type ${record.type}">${escapeHtml(record.type)}</span>
          <b>${escapeHtml(record.title)}</b>
          <small>${owner}${category}${escapeHtml(record.month)}${record.note ? " - " + escapeHtml(record.note) : ""}</small>
        </div>
        <div class="record-actions">
          <strong>${money(record.amount)}</strong>
          ${canDelete ? `<button class="text-button danger" type="button" data-delete-record="${record.id}">Delete</button>` : ""}
        </div>
      </article>
    `;
  }).join("");
}

function initRecordActions() {
  document.addEventListener("click", function (event) {
    const deleteButton = event.target.closest("[data-delete-record]");
    if (!deleteButton) return;

    const id = deleteButton.dataset.deleteRecord;
    if (!confirm("Delete this saved record?")) return;

    const database = readDB();
    database.records = database.records.filter(function (record) {
      return record.id !== id;
    });
    writeDB(database);
    renderCurrentPage();
  });
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
    const session = getSession();
    const formData = new FormData(form);
    const type = form.dataset.type || formData.get("type");
    const record = {
      id: Date.now().toString(),
      type,
      title: formData.get("title").trim(),
      amount: Number(formData.get("amount")),
      category: formData.get("category") || "",
      month: formData.get("month"),
      note: formData.get("note").trim(),
      user: session ? session.username : "user",
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

function groupExpenseBy(records, key) {
  return records
    .filter(function (record) {
      return record.type === "expense";
    })
    .reduce(function (groups, record) {
      const groupName = record[key] || "Uncategorized";
      groups[groupName] = (groups[groupName] || 0) + Number(record.amount);
      return groups;
    }, {});
}

function topEntry(groupedData) {
  return Object.entries(groupedData).sort(function (first, second) {
    return second[1] - first[1];
  })[0];
}

function renderCategoryBreakdown(records) {
  const container = document.querySelector("#adminCategoryBreakdown");
  if (!container) return;

  const expenses = records.filter(function (record) {
    return record.type === "expense";
  });
  const totalExpense = expenses.reduce(function (sum, record) {
    return sum + Number(record.amount);
  }, 0);
  const grouped = groupExpenseBy(records, "category");
  const entries = Object.entries(grouped).sort(function (first, second) {
    return second[1] - first[1];
  });

  if (!entries.length) {
    container.innerHTML = '<div class="empty-state">No spending category data yet.</div>';
    return;
  }

  container.innerHTML = entries.map(function (entry) {
    const percent = totalExpense ? Math.round((entry[1] / totalExpense) * 100) : 0;
    return `
      <div class="analytics-item">
        <div>
          <b>${escapeHtml(entry[0])}</b>
          <span>${percent}% of total spending</span>
        </div>
        <strong>${money(entry[1])}</strong>
        <div class="mini-progress"><span style="width: ${percent}%"></span></div>
      </div>
    `;
  }).join("");
}

function filteredAdminRecords(records) {
  const searchInput = document.querySelector("#adminSearch");
  const typeFilter = document.querySelector("#adminTypeFilter");
  const monthFilter = document.querySelector("#adminMonthFilter");

  const search = searchInput ? searchInput.value.trim().toLowerCase() : "";
  const selectedType = typeFilter ? typeFilter.value : "all";
  const selectedMonth = monthFilter ? monthFilter.value : "";

  return records.filter(function (record) {
    const matchesType = selectedType === "all" || record.type === selectedType;
    const matchesMonth = !selectedMonth || record.month === selectedMonth;
    const searchable = [
      record.title,
      record.note,
      record.category,
      record.month,
      record.user,
      record.type
    ].join(" ").toLowerCase();

    return matchesType && matchesMonth && searchable.includes(search);
  });
}

function initAdminFilters() {
  ["#adminSearch", "#adminTypeFilter", "#adminMonthFilter"].forEach(function (selector) {
    const input = document.querySelector(selector);
    if (input) input.addEventListener("input", renderCurrentPage);
  });
}

function renderAdmin() {
  const records = readDB().records;
  const totals = recordTotals(records);
  const expenses = records.filter(function (record) {
    return record.type === "expense";
  });
  const categoryTop = topEntry(groupExpenseBy(records, "category"));
  const monthTop = topEntry(groupExpenseBy(records, "month"));
  const averageExpense = expenses.length ? totals.expense / expenses.length : 0;
  const loanExposure = totals.lent + totals.borrowed;
  const values = {
    adminRecordCount: records.length,
    adminIncome: money(totals.income),
    adminExpense: money(totals.expense),
    adminTopCategory: categoryTop ? `${categoryTop[0]} ${money(categoryTop[1])}` : "No data",
    adminBalance: money(netBalance(totals)),
    adminAverageExpense: money(averageExpense),
    adminTopMonth: monthTop ? `${monthTop[0]} ${money(monthTop[1])}` : "No data",
    adminLoanExposure: money(loanExposure)
  };

  Object.keys(values).forEach(function (id) {
    const element = document.querySelector(`#${id}`);
    if (element) element.textContent = values[id];
  });

  renderCategoryBreakdown(records);
  renderRecords("#adminRecords", filteredAdminRecords(records));
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
initRecordActions();
initClearButtons();
initAdminFilters();
renderCurrentPage();

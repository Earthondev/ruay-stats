(function () {
  const dataset = window.RUAY_YIKEE_DATA;
  if (!dataset || !Array.isArray(dataset.records) || !dataset.records.length) {
    return;
  }

  const state = {
    startDate: dataset.coverage.start,
    endDate: dataset.coverage.end,
    field: dataset.fields.includes("3ตัวบน") ? "3ตัวบน" : dataset.fields[0],
    round: "all",
    focusDigit: null,
  };

  const els = {
    startDate: document.querySelector("#startDate"),
    endDate: document.querySelector("#endDate"),
    fieldSelect: document.querySelector("#fieldSelect"),
    roundSelect: document.querySelector("#roundSelect"),
    coverageFacts: document.querySelector("#coverageFacts"),
    metricCards: document.querySelector("#metricCards"),
    digitOverviewMeta: document.querySelector("#digitOverviewMeta"),
    digitBars: document.querySelector("#digitBars"),
    digitPicker: document.querySelector("#digitPicker"),
    roundFocusMeta: document.querySelector("#roundFocusMeta"),
    focusInsight: document.querySelector("#focusInsight"),
    roundTrend: document.querySelector("#roundTrend"),
    topValuesBody: document.querySelector("#topValuesBody"),
    latestStatusMeta: document.querySelector("#latestStatusMeta"),
    latestStatus: document.querySelector("#latestStatus"),
    historyMeta: document.querySelector("#historyMeta"),
    historyBody: document.querySelector("#historyBody"),
  };

  function formatDate(dateString) {
    const date = new Date(`${dateString}T00:00:00Z`);
    return new Intl.DateTimeFormat("th-TH-u-ca-buddhist", {
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    }).format(date);
  }

  function formatTimestamp(value) {
    const date = new Date(value);
    return new Intl.DateTimeFormat("th-TH", {
      dateStyle: "short",
      timeStyle: "short",
      timeZone: "Asia/Bangkok",
    }).format(date);
  }

  function numberFormat(value) {
    return new Intl.NumberFormat("th-TH").format(value);
  }

  function percent(value, total) {
    if (!total) {
      return "0.0%";
    }
    return `${((value / total) * 100).toFixed(1)}%`;
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function getFilteredRecords() {
    return dataset.records.filter((record) => {
      if (record.date < state.startDate || record.date > state.endDate) {
        return false;
      }
      if (record.field !== state.field) {
        return false;
      }
      if (state.round !== "all" && String(record.round) !== state.round) {
        return false;
      }
      return true;
    });
  }

  function analyze(records) {
    const completeRecords = records.filter((record) => !record.is_placeholder && record.digits);
    const digitCounts = Array.from({ length: 10 }, () => 0);
    const exactCounts = new Map();
    const roundCounts = new Map();

    for (const record of completeRecords) {
      const exactMeta = exactCounts.get(record.digits) || { count: 0, lastSeen: record.date };
      exactMeta.count += 1;
      exactMeta.lastSeen = record.date > exactMeta.lastSeen ? record.date : exactMeta.lastSeen;
      exactCounts.set(record.digits, exactMeta);

      const roundKey = String(record.round);
      const roundMeta = roundCounts.get(roundKey) || { count: 0, lastValue: record.value, lastSeen: record.date };
      roundMeta.count += 1;
      roundMeta.lastSeen = record.date > roundMeta.lastSeen ? record.date : roundMeta.lastSeen;
      roundMeta.lastValue = record.date >= roundMeta.lastSeen ? record.value : roundMeta.lastValue;
      roundCounts.set(roundKey, roundMeta);

      for (const digitChar of record.digits) {
        digitCounts[Number(digitChar)] += 1;
      }
    }

    const sortedNumbers = [...exactCounts.entries()]
      .map(([value, meta]) => ({ value, count: meta.count, lastSeen: meta.lastSeen }))
      .sort((left, right) => right.count - left.count || right.lastSeen.localeCompare(left.lastSeen));

    const hottestDigit = digitCounts.reduce(
      (best, count, digit) => (count > best.count ? { digit, count } : best),
      { digit: 0, count: -1 }
    );

    if (state.focusDigit === null) {
      state.focusDigit = String(hottestDigit.digit);
    }

    const focusDigit = Number(state.focusDigit);
    const roundTrend = dataset.rounds
      .map((round) => {
        const roundKey = String(round);
        const roundRecords = completeRecords.filter((record) => String(record.round) === roundKey);
        const focusMatches = roundRecords.filter((record) => record.digits.includes(String(focusDigit))).length;
        const roundMeta = roundCounts.get(roundKey) || { count: 0, lastValue: "-", lastSeen: "-" };
        return {
          round,
          observations: roundMeta.count,
          focusMatches,
          lastValue: roundMeta.lastValue,
          lastSeen: roundMeta.lastSeen,
        };
      })
      .filter((row) => row.observations > 0)
      .sort((left, right) => right.focusMatches - left.focusMatches || right.observations - left.observations);

    return {
      completeRecords,
      digitCounts,
      sortedNumbers,
      hottestDigit,
      roundTrend,
      uniqueDays: new Set(completeRecords.map((record) => record.date)).size,
      hottestNumber: sortedNumbers[0] || { value: "-", count: 0, lastSeen: "-" },
    };
  }

  function renderCoverage() {
    const latest = dataset.latest_status;
    els.coverageFacts.innerHTML = `
      <div class="fact-block">
        <strong>${numberFormat(dataset.coverage.day_count)}</strong>
        <span>วันที่สะสมในฐาน read-only</span>
      </div>
      <div class="fact-block">
        <strong>${latest.completed_rounds}/${numberFormat(latest.visible_rounds)}</strong>
        <span>รอบที่ complete แล้วในวันที่ล่าสุด</span>
      </div>
      <div class="fact-block">
        <strong>${formatDate(latest.date)}</strong>
        <span>วันที่ล่าสุดที่หน้า public แสดงผล</span>
      </div>
      <div class="fact-block">
        <strong>${formatTimestamp(latest.captured_at)}</strong>
        <span>เวลาที่เก็บข้อมูลล่าสุด</span>
      </div>
    `;
  }

  function renderControls() {
    const dateOptions = dataset.dates
      .map((date) => `<option value="${date}">${formatDate(date)}</option>`)
      .join("");
    els.startDate.innerHTML = dateOptions;
    els.endDate.innerHTML = dateOptions;
    els.startDate.value = state.startDate;
    els.endDate.value = state.endDate;

    els.fieldSelect.innerHTML = dataset.fields
      .map((field) => `<option value="${field}">${field}</option>`)
      .join("");
    els.fieldSelect.value = state.field;

    els.roundSelect.innerHTML = [
      `<option value="all">ทุกรอบ</option>`,
      ...dataset.rounds.map((round) => `<option value="${round}">รอบ ${round}</option>`),
    ].join("");
    els.roundSelect.value = state.round;

    els.startDate.addEventListener("change", () => {
      state.startDate = els.startDate.value;
      if (state.startDate > state.endDate) {
        state.endDate = state.startDate;
        els.endDate.value = state.endDate;
      }
      render();
    });

    els.endDate.addEventListener("change", () => {
      state.endDate = els.endDate.value;
      if (state.endDate < state.startDate) {
        state.startDate = state.endDate;
        els.startDate.value = state.startDate;
      }
      render();
    });

    els.fieldSelect.addEventListener("change", () => {
      state.field = els.fieldSelect.value;
      state.focusDigit = null;
      render();
    });

    els.roundSelect.addEventListener("change", () => {
      state.round = els.roundSelect.value;
      render();
    });
  }

  function renderMetrics(analysis) {
    const focusDigitCount = analysis.digitCounts[Number(state.focusDigit)] || 0;
    const totalDigits = analysis.digitCounts.reduce((sum, value) => sum + value, 0);
    els.metricCards.innerHTML = `
      <div class="metric">
        <div class="metric-label">ผล complete ตามตัวกรอง</div>
        <div class="metric-value">${numberFormat(analysis.completeRecords.length)}</div>
        <div class="metric-note">นับเฉพาะรายการที่ออกเลขแล้ว</div>
      </div>
      <div class="metric">
        <div class="metric-label">จำนวนวันที่มีข้อมูล</div>
        <div class="metric-value">${numberFormat(analysis.uniqueDays)}</div>
        <div class="metric-note">ภายในช่วงวันที่ที่เลือก</div>
      </div>
      <div class="metric">
        <div class="metric-label">digit เด่นที่สุด</div>
        <div class="metric-value">${analysis.hottestDigit.digit}</div>
        <div class="metric-note">ปรากฏ ${numberFormat(analysis.hottestDigit.count)} ครั้ง</div>
      </div>
      <div class="metric">
        <div class="metric-label">digit ที่กำลังโฟกัส</div>
        <div class="metric-value">${state.focusDigit}</div>
        <div class="metric-note">พบ ${numberFormat(focusDigitCount)} ครั้ง หรือ ${percent(
          focusDigitCount,
          totalDigits
        )} ของ digit ทั้งหมด</div>
      </div>
    `;
  }

  function renderDigitOverview(analysis) {
    const maxCount = Math.max(...analysis.digitCounts, 1);
    els.digitOverviewMeta.textContent = `${state.field} | ${
      state.round === "all" ? "ทุกรอบ" : `รอบ ${state.round}`
    }`;
    els.digitBars.innerHTML = analysis.digitCounts
      .map((count, digit) => {
        const width = maxCount ? Math.max((count / maxCount) * 100, 4) : 0;
        const isActive = String(digit) === state.focusDigit;
        return `
          <button class="digit-row ${isActive ? "active" : ""}" data-digit="${digit}">
            <span class="digit-tag">${digit}</span>
            <span class="digit-track"><span class="digit-fill" style="width:${width}%"></span></span>
            <span class="digit-value">${numberFormat(count)}</span>
          </button>
        `;
      })
      .join("");

    els.digitBars.querySelectorAll(".digit-row").forEach((button) => {
      button.addEventListener("click", () => {
        state.focusDigit = button.dataset.digit;
        render();
      });
    });
  }

  function renderRoundFocus(analysis) {
    const focusDigit = Number(state.focusDigit);
    const maxMatches = Math.max(...analysis.roundTrend.map((item) => item.focusMatches), 1);
    els.roundFocusMeta.textContent = `ดูว่า digit ${focusDigit} ไปโผล่ในรอบไหนบ่อยที่สุด`;
    els.digitPicker.innerHTML = Array.from({ length: 10 }, (_, digit) => {
      const active = String(digit) === state.focusDigit ? "active" : "";
      return `<button class="digit-button ${active}" data-digit="${digit}">${digit}</button>`;
    }).join("");
    els.digitPicker.querySelectorAll(".digit-button").forEach((button) => {
      button.addEventListener("click", () => {
        state.focusDigit = button.dataset.digit;
        render();
      });
    });

    const leader = analysis.roundTrend[0];
    els.focusInsight.innerHTML = leader
      ? `<strong>digit ${focusDigit}</strong> เจอบ่อยสุดในรอบ ${leader.round} จำนวน ${numberFormat(
          leader.focusMatches
        )} ครั้ง จาก ${numberFormat(leader.observations)} observations`
      : `<span class="empty">ยังไม่มีผล complete ในตัวกรองนี้</span>`;

    els.roundTrend.innerHTML = leader
      ? analysis.roundTrend
          .slice(0, 16)
          .map((item) => {
            const width = maxMatches ? Math.max((item.focusMatches / maxMatches) * 100, 4) : 0;
            return `
              <div class="round-row">
                <span class="round-label">${item.round}</span>
                <span class="round-track"><span class="round-fill" style="width:${width}%"></span></span>
                <span class="round-value">${numberFormat(item.focusMatches)} / ${numberFormat(
              item.observations
            )}</span>
              </div>
            `;
          })
          .join("")
      : `<div class="empty">ยังไม่มีผล complete มากพอสำหรับสรุปรายรอบ</div>`;
  }

  function renderTopValues(analysis) {
    const rows = analysis.sortedNumbers.slice(0, 18);
    els.topValuesBody.innerHTML = rows.length
      ? rows
          .map((item) => `
            <tr>
              <td><span class="value-badge ${item.value.includes(state.focusDigit) ? "match" : ""}">${escapeHtml(
              item.value
            )}</span></td>
              <td>${numberFormat(item.count)}</td>
              <td>${formatDate(item.lastSeen)}</td>
              <td>${item.value.includes(state.focusDigit) ? "มี" : "-"}</td>
            </tr>
          `)
          .join("")
      : `<tr><td class="empty" colspan="4">ยังไม่มีผล complete ในตัวกรองนี้</td></tr>`;
  }

  function renderLatestStatus() {
    const latest = dataset.latest_status;
    const pendingPreview = latest.pending_rounds.slice(0, 8).join(", ");
    els.latestStatusMeta.textContent = `อัปเดตล่าสุด ${formatTimestamp(latest.captured_at)}`;
    els.latestStatus.innerHTML = `
      <div class="status-grid">
        <article class="status-card">
          <span>วันที่ล่าสุด</span>
          <strong>${formatDate(latest.date)}</strong>
        </article>
        <article class="status-card">
          <span>รอบที่ complete แล้ว</span>
          <strong>${latest.completed_rounds}/${latest.visible_rounds}</strong>
        </article>
        <article class="status-card">
          <span>รอบล่าสุดที่เห็นผล</span>
          <strong>${latest.last_completed_round || "-"}</strong>
        </article>
      </div>
      <div class="note-list">
        <p>3ตัวบน complete: ${latest.field_completion["3ตัวบน"]} รอบ | 2ตัวล่าง complete: ${
      latest.field_completion["2ตัวล่าง"]
    } รอบ</p>
        <p>รอบที่ยังไม่ complete ตัวอย่าง: ${pendingPreview || "-"}</p>
      </div>
    `;
  }

  function renderHistory(analysis) {
    const history = [...analysis.completeRecords]
      .sort((left, right) => {
        if (left.date !== right.date) {
          return right.date.localeCompare(left.date);
        }
        if (left.round !== right.round) {
          return Number(right.round) - Number(left.round);
        }
        return String(left.field).localeCompare(String(right.field));
      })
      .slice(0, 30);

    els.historyMeta.textContent = `แสดงล่าสุด ${numberFormat(history.length)} รายการ`;
    els.historyBody.innerHTML = history.length
      ? history
          .map((record) => `
            <tr>
              <td>${formatDate(record.date)}</td>
              <td>${record.round}</td>
              <td>${escapeHtml(record.field)}</td>
              <td><span class="value-badge ${record.digits.includes(state.focusDigit) ? "match" : ""}">${escapeHtml(
              record.value
            )}</span></td>
              <td>${escapeHtml(record.payout || "-")}</td>
              <td>${formatTimestamp(record.captured_at)}</td>
            </tr>
          `)
          .join("")
      : `<tr><td class="empty" colspan="6">ยังไม่มีผล complete ในตัวกรองนี้</td></tr>`;
  }

  function render() {
    const records = getFilteredRecords();
    const analysis = analyze(records);
    renderMetrics(analysis);
    renderDigitOverview(analysis);
    renderRoundFocus(analysis);
    renderTopValues(analysis);
    renderLatestStatus();
    renderHistory(analysis);
  }

  renderCoverage();
  renderControls();
  render();
})();

(function () {
  const dataset = window.WAII_DASHBOARD_DATA;
  if (!dataset) {
    return;
  }

  const yeekee = dataset.yeekee || {};
  const overview = yeekee.overview || {};
  const fields = overview.fields || [];
  const defaultField = fields.includes("3ตัวบน") ? "3ตัวบน" : fields[0] || "3ตัวบน";

  const state = {
    field: defaultField,
  };

  const els = {
    coverageFacts: document.querySelector("#coverageFacts"),
    readinessMeta: document.querySelector("#readinessMeta"),
    readinessPrimary: document.querySelector("#readinessPrimary"),
    readinessNote: document.querySelector("#readinessNote"),
    homeApiState: document.querySelector("#homeApiState"),
    homeApiNote: document.querySelector("#homeApiNote"),
    yeekeeApiState: document.querySelector("#yeekeeApiState"),
    yeekeeApiNote: document.querySelector("#yeekeeApiNote"),
    backtestState: document.querySelector("#backtestState"),
    backtestNote: document.querySelector("#backtestNote"),
    fieldSelect: document.querySelector("#fieldSelect"),
    spotlightMeta: document.querySelector("#spotlightMeta"),
    snapshotPrimary: document.querySelector("#snapshotPrimary"),
    snapshotNote: document.querySelector("#snapshotNote"),
    completePrimary: document.querySelector("#completePrimary"),
    completeNote: document.querySelector("#completeNote"),
    hotDigitPrimary: document.querySelector("#hotDigitPrimary"),
    hotDigitNote: document.querySelector("#hotDigitNote"),
    hotValuePrimary: document.querySelector("#hotValuePrimary"),
    hotValueNote: document.querySelector("#hotValueNote"),
    hotDigitsChips: document.querySelector("#hotDigitsChips"),
    hotValuesChips: document.querySelector("#hotValuesChips"),
    metricCards: document.querySelector("#metricCards"),
    backtestBody: document.querySelector("#backtestBody"),
    digitOverviewMeta: document.querySelector("#digitOverviewMeta"),
    digitBars: document.querySelector("#digitBars"),
    latestCompleteMeta: document.querySelector("#latestCompleteMeta"),
    latestCompleteList: document.querySelector("#latestCompleteList"),
    timelineBody: document.querySelector("#timelineBody"),
    requestFailures: document.querySelector("#requestFailures"),
    consoleMessages: document.querySelector("#consoleMessages"),
    pageSnapshots: document.querySelector("#pageSnapshots"),
  };

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function numberFormat(value) {
    return new Intl.NumberFormat("th-TH").format(value || 0);
  }

  function formatPercent(value) {
    return `${Number(value || 0).toFixed(2)}%`;
  }

  function formatDate(value) {
    if (!value) return "-";
    const date = new Date(`${value}T00:00:00Z`);
    if (Number.isNaN(date.getTime())) return value;
    return new Intl.DateTimeFormat("th-TH-u-ca-buddhist", {
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    }).format(date);
  }

  function formatTimestamp(value) {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return new Intl.DateTimeFormat("th-TH", {
      dateStyle: "short",
      timeStyle: "short",
      timeZone: "Asia/Bangkok",
    }).format(date);
  }

  function currentFieldData() {
    return overview.per_field?.[state.field] || {
      record_count: 0,
      day_count: 0,
      top_digits: [],
      top_values: [],
      latest_records: [],
    };
  }

  function currentBacktests() {
    return overview.backtests?.[state.field] || [];
  }

  function renderCoverage() {
    const coverage = dataset.coverage || {};
    els.coverageFacts.innerHTML = `
      <div class="fact-block">
        <strong>${numberFormat(coverage.snapshotCount)}</strong>
        <span>snapshot ที่สะสมไว้</span>
      </div>
      <div class="fact-block">
        <strong>${numberFormat(coverage.completeYeekeeRowCount)}</strong>
        <span>complete yeekee observations</span>
      </div>
      <div class="fact-block">
        <strong>${numberFormat(coverage.homeApiCaptureCount)}</strong>
        <span>รันที่ home API ตอบสำเร็จ</span>
      </div>
      <div class="fact-block">
        <strong>${formatTimestamp(coverage.latestCapture)}</strong>
        <span>เวลาที่ collector เก็บล่าสุด</span>
      </div>
    `;
  }

  function renderReadiness() {
    const latest = dataset.latestStatus || {};
    const availability = latest.availability || {};
    const readiness = yeekee.readiness || {};
    const snapshotCount = dataset.coverage?.snapshotCount || 0;
    const completeRows = dataset.coverage?.completeYeekeeRowCount || 0;

    let readinessLabel = "ยังสะสมไม่พอ";
    let readinessNote =
      "ตอนนี้หน้าสาธารณะยังให้ข้อมูลจำกัดอยู่ ต้องรอให้ collector เก็บ snapshot และผล complete เพิ่มก่อน";

    if (readiness.enoughForBacktest) {
      readinessLabel = "พร้อมทดสอบย้อนหลัง";
      readinessNote = "มี complete observations มากพอสำหรับ pattern tests ขั้นต้นแล้ว แต่ยังไม่ใช่หลักฐานว่ากฎใดใช้ได้ในอนาคต";
    } else if (readiness.hasAnyRecords) {
      readinessLabel = "เริ่มอ่าน pattern ได้";
      readinessNote = "มีผล complete บางส่วนแล้ว เหมาะกับดูภาพรวมและทดสอบเบื้องต้น แต่ sample ยังเล็ก";
    }

    els.readinessMeta.textContent = `Snapshots ${numberFormat(snapshotCount)} | Complete rows ${numberFormat(
      completeRows
    )}`;
    els.readinessPrimary.textContent = readinessLabel;
    els.readinessNote.textContent = readinessNote;

    els.homeApiState.textContent = availability.homeApiCaptured ? "captured" : "unavailable";
    els.homeApiNote.textContent = availability.homeApiCaptured
      ? "collector รอบล่าสุดจับ /api/home ได้"
      : "collector รอบล่าสุดยังจับ /api/home ไม่ได้";

    els.yeekeeApiState.textContent = availability.yeekeeApiCaptured ? "captured" : "unavailable";
    els.yeekeeApiNote.textContent = availability.yeekeeApiCaptured
      ? "collector รอบล่าสุดจับ /api/yeekee ได้"
      : "collector รอบล่าสุดยังจับ /api/yeekee ไม่ได้";

    els.backtestState.textContent = readiness.enoughForBacktest ? "enabled" : "limited";
    els.backtestNote.textContent = readiness.enoughForBacktest
      ? "หน้า Pattern Lab ด้านล่างมีผลทดสอบย้อนหลังให้ดู"
      : "มีตาราง Pattern Lab ให้ดู แต่บางกฎจะยังไม่มี trials เพราะประวัติยังน้อย";
  }

  function renderFieldSelect() {
    els.fieldSelect.innerHTML = fields.length
      ? fields.map((field) => `<option value="${escapeHtml(field)}">${escapeHtml(field)}</option>`).join("")
      : `<option value="3ตัวบน">3ตัวบน</option>`;
    els.fieldSelect.value = state.field;
    els.fieldSelect.addEventListener("change", () => {
      state.field = els.fieldSelect.value;
      render();
    });
  }

  function renderSpotlight() {
    const data = currentFieldData();
    const topDigit = data.top_digits?.[0];
    const topValue = data.top_values?.[0];
    const timeline = dataset.captureTimeline || [];

    els.spotlightMeta.textContent = `${state.field} | วันข้อมูล ${numberFormat(data.day_count)} วัน`;
    els.snapshotPrimary.textContent = numberFormat(dataset.coverage?.snapshotCount || 0);
    els.snapshotNote.textContent = timeline.length
      ? `เริ่มเก็บตั้งแต่ ${formatTimestamp(timeline[0].captured_at)}`
      : "ยังไม่มี snapshot timeline";

    els.completePrimary.textContent = numberFormat(data.record_count || 0);
    els.completeNote.textContent = `complete observations ของ ${state.field}`;

    els.hotDigitPrimary.textContent = topDigit ? topDigit[0] : "-";
    els.hotDigitNote.textContent = topDigit
      ? `พบ ${numberFormat(topDigit[1])} ครั้งใน field นี้`
      : "ยังไม่มีผล complete ให้คำนวณ";

    els.hotValuePrimary.textContent = topValue ? topValue[0] : "-";
    els.hotValueNote.textContent = topValue
      ? `ซ้ำ ${numberFormat(topValue[1])} ครั้ง`
      : "ยังไม่มีค่าที่ complete";

    els.hotDigitsChips.innerHTML = data.top_digits?.length
      ? data.top_digits
          .slice(0, 6)
          .map(
            ([digit, count]) => `
              <span class="insight-chip">
                <strong>${escapeHtml(digit)}</strong>
                <span>${numberFormat(count)} ครั้ง</span>
              </span>
            `
          )
          .join("")
      : `<p class="empty">ยังไม่มี digit summary สำหรับ field นี้</p>`;

    els.hotValuesChips.innerHTML = data.top_values?.length
      ? data.top_values
          .slice(0, 6)
          .map(
            ([value, count]) => `
              <span class="insight-chip match">
                <strong>${escapeHtml(value)}</strong>
                <span>${numberFormat(count)} ครั้ง</span>
              </span>
            `
          )
          .join("")
      : `<p class="empty">ยังไม่มีเลขซ้ำที่ complete พอจะจัดอันดับ</p>`;
  }

  function renderMetrics() {
    const data = currentFieldData();
    const tests = currentBacktests();
    const activeTests = tests.filter((test) => test.trials > 0);
    const bestTest = [...activeTests].sort((left, right) => right.hit_rate - left.hit_rate)[0];

    els.metricCards.innerHTML = `
      <div class="metric">
        <div class="metric-label">Field ที่กำลังดู</div>
        <div class="metric-value">${escapeHtml(state.field)}</div>
        <div class="metric-note">สลับจาก dropdown ด้านบนได้</div>
      </div>
      <div class="metric">
        <div class="metric-label">กฎที่มี trials</div>
        <div class="metric-value">${numberFormat(activeTests.length)}</div>
        <div class="metric-note">จากทั้งหมด ${numberFormat(tests.length)} กฎ</div>
      </div>
      <div class="metric">
        <div class="metric-label">Best historical hit rate</div>
        <div class="metric-value">${bestTest ? formatPercent(bestTest.hit_rate) : "-"}</div>
        <div class="metric-note">${bestTest ? escapeHtml(bestTest.label) : "ยังไม่มี trials เพียงพอ"}</div>
      </div>
      <div class="metric">
        <div class="metric-label">วันที่มีข้อมูล</div>
        <div class="metric-value">${numberFormat(data.day_count)}</div>
        <div class="metric-note">complete observations ใน field นี้</div>
      </div>
    `;
  }

  function renderBacktests() {
    const tests = currentBacktests();
    if (!tests.length) {
      els.backtestBody.innerHTML = `
        <tr>
          <td colspan="6" class="empty-cell">ยังไม่มีข้อมูลพอสำหรับสร้าง pattern tests ใน field นี้</td>
        </tr>
      `;
      return;
    }

    els.backtestBody.innerHTML = tests
      .map((test) => {
        const baseline =
          test.baseline_hit_rate === null || test.baseline_hit_rate === undefined
            ? "-"
            : formatPercent(test.baseline_hit_rate);
        return `
          <tr>
            <td>
              <div class="value-badge ${matchCls}">
                ${escapeHtml(test.label || "-")}
              </div>
            </td>
            <td>${numberFormat(test.trials)}</td>
            <td>${numberFormat(test.hits)}</td>
            <td>${formatPercent(test.hit_rate)}</td>
            <td>${baseline}</td>
            <td class="description-cell">${escapeHtml(test.description)}</td>
          </tr>
        `;
      })
      .join("");
  }

  function renderDigitBars() {
    const data = currentFieldData();
    const rows = data.top_digits || [];
    const maxCount = rows.length ? Math.max(...rows.map((row) => row[1])) : 0;
    els.digitOverviewMeta.textContent = `รวมการปรากฏในผลที่ออกแล้ว ${numberFormat(
      data.record_count
    )} รอบ`;

    els.digitBars.innerHTML = rows.length
      ? rows
          .map(([digit, count]) => {
            const width = maxCount ? Math.max((count / maxCount) * 100, 6) : 0;
            return `
              <article class="digit-row">
                <div class="digit-meta">
                  <strong>${escapeHtml(digit)}</strong>
                  <span>${numberFormat(count)} ครั้ง</span>
                </div>
                <div class="digit-track">
                  <span class="digit-fill" style="width:${width}%"></span>
                </div>
              </article>
            `;
          })
          .join("")
      : `<p class="empty">ยังไม่มี complete records พอจะแสดง digit distribution</p>`;
  }

  function renderLatestComplete() {
    const data = currentFieldData();
    const latest = data.latest_records || [];
    els.latestCompleteMeta.textContent = latest.length
      ? `แสดง ${numberFormat(Math.min(latest.length, 10))} observations ล่าสุด`
      : "ยังไม่มี observations ล่าสุด";

    els.latestCompleteList.innerHTML = latest.length
      ? latest
          .slice(-10)
          .reverse()
          .map(
            (item) => `
              <article class="latest-card">
                <div>
                  <strong>${escapeHtml(item.digits)}</strong>
                  <p>${formatDate(item.date)} | รอบ ${escapeHtml(item.round ?? "-")}</p>
                </div>
                <span>${formatTimestamp(item.captured_at)}</span>
              </article>
            `
          )
          .join("")
      : `<p class="empty">ยังไม่มีผล complete ล่าสุดสำหรับ field นี้</p>`;
  }

  function renderTimeline() {
    const timeline = dataset.captureTimeline || [];
    els.timelineBody.innerHTML = timeline.length
      ? timeline
          .slice()
          .reverse()
          .slice(0, 16)
          .map(
            (item) => `
              <tr>
                <td>${formatTimestamp(item.captured_at)}</td>
                <td>${item.home_api_captured ? "yes" : "no"}</td>
                <td>${item.yeekee_api_captured ? "yes" : "no"}</td>
                <td>${numberFormat(item.failure_count)}</td>
                <td>${escapeHtml(item.yeekee_final_url || "-")}</td>
              </tr>
            `
          )
          .join("")
      : `
        <tr>
          <td colspan="5" class="empty-cell">ยังไม่มี capture timeline</td>
        </tr>
      `;
    els.timelineMeta.innerHTML = `
      และดึงข้อมูลครั้งล่าสุดเมื่อ ${formatTimestamp(dataset.coverage?.latestCapture || dataset.generatedAt)}
    `;
  }

  function renderDiagnostics() {
    const requestFailures = dataset.diagnostics?.requestFailures || [];
    const consoleMessages = dataset.diagnostics?.consoleMessages || [];
    const pageSnapshots = dataset.pageSnapshots || [];

    els.requestFailures.innerHTML = requestFailures.length
      ? requestFailures
          .slice(0, 10)
          .map(
            (failure) => `
              <article class="diag-item">
                <strong>${escapeHtml(failure.method)}</strong>
                <p>${escapeHtml(failure.url)}</p>
                <span>${escapeHtml(failure.errorText)}</span>
              </article>
            `
          )
          .join("")
      : `<p class="empty">ไม่มี request failure ใน status รอบล่าสุด</p>`;

    els.consoleMessages.innerHTML = consoleMessages.length
      ? consoleMessages
          .slice(0, 10)
          .map(
            (message) => `
              <article class="diag-item">
                <strong>${escapeHtml(message.type)}</strong>
                <p>${escapeHtml(message.text)}</p>
              </article>
            `
          )
          .join("")
      : `<p class="empty">ไม่มี console message ที่สำคัญในรอบล่าสุด</p>`;

    els.pageSnapshots.innerHTML = pageSnapshots.length
      ? pageSnapshots
          .map(
            (page) => `
              <article class="diag-item">
                <strong>${escapeHtml(page.name)}</strong>
                <p>${escapeHtml(page.finalUrl || page.requestedUrl || "-")}</p>
                <span>${escapeHtml(page.textPreview || "-")}</span>
              </article>
            `
          )
          .join("")
      : `<p class="empty">ยังไม่มี page snapshot</p>`;
  }

  function render() {
    renderCoverage();
    renderReadiness();
    renderSpotlight();
    renderMetrics();
    renderBacktests();
    renderDigitBars();
    renderLatestComplete();
    renderTimeline();
    renderDiagnostics();
  }

  renderFieldSelect();
  render();
})();

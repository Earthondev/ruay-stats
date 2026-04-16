(function () {
  const dataset = window.GLO_HISTORY_DATA;
  if (!dataset || !Array.isArray(dataset.draws)) {
    return;
  }

  /* ── helpers ───────────────────────────────────── */
  function todayISO() {
    const now = new Date();
    const th = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Bangkok" }).format(now);
    return th; // "YYYY-MM-DD"
  }

  const MODE_CONFIG = {
    all_last3: {
      label: "รวม 3 หลักที่วิเคราะห์ได้ทั้งหมด",
      note:
        "รวม 3 หลักท้ายของรางวัลที่ 1 + เลขหน้า 3 ตัว + เลขท้าย 3 ตัว เป็นมุมที่ใกล้เคียงกับการดู “สามตัว” แบบกว้างที่สุด",
      digits: 3,
      positions: ["หลักร้อย", "หลักสิบ", "หลักหน่วย"],
      samples(draw) {
        const values = [];
        if (draw.first_last3) {
          values.push({ value: draw.first_last3, source: "ท้าย 3 ของรางวัลที่ 1" });
        }
        for (const value of draw.last3f || []) {
          values.push({ value, source: "เลขหน้า 3 ตัว" });
        }
        for (const value of draw.last3b || []) {
          values.push({ value, source: "เลขท้าย 3 ตัว" });
        }
        return values;
      },
    },
    first_last3: {
      label: "3 หลักท้ายของรางวัลที่ 1",
      note:
        "GLO ไม่ได้มีฟิลด์ชื่อ “สามตัวบน” ตรง ๆ จึงใช้ 3 หลักท้ายของรางวัลที่ 1 เป็น proxy สำหรับดูแนวโน้มฝั่งบน",
      digits: 3,
      positions: ["หลักร้อย", "หลักสิบ", "หลักหน่วย"],
      samples(draw) {
        return draw.first_last3 ? [{ value: draw.first_last3, source: "ท้าย 3 ของรางวัลที่ 1" }] : [];
      },
    },
    last3f: {
      label: "เลขหน้า 3 ตัว",
      note: "หนึ่งงวดมี 2 ชุดเลขหน้า 3 ตัว จึงนับ sample ต่อชุดเลข ไม่ใช่ต่อวันที่ออก",
      digits: 3,
      positions: ["หลักร้อย", "หลักสิบ", "หลักหน่วย"],
      samples(draw) {
        return (draw.last3f || []).map((value) => ({ value, source: "เลขหน้า 3 ตัว" }));
      },
    },
    last3b: {
      label: "เลขท้าย 3 ตัว",
      note: "หนึ่งงวดมี 2 ชุดเลขท้าย 3 ตัว จึงนับ sample ต่อชุดเลข ไม่ใช่ต่อวันที่ออก",
      digits: 3,
      positions: ["หลักร้อย", "หลักสิบ", "หลักหน่วย"],
      samples(draw) {
        return (draw.last3b || []).map((value) => ({ value, source: "เลขท้าย 3 ตัว" }));
      },
    },
    last2: {
      label: "เลขท้าย 2 ตัว",
      note: "เลขท้าย 2 ตัวมีเพียง 1 ชุดต่อหนึ่งงวด จึงอ่านความถี่ได้ตรงที่สุดต่อ draw",
      digits: 2,
      positions: ["หลักสิบ", "หลักหน่วย"],
      samples(draw) {
        return draw.last2 ? [{ value: draw.last2, source: "เลขท้าย 2 ตัว" }] : [];
      },
    },
  };

  const state = {
    mode: "all_last3",
    startYear: Math.min(...dataset.coverage.years),
    endYear: Math.max(...dataset.coverage.years),
    focusDigit: null,
  };

  const els = {
    startYear: document.querySelector("#startYear"),
    endYear: document.querySelector("#endYear"),
    modeSelect: document.querySelector("#modeSelect"),
    coverageFacts: document.querySelector("#coverageFacts"),
    modeNote: document.querySelector("#modeNote"),
    metricCards: document.querySelector("#metricCards"),
    digitOverviewMeta: document.querySelector("#digitOverviewMeta"),
    digitBars: document.querySelector("#digitBars"),
    digitPicker: document.querySelector("#digitPicker"),
    digitFocusMeta: document.querySelector("#digitFocusMeta"),
    focusInsight: document.querySelector("#focusInsight"),
    yearTrend: document.querySelector("#yearTrend"),
    positionSummary: document.querySelector("#positionSummary"),
    positionHeatmap: document.querySelector("#positionHeatmap"),
    topNumbersBody: document.querySelector("#topNumbersBody"),
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

  function percent(value, total) {
    if (!total) {
      return "0.0%";
    }
    return `${((value / total) * 100).toFixed(1)}%`;
  }

  function numberFormat(value) {
    return new Intl.NumberFormat("th-TH").format(value);
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function getFilteredDraws() {
    return dataset.draws.filter(
      (draw) => draw.year >= state.startYear && draw.year <= state.endYear
    );
  }

  function buildSamples(draws, modeKey) {
    const mode = MODE_CONFIG[modeKey];
    const samples = [];
    for (const draw of draws) {
      for (const sample of mode.samples(draw)) {
        if (sample.value) {
          samples.push({
            date: draw.date,
            year: draw.year,
            first: draw.first,
            firstLast3: draw.first_last3,
            last2: draw.last2,
            last3f: draw.last3f,
            last3b: draw.last3b,
            value: sample.value,
            source: sample.source,
          });
        }
      }
    }
    return samples;
  }

  function analyze(draws, modeKey) {
    const mode = MODE_CONFIG[modeKey];
    const samples = buildSamples(draws, modeKey);
    const exactCounts = new Map();
    const digitCounts = Array.from({ length: 10 }, () => 0);
    const containingCounts = Array.from({ length: 10 }, () => 0);
    const positionCounts = Array.from({ length: mode.digits }, () =>
      Array.from({ length: 10 }, () => 0)
    );
    const yearDigitCounts = new Map();

    for (const sample of samples) {
      const existing = exactCounts.get(sample.value) || { count: 0, lastSeen: sample.date };
      existing.count += 1;
      existing.lastSeen = sample.date > existing.lastSeen ? sample.date : existing.lastSeen;
      exactCounts.set(sample.value, existing);

      const seenThisSample = new Set();
      sample.value.split("").forEach((digitChar, positionIndex) => {
        const digit = Number(digitChar);
        digitCounts[digit] += 1;
        positionCounts[positionIndex][digit] += 1;
        seenThisSample.add(digit);
      });

      if (!yearDigitCounts.has(sample.year)) {
        yearDigitCounts.set(sample.year, Array.from({ length: 10 }, () => 0));
      }
      const yearRow = yearDigitCounts.get(sample.year);
      seenThisSample.forEach((digit) => {
        containingCounts[digit] += 1;
        yearRow[digit] += 1;
      });
    }

    const sortedNumbers = [...exactCounts.entries()]
      .map(([value, meta]) => ({ value, count: meta.count, lastSeen: meta.lastSeen }))
      .sort((left, right) => right.count - left.count || right.lastSeen.localeCompare(left.lastSeen));

    const hottestDigit = digitCounts.reduce(
      (best, count, digit) => (count > best.count ? { digit, count } : best),
      { digit: 0, count: -1 }
    );
    const hottestNumber = sortedNumbers[0] || { value: "-", count: 0, lastSeen: "-" };

    const topByPosition = positionCounts.map((counts, index) => {
      const digit = counts.reduce(
        (best, count, digitValue) => (count > best.count ? { digit: digitValue, count } : best),
        { digit: 0, count: -1 }
      );
      return {
        label: mode.positions[index],
        digit: String(digit.digit),
        count: digit.count,
      };
    });

    return {
      mode,
      draws,
      samples,
      digitCounts,
      containingCounts,
      positionCounts,
      yearDigitCounts,
      sortedNumbers,
      hottestDigit,
      hottestNumber,
      topByPosition,
    };
  }

  function renderCoverage() {
    const latestDate = dataset.coverage.end;
    const latestText = dataset.latest && dataset.latest.date ? formatDate(dataset.latest.date) : "-";
    els.coverageFacts.innerHTML = `
      <div class="fact-block">
        <strong>${numberFormat(dataset.coverage.drawCount)}</strong>
        <span>งวดที่มีในฐานย้อนหลัง</span>
      </div>
      <div class="fact-block">
        <strong>${dataset.coverage.start ? formatDate(dataset.coverage.start) : "-"}</strong>
        <span>งวดแรกในฐานข้อมูลที่ดึงได้</span>
      </div>
      <div class="fact-block">
        <strong>${latestText}</strong>
        <span>งวดล่าสุดจาก API ทางการ</span>
      </div>
      <div class="fact-block">
        <strong>${dataset.coverage.years[0]}-${dataset.coverage.years.at(-1)}</strong>
        <span>ช่วงปีที่ dashboard รองรับ</span>
      </div>
    `;
  }

  function renderControls() {
    const options = dataset.coverage.years
      .map((year) => `<option value="${year}">${year}</option>`)
      .join("");
    els.startYear.innerHTML = options;
    els.endYear.innerHTML = options;
    els.startYear.value = String(state.startYear);
    els.endYear.value = String(state.endYear);
    els.modeSelect.innerHTML = Object.entries(MODE_CONFIG)
      .map(([key, config]) => `<option value="${key}">${config.label}</option>`)
      .join("");
    els.modeSelect.value = state.mode;

    els.startYear.addEventListener("change", () => {
      state.startYear = Number(els.startYear.value);
      if (state.startYear > state.endYear) {
        state.endYear = state.startYear;
        els.endYear.value = String(state.endYear);
      }
      render();
    });

    els.endYear.addEventListener("change", () => {
      state.endYear = Number(els.endYear.value);
      if (state.endYear < state.startYear) {
        state.startYear = state.endYear;
        els.startYear.value = String(state.startYear);
      }
      render();
    });

    els.modeSelect.addEventListener("change", () => {
      state.mode = els.modeSelect.value;
      state.focusDigit = null;
      render();
    });
  }

  function renderMetrics(analysisResult) {
    const focusDigit = state.focusDigit;
    const focusCount = analysisResult.containingCounts[focusDigit];
    els.metricCards.innerHTML = `
      <article class="metric">
        <div class="metric-label">งวดที่นำมาคิด</div>
        <div class="metric-value">${numberFormat(analysisResult.draws.length)}</div>
        <div class="metric-note">ช่วง ${state.startYear} ถึง ${state.endYear}</div>
      </article>
      <article class="metric">
        <div class="metric-label">จำนวน sample ที่วิเคราะห์</div>
        <div class="metric-value">${numberFormat(analysisResult.samples.length)}</div>
        <div class="metric-note">${analysisResult.mode.label}</div>
      </article>
      <article class="metric">
        <div class="metric-label">digit ที่พบมากสุดย้อนหลัง</div>
        <div class="metric-value">${analysisResult.hottestDigit.digit}</div>
        <div class="metric-note">${numberFormat(analysisResult.hottestDigit.count)} hits รวมทุกตำแหน่ง</div>
      </article>
      <article class="metric">
        <div class="metric-label">เลข exact ที่เจอบ่อยสุด</div>
        <div class="metric-value">${analysisResult.hottestNumber.value}</div>
        <div class="metric-note">${numberFormat(analysisResult.hottestNumber.count)} ครั้ง • ล่าสุด ${formatDate(
          analysisResult.hottestNumber.lastSeen
        )}</div>
      </article>
    `;
    els.modeNote.textContent = `${analysisResult.mode.note} ข้อควรระวัง: ความถี่ย้อนหลังไม่เท่ากับโอกาสถูกในงวดถัดไป`;
    els.modeNote.textContent +=
      " อีกข้อควรระวัง: โครงสร้างรางวัลใน API ปีเก่าไม่เหมือนปัจจุบันทุกงวด บางช่วงยังไม่มีเลขหน้า 3 ตัว และเลขท้าย 3 ตัวอาจมีจำนวนค่าต่อ draw ไม่เท่ากัน";
    els.digitOverviewMeta.textContent = `รวมการปรากฏทุกตำแหน่งใน ${numberFormat(
      analysisResult.samples.length
    )} sample`;
    els.digitFocusMeta.textContent = `digit ที่เลือกตอนนี้คือ ${focusDigit}`;
    els.historyMeta.textContent = `งวดล่าสุดในช่วงที่เลือก: ${
      analysisResult.draws.length ? formatDate(analysisResult.draws.at(-1).date) : "-"
    }`;
  }

  function renderDigitBars(analysisResult) {
    const maxCount = Math.max(...analysisResult.digitCounts, 1);
    els.digitBars.innerHTML = analysisResult.digitCounts
      .map((count, digit) => {
        const width = `${(count / maxCount) * 100}%`;
        return `
          <button class="digit-row digit-button-row" data-digit="${digit}">
            <span class="digit-tag">${digit}</span>
            <span class="digit-track"><span class="digit-fill" style="width:${width}"></span></span>
            <span class="digit-value">${numberFormat(count)}</span>
          </button>
        `;
      })
      .join("");

    els.digitBars.querySelectorAll(".digit-row").forEach((button) => {
      button.addEventListener("click", () => {
        state.focusDigit = Number(button.dataset.digit);
        render();
      });
      button.classList.toggle("active", Number(button.dataset.digit) === state.focusDigit);
    });
  }

  function renderDigitPicker() {
    els.digitPicker.innerHTML = Array.from({ length: 10 }, (_, digit) => {
      const active = digit === state.focusDigit ? "active" : "";
      return `<button class="digit-button ${active}" data-digit="${digit}">${digit}</button>`;
    }).join("");
    els.digitPicker.querySelectorAll(".digit-button").forEach((button) => {
      button.addEventListener("click", () => {
        state.focusDigit = Number(button.dataset.digit);
        render();
      });
    });
  }

  function renderFocusInsight(analysisResult) {
    const digit = state.focusDigit;
    const count = analysisResult.containingCounts[digit];
    const topMatches = analysisResult.sortedNumbers
      .filter((entry) => entry.value.includes(String(digit)))
      .slice(0, 3)
      .map((entry) => `${entry.value} (${entry.count})`)
      .join(" • ");
    els.focusInsight.innerHTML = `
      <div><strong>เลข ${digit}</strong> ปรากฏอยู่ใน ${numberFormat(count)} จาก ${numberFormat(
        analysisResult.samples.length
      )} sample หรือ ${percent(count, analysisResult.samples.length)}</div>
      <div class="mini-note">เลข exact ที่มี ${digit} และเจอบ่อยที่สุด: ${topMatches || "-"}</div>
    `;
  }

  function renderYearTrend(analysisResult) {
    const digit = state.focusDigit;
    const entries = [...analysisResult.yearDigitCounts.entries()].sort((left, right) => left[0] - right[0]);
    const maxValue = Math.max(...entries.map(([, counts]) => counts[digit]), 1);
    els.yearTrend.innerHTML = entries
      .map(([year, counts]) => {
        const value = counts[digit];
        const width = `${(value / maxValue) * 100}%`;
        return `
          <div class="year-row">
            <div class="year-label">${year}</div>
            <div class="year-track"><div class="year-fill" style="width:${width}"></div></div>
            <div class="year-value">${numberFormat(value)} sample</div>
          </div>
        `;
      })
      .join("");
  }

  function renderPositionSummary(analysisResult) {
    els.positionSummary.innerHTML = analysisResult.topByPosition
      .map(
        (item) => `
          <article class="position-card">
            <div class="metric-label">${item.label}</div>
            <strong>${item.digit}</strong>
            <div class="metric-note">${numberFormat(item.count)} hits</div>
          </article>
        `
      )
      .join("");
  }

  function renderHeatmap(analysisResult) {
    const maxCount = Math.max(...analysisResult.positionCounts.flat(), 1);
    const header = analysisResult.mode.positions.map((label) => `<th>${label}</th>`).join("");
    const rows = Array.from({ length: 10 }, (_, digit) => {
      const cells = analysisResult.positionCounts
        .map((column) => {
          const count = column[digit];
          const alpha = count / maxCount;
          return `<td><div class="heat-cell" style="background: rgba(179, 79, 40, ${0.12 + alpha * 0.48})">${numberFormat(
            count
          )}</div></td>`;
        })
        .join("");
      return `<tr><th>${digit}</th>${cells}</tr>`;
    }).join("");
    els.positionHeatmap.innerHTML = `
      <table class="heatmap-table">
        <thead>
          <tr>
            <th>digit</th>
            ${header}
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    `;
  }

  function renderTopNumbers(analysisResult) {
    const digit = String(state.focusDigit);
    const rows = analysisResult.sortedNumbers.slice(0, 18).map((entry) => {
      const match = entry.value.includes(digit);
      return `
        <tr>
          <td><span class="value-badge ${match ? "match" : ""}">${entry.value}</span></td>
          <td>${numberFormat(entry.count)}</td>
          <td>${formatDate(entry.lastSeen)}</td>
          <td>${match ? "ใช่" : "-"}</td>
        </tr>
      `;
    });
    els.topNumbersBody.innerHTML =
      rows.join("") ||
      `<tr><td colspan="4" class="empty">ไม่มีข้อมูลสำหรับช่วงปีที่เลือก</td></tr>`;
  }

  function modeValuesForDraw(draw, modeKey) {
    return MODE_CONFIG[modeKey].samples(draw)
      .map((sample) => `${sample.value} · ${sample.source}`)
      .join("<br>");
  }

  function renderHistory(analysisResult) {
    const digit = String(state.focusDigit);
    const rows = [...analysisResult.draws]
      .sort((left, right) => right.date.localeCompare(left.date))
      .slice(0, 28)
      .map((draw) => {
        const modeValues = MODE_CONFIG[state.mode]
          .samples(draw)
          .map((sample) => {
            const match = sample.value.includes(digit) ? "match" : "";
            return `<span class="value-badge ${match}">${sample.value}</span> <span class="history-mode">${sample.source}</span>`;
          })
          .join("<br>");
        return `
          <tr>
            <td>${formatDate(draw.date)}</td>
            <td>${draw.first || "-"}</td>
            <td>${draw.first_last3 || "-"}</td>
            <td>${(draw.last3f || []).join(" / ") || "-"}</td>
            <td>${(draw.last3b || []).join(" / ") || "-"}</td>
            <td>${draw.last2 || "-"}</td>
            <td>${modeValues || "-"}</td>
          </tr>
        `;
      });
    els.historyBody.innerHTML =
      rows.join("") ||
      `<tr><td colspan="7" class="empty">ไม่มีข้อมูลสำหรับช่วงปีที่เลือก</td></tr>`;
  }

  function render() {
    const draws = getFilteredDraws();
    const analysisResult = analyze(draws, state.mode);

    if (state.focusDigit == null) {
      state.focusDigit = analysisResult.hottestDigit.digit;
    }

    renderMetrics(analysisResult);
    renderDigitBars(analysisResult);
    renderDigitPicker();
    renderFocusInsight(analysisResult);
    renderYearTrend(analysisResult);
    renderPositionSummary(analysisResult);
    renderHeatmap(analysisResult);
    renderTopNumbers(analysisResult);
    renderHistory(analysisResult);
  }

  function renderLatestDrawBanner() {
    const el = document.querySelector("#latestDrawBanner");
    if (!el) return;

    // Historical draw array always has normalized fields (first, first_last3, last2, last3f, last3b)
    // Prefer that over the raw latest API object
    const lastHistoricalDraw = dataset.draws.at(-1);
    const draw = lastHistoricalDraw || null;

    if (!draw) { el.style.display = "none"; return; }

    // Determine draw date string
    const drawDateStr = String(draw.date || "");
    const isToday = drawDateStr === todayISO();
    const dateLabel = drawDateStr
      ? formatDate(drawDateStr)
      : "-";

    const first   = draw.first        || "-";
    const last2   = draw.last2        || (latestApiDraw?.data?.last2?.[0]) || "-";
    const last3f  = (draw.last3f?.length ? draw.last3f : []).join(" / ") || "-";
    const last3b  = (draw.last3b?.length ? draw.last3b : []).join(" / ") || "-";
    const last3r1 = draw.first_last3  || (first !== "-" && first.length >= 3 ? first.slice(-3) : "-");

    el.innerHTML = `
      <div class="ldb-head">
        <div class="ldb-title-row">
          <span class="panel-kicker">ผลล่าสุด</span>
          ${isToday ? `<span class="ldb-today-badge">🟢 วันนี้</span>` : ""}
        </div>
        <h2 class="ldb-date">${dateLabel}</h2>
      </div>
      <div class="ldb-grid">
        <div class="ldb-card ldb-card-main">
          <span class="ldb-label">รางวัลที่ 1</span>
          <strong class="ldb-number ldb-number-xl">${first}</strong>
        </div>
        <div class="ldb-card">
          <span class="ldb-label">3 หลักท้ายรางวัลที่ 1</span>
          <strong class="ldb-number">${last3r1}</strong>
        </div>
        <div class="ldb-card">
          <span class="ldb-label">เลขท้าย 2 ตัว</span>
          <strong class="ldb-number">${last2}</strong>
        </div>
        <div class="ldb-card">
          <span class="ldb-label">เลขหน้า 3 ตัว</span>
          <strong class="ldb-number ldb-number-sm">${last3f}</strong>
        </div>
        <div class="ldb-card">
          <span class="ldb-label">เลขท้าย 3 ตัว</span>
          <strong class="ldb-number ldb-number-sm">${last3b}</strong>
        </div>
      </div>
    `;
  }

  renderLatestDrawBanner();
  renderCoverage();
  renderControls();
  render();
})();


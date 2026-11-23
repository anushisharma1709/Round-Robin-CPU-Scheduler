const $ = (id) => document.getElementById(id);
let processes = [];
let lastResult = null;
let quantum = 2;
let liveProcessCache = [];

function makeProcess(arrivalTime = 0, burstTime = 4, name = "") {
  return { arrivalTime, burstTime, name };
}
function showError(message = "") { $("error").textContent = message; }
function escapeHtml(value) { return String(value).replace(/[&<>"']/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch])); }
function renderProcessRows() {
  const tbody = $("processRows");
  tbody.innerHTML = "";
  processes.forEach((p, i) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><span class="pid" title="${p.name || `Process ${i+1}`}">${escapeHtml(p.name || `P${i + 1}`)}</span></td>
      <td><input class="process-input" aria-label="P${i+1} arrival time" type="number" min="0" step="1" value="${p.arrivalTime}" data-index="${i}" data-field="arrivalTime"></td>
      <td><input class="process-input" aria-label="P${i+1} burst time" type="number" min="1" step="1" value="${p.burstTime}" data-index="${i}" data-field="burstTime"></td>
      <td><button class="delete-btn" data-remove="${i}" aria-label="Remove P${i+1}" title="Remove process">×</button></td>`;
    tbody.appendChild(tr);
  });
  $("processCount").textContent = `${processes.length} process${processes.length === 1 ? "" : "es"} configured`;
}
function resetResults() {
  lastResult = null;
  $("statProcesses").textContent = "—";
  $("statQuantum").textContent = "—";
  $("statCpu").textContent = "—";
  $("statSwitches").textContent = "—";
  $("timelineTotal").textContent = "Run simulation to view";
  $("gantt").className = "gantt-empty";
  $("gantt").textContent = "Your Gantt chart will appear here after you run the simulation.";
  $("timeAxis").innerHTML = "";
  $("resultRows").innerHTML = '<tr><td colspan="7" class="empty-cell">No results yet. Run the simulation first.</td></tr>';
  $("avgWt").textContent = "—";
  $("avgTat").textContent = "—";
  $("avgRt").textContent = "—";
  $("metricsChart").innerHTML = '<p class="chart-placeholder">Run simulation to display the graph.</p>';
  $("histogramChart").innerHTML = '<p class="chart-placeholder">Run simulation to display the histogram.</p>';
  $("averageChart").innerHTML = '<p class="chart-placeholder">Run simulation to display the graph.</p>';
  $("csvBtn").disabled = true;
  $("downloadComparisonBtn").disabled = true;
  $("downloadAverageBtn").disabled = true;
  $("downloadHistogramBtn").disabled = true;
}
function loadSample() {
  processes = [
    makeProcess(0, 5, "P1"),
    makeProcess(1, 6, "P2"),
    makeProcess(2, 7, "P3"),
    makeProcess(3, 7, "P4")
  ];
  $("quantum").value = 2;
  showError();
  renderProcessRows();
  resetResults();
}
$("addBtn").addEventListener("click", () => {
  if (processes.length >= 100) return showError("Maximum 100 processes are allowed.");
  processes.push(makeProcess(0, 1, `P${processes.length + 1}`));
  renderProcessRows();
  resetResults();
  showError();
});
$("sampleBtn").addEventListener("click", loadSample);
$("resetBtn").addEventListener("click", () => { loadSample(); });
$("processRows").addEventListener("input", (event) => {
  const input = event.target.closest("input[data-index]");
  if (!input) return;
  processes[Number(input.dataset.index)][input.dataset.field] = input.value;
  resetResults();
});
$("processRows").addEventListener("click", (event) => {
  const button = event.target.closest("button[data-remove]");
  if (!button) return;
  processes.splice(Number(button.dataset.remove), 1);
  renderProcessRows();
  resetResults();
  showError();
});
function renderResult(data, q) {
  lastResult = { ...data, quantum: q };
  $("statProcesses").textContent = data.processes.length;
  $("statQuantum").textContent = q;
  $("statCpu").textContent = `${data.cpuUtilization.toFixed(2)}%`;
  $("statSwitches").textContent = data.contextSwitches;
  $("timelineTotal").textContent = `${data.totalTime} time units`;
  const gantt = $("gantt");
  gantt.className = "gantt";
  gantt.innerHTML = "";
  data.gantt.forEach((entry) => {
    const block = document.createElement("div");
    block.className = "gantt-block";
    const duration = entry.endTime - entry.startTime;
    const blockWidth = Math.max(88, duration * 30);
    block.style.flex = `0 0 ${blockWidth}px`;
    block.title = `${data.processes.find(p => p.pid === entry.processId)?.name || `P${entry.processId}`}: ${entry.startTime} to ${entry.endTime}`;
    block.innerHTML = `<strong>${escapeHtml(data.processes.find(p => p.pid === entry.processId)?.name || `P${entry.processId}`)}</strong><small>${entry.startTime}–${entry.endTime}</small>`;
    gantt.appendChild(block);
  });
  $("timeAxis").innerHTML = data.gantt.map(e => { const width = Math.max(88, (e.endTime - e.startTime) * 30); return `<span style="flex:0 0 ${width}px;min-width:${width}px">${e.endTime}</span>`; }).join("");
  $("gantt").style.width = "max-content";
  $("timeAxis").style.width = "max-content";
  const rows = $("resultRows");
  rows.innerHTML = "";
  data.processes.forEach(p => {
    const tr = document.createElement("tr");
    [ p.name || `P${p.pid}`, p.arrivalTime, p.burstTime, p.completionTime, p.turnaroundTime, p.waitingTime, p.responseTime ]
      .forEach((value, i) => {
        const td = document.createElement("td");
        td.textContent = value;
        if (i === 0) { const badge = document.createElement("span"); badge.className = "pid"; badge.textContent = value; td.textContent = ""; td.appendChild(badge); }
        tr.appendChild(td);
      });
    rows.appendChild(tr);
  });
  $("avgWt").textContent = data.averages.waitingTime.toFixed(2);
  $("avgTat").textContent = data.averages.turnaroundTime.toFixed(2);
  $("avgRt").textContent = data.averages.responseTime.toFixed(2);
  renderCharts(data);
  $("csvBtn").disabled = false;
  $("downloadComparisonBtn").disabled = false;
  $("downloadAverageBtn").disabled = false;
  $("downloadHistogramBtn").disabled = false;
}
function renderCharts(data) {
  const colors = { waitingTime: "#6475f5", turnaroundTime: "#25b98a", responseTime: "#f6a63b" };
  const maxValue = Math.max(1, ...data.processes.flatMap(p => [p.waitingTime, p.turnaroundTime, p.responseTime]));
  const chart = $("metricsChart");
  chart.innerHTML = "";
  data.processes.forEach(p => {
    const group = document.createElement("div");
    group.className = "metric-group";
    const label = document.createElement("div"); label.className = "metric-process"; label.textContent = p.name || `P${p.pid}`; group.appendChild(label);
    const bars = document.createElement("div"); bars.className = "metric-bars";
    [["waitingTime", p.waitingTime], ["turnaroundTime", p.turnaroundTime], ["responseTime", p.responseTime]].forEach(([key, value]) => {
      const line = document.createElement("div"); line.className = "metric-bar-line";
      const bar = document.createElement("div"); bar.className = "metric-bar"; bar.style.width = `${Math.max(value === 0 ? 0 : 2, value / maxValue * 100)}%`; bar.style.background = colors[key]; bar.title = `${key}: ${value}`;
      const number = document.createElement("span"); number.textContent = value; number.style.color = colors[key];
      line.append(bar, number); bars.appendChild(line);
    });
    group.appendChild(bars); chart.appendChild(group);
  });
  // A second, grouped vertical histogram gives the same process metrics a classic histogram view.
  const histogram = $("histogramChart");
  histogram.innerHTML = "";
  const histogramData = data.processes;
  const histogramMax = Math.max(1, ...histogramData.flatMap(p => [p.waitingTime, p.turnaroundTime, p.responseTime]));
  const plot = document.createElement("div"); plot.className = "histogram-plot";
  histogramData.forEach(p => {
    const column = document.createElement("div"); column.className = "histogram-process";
    const bars = document.createElement("div"); bars.className = "histogram-bars";
    [["waitingTime",p.waitingTime], ["turnaroundTime",p.turnaroundTime], ["responseTime",p.responseTime]].forEach(([key,value]) => {
      const item = document.createElement("div"); item.className = "histogram-column-wrap";
      const val = document.createElement("span"); val.className = "histogram-value"; val.textContent = value;
      const bar = document.createElement("div"); bar.className = "histogram-column"; bar.style.height = `${Math.max(value === 0 ? 0 : 2, value / histogramMax * 150)}px`; bar.style.background = colors[key]; bar.title = `${p.name || `P${p.pid}`} · ${key}: ${value}`;
      item.append(val, bar); bars.appendChild(item);
    });
    const label = document.createElement("div"); label.className = "histogram-label"; label.textContent = p.name || `P${p.pid}`; label.title = label.textContent;
    column.append(bars,label); plot.appendChild(column);
  });
  histogram.appendChild(plot);
  const averages = [
    { label: "Avg. Waiting", value: data.averages.waitingTime, color: colors.waitingTime },
    { label: "Avg. Turnaround", value: data.averages.turnaroundTime, color: colors.turnaroundTime },
    { label: "Avg. Response", value: data.averages.responseTime, color: colors.responseTime }
  ];
  const maxAvg = Math.max(1, ...averages.map(a => a.value));
  const averageChart = $("averageChart"); averageChart.innerHTML = "";
  const averageLayout = document.createElement("div"); averageLayout.className = "average-layout";
  const barsPanel = document.createElement("div"); barsPanel.className = "average-bars-panel";
  averages.forEach(a => {
    const item = document.createElement("div"); item.className = "average-bar-item";
    const top = document.createElement("div"); top.className = "average-bar-top";
    const label = document.createElement("span"); label.textContent = a.label;
    const value = document.createElement("strong"); value.textContent = a.value.toFixed(2); value.style.color = a.color; top.append(label, value);
    const track = document.createElement("div"); track.className = "average-track";
    const fill = document.createElement("div"); fill.className = "average-fill"; fill.style.width = `${a.value / maxAvg * 100}%`; fill.style.background = a.color; track.appendChild(fill);
    item.append(top, track); barsPanel.appendChild(item);
  });
  const piePanel = document.createElement("div"); piePanel.className = "average-pie-panel";
  const pieTitle = document.createElement("h3"); pieTitle.textContent = "Average metrics distribution"; piePanel.appendChild(pieTitle);
  const total = averages.reduce((sum, a) => sum + Math.max(0, a.value), 0);
  const pie = document.createElement("div"); pie.className = "average-pie";
  let angle = 0;
  const stops = averages.map(a => {
    const share = total > 0 ? Math.max(0, a.value) / total * 360 : 0;
    const stop = `${a.color} ${angle}deg ${angle + share}deg`; angle += share; return stop;
  });
  pie.style.background = total > 0 ? `conic-gradient(${stops.join(",")})` : "#e9edf5";
  pie.setAttribute("role", "img");
  pie.setAttribute("aria-label", averages.map(a => `${a.label}: ${a.value.toFixed(2)}`).join(", "));
  piePanel.appendChild(pie);
  const legend = document.createElement("div"); legend.className = "pie-legend";
  averages.forEach(a => {
    const item = document.createElement("div"); item.className = "pie-legend-item";
    const dot = document.createElement("i"); dot.style.background = a.color;
    const label = document.createElement("span"); label.textContent = a.label.replace("Avg. ", "");
    const value = document.createElement("strong"); value.textContent = `${a.value.toFixed(2)}${total > 0 ? ` · ${(a.value / total * 100).toFixed(1)}%` : ""}`;
    item.append(dot, label, value); legend.appendChild(item);
  });
  piePanel.appendChild(legend); averageLayout.append(barsPanel, piePanel); averageChart.appendChild(averageLayout);
}

$("runBtn").addEventListener("click", async () => {
  showError();
  const q = Number($("quantum").value);
  if (!Number.isInteger(q) || q <= 0) return showError("Time quantum must be a positive integer.");
  if (processes.length < 1 || processes.length > 100) return showError("Add between 1 and 100 processes.");
  const values = processes.map((p, i) => ({ name: p.name || `P${i+1}`, arrivalTime: Number(p.arrivalTime), burstTime: Number(p.burstTime) }));
  for (let i = 0; i < values.length; i++) {
    if (!Number.isInteger(values[i].arrivalTime) || values[i].arrivalTime < 0)
      return showError(`P${i+1}: arrival time must be a non-negative integer.`);
    if (!Number.isInteger(values[i].burstTime) || values[i].burstTime <= 0)
      return showError(`P${i+1}: burst time must be a positive integer.`);
  }
  const button = $("runBtn");
  button.disabled = true; button.textContent = "Running…";
  try {
    const response = await fetch("/api/simulate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ processes: values, quantum: q })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Simulation failed.");
    renderResult(data, q);
  } catch (err) {
    showError(`Could not run simulation: ${err.message}. Make sure server.js is running.`);
  } finally {
    button.disabled = false; button.textContent = "▶ Run simulation";
  }
});
$("csvBtn").addEventListener("click", () => {
  if (!lastResult) return;
  const d = lastResult;
  const lines = [
    "PROCESS,PID,AT,BT,CT,TAT,WT,RT",
    ...d.processes.map(p => [p.name || `P${p.pid}`, `P${p.pid}`, p.arrivalTime, p.burstTime, p.completionTime, p.turnaroundTime, p.waitingTime, p.responseTime].join(",")),
    "",
    `Average Waiting Time,${d.averages.waitingTime.toFixed(2)}`,
    `Average Turnaround Time,${d.averages.turnaroundTime.toFixed(2)}`,
    `Average Response Time,${d.averages.responseTime.toFixed(2)}`,
    `CPU Utilization,${d.cpuUtilization.toFixed(2)}%`,
    `Context Switches,${d.contextSwitches}`
  ];
  const blob = new Blob([lines.join("\r\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = "round_robin_results.csv"; a.click();
  URL.revokeObjectURL(url);
});
function formatDuration(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return "Time unavailable";
  const total = Math.floor(seconds), days = Math.floor(total / 86400), hours = Math.floor((total % 86400) / 3600), mins = Math.floor((total % 3600) / 60), secs = total % 60;
  return days ? `${days}d ${hours}h ${mins}m` : hours ? `${hours}h ${mins}m ${secs}s` : mins ? `${mins}m ${secs}s` : `${secs}s`;
}
function renderLiveProcessList() {
  const list = $("liveProcessList");
  const query = ($("liveSearch").value || "").trim().toLowerCase();
  const matches = liveProcessCache.filter(proc => `${proc.name} ${proc.pid} ${proc.appLabel || ""} ${proc.mainWindowTitle || ""}`.toLowerCase().includes(query));
  list.innerHTML = "";
  if (!matches.length) {
    const empty = document.createElement("div"); empty.className = "live-empty";
    empty.textContent = query ? `No detected app matches “${query}”.` : "No visible application windows detected yet. Open an app and refresh.";
    list.appendChild(empty); return;
  }
  matches.forEach(proc => {
    const item = document.createElement("div"); item.className = "live-process-item";
    const badge = document.createElement("span"); badge.className = "live-app-badge"; badge.textContent = "LIVE";
    const details = document.createElement("span"); details.className = "live-process-details";
    const name = document.createElement("span"); name.className = "live-process-name"; name.textContent = proc.appLabel || proc.mainWindowTitle || proc.name.replace(/\.exe$/i, "");
    const meta = document.createElement("small"); meta.textContent = `${proc.name} · PID ${proc.pid} · ${proc.startTime ? formatDuration((Date.now() - new Date(proc.startTime).getTime()) / 1000) + " running" : "runtime unavailable"}`;
    const cpu = document.createElement("small"); cpu.className = "live-process-meta"; cpu.textContent = `CPU time ${proc.cpuSeconds == null ? "N/A" : formatDuration(proc.cpuSeconds)} · RAM ${proc.memoryMB} MB`;
    details.append(name, meta, cpu); item.append(badge, details); list.appendChild(item);
  });
}
async function refreshLiveProcesses() {
  const status = $("liveStatus");
  try {
    const response = await fetch(`/api/processes?t=${Date.now()}`, { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Could not load processes.");
    const labels = { "code.exe": "Visual Studio Code", "msedge.exe": "Microsoft Edge", "explorer.exe": "File Explorer", "postman.exe": "Postman", "chrome.exe": "Google Chrome", "firefox.exe": "Firefox", "notepad.exe": "Notepad", "winword.exe": "Microsoft Word", "excel.exe": "Microsoft Excel", "powerpnt.exe": "Microsoft PowerPoint", "whatsapp.root.exe": "WhatsApp", "copilotapp.exe": "Copilot", "applicationframehost.exe": "Settings", "systemsettings.exe": "Settings", "textinputhost.exe": "Windows Input Experience" };
    const rawVisible = data.processes
      .filter(proc => proc.mainWindowHandle > 0 && (proc.mainWindowTitle || "").trim())
      .map(proc => ({ ...proc, appLabel: labels[proc.name.toLowerCase()] || (proc.mainWindowTitle || "").trim() || proc.name.replace(/\.exe$/i, "") }))
      .filter(proc => !["settings", "windows input experience"].includes(proc.appLabel.toLowerCase()) && !["applicationframehost.exe", "systemsettings.exe", "textinputhost.exe", "msedgewebview2.exe", "runtimebroker.exe", "shellexperiencehost.exe"].includes(proc.name.toLowerCase()))
      .sort((a,b) => a.appLabel.localeCompare(b.appLabel));
    // Keep one representative visible-window process per application, not every helper PID.
    const uniqueApps = new Map();
    rawVisible.forEach(proc => { const key = proc.appLabel.toLowerCase(); if (!uniqueApps.has(key)) uniqueApps.set(key, proc); });
    liveProcessCache = [...uniqueApps.values()];
    renderLiveProcessList();
    // Automatically sync clean app names; retain any user-edited timing values by app name.
    const existing = new Map(processes.map(p => [String(p.name || "").replace(/ \(PID \d+\)$/i, "").toLowerCase(), p]));
    const detected = liveProcessCache.map(proc => {
      const name = proc.appLabel;
      const prior = existing.get(name.toLowerCase());
      return prior ? makeProcess(Number(prior.arrivalTime), Number(prior.burstTime), name) : makeProcess(0, 4, name);
    });
    const manual = processes.filter(p => !/^P\d+$/.test(p.name || "") && !liveProcessCache.some(proc => proc.appLabel.toLowerCase() === String(p.name || "").replace(/ \(PID \d+\)$/i, "").toLowerCase()));
    const next = [...detected, ...manual].slice(0, 100);
    const changed = next.length !== processes.length || next.some((p,i) => p.name !== processes[i]?.name);
    if (changed) { processes = next; renderProcessRows(); resetResults(); }
    const visible = liveProcessCache.length;
    status.textContent = `${visible} visible app process(es) detected · auto-synced to configuration · refreshed ${new Date().toLocaleTimeString()}. Burst Time is a simulation input, not live CPU time.`;
  } catch (error) { status.textContent = `${error.message} Run this project on Windows using node server.js.`; }
}
$("liveSearch").addEventListener("input", renderLiveProcessList);
$("refreshLiveBtn").addEventListener("click", refreshLiveProcesses);
$("refreshLiveBtn2")?.addEventListener("click", refreshLiveProcesses);

function downloadSvg(filename, title, body, width = 1000, height = 600) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="#ffffff"/><text x="28" y="38" font-family="Arial,sans-serif" font-size="22" font-weight="700" fill="#202943">${escapeHtml(title)}</text>${body}</svg>`;
  const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = filename; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function exportComparison() {
  if (!lastResult) return;
  const data = lastResult, width = 1100, left = 250, barMax = 650, rowH = 78, top = 78;
  const max = Math.max(1, ...data.processes.flatMap(p => [p.waitingTime,p.turnaroundTime,p.responseTime]));
  const colors = ["#6475f5", "#25b98a", "#f6a63b"];
  let body = `<text x="${left}" y="62" font-family="Arial" font-size="13" fill="#667085">Waiting time · Turnaround time · Response time (time units)</text>`;
  data.processes.forEach((p,i) => { const y=top+i*rowH; body += `<text x="28" y="${y+16}" font-family="Arial" font-size="13" fill="#34415e">${escapeHtml(p.name)}</text>`; [p.waitingTime,p.turnaroundTime,p.responseTime].forEach((v,j)=>{ const by=y+j*19+24, w=Math.max(v===0?0:2,v/max*barMax); body += `<rect x="${left}" y="${by}" width="${w}" height="12" rx="4" fill="${colors[j]}"/><text x="${left+w+8}" y="${by+10}" font-family="Arial" font-size="11" fill="${colors[j]}">${v}</text>`; }); });
  downloadSvg("process-time-comparison.svg","Process Time Comparison",body,width,top+data.processes.length*rowH+20);
}
function exportHistogram() {
  if (!lastResult) return;
  const data = lastResult, width = Math.max(900, data.processes.length * 115 + 100), height = 480;
  const colors = ["#6475f5", "#25b98a", "#f6a63b"], keys = ["waitingTime", "turnaroundTime", "responseTime"];
  const max = Math.max(1, ...data.processes.flatMap(p => keys.map(k => p[k])));
  const baseY = 365, plotHeight = 245, groupW = (width - 100) / data.processes.length;
  let body = `<text x="28" y="65" font-family="Arial" font-size="16" font-weight="700" fill="#202943">Grouped histogram: process time comparison</text>`;
  for (let tick = 0; tick <= 4; tick++) { const y = baseY - tick * plotHeight / 4, value = max * tick / 4; body += `<line x1="65" y1="${y}" x2="${width-25}" y2="${y}" stroke="#e8edf5"/><text x="55" y="${y+4}" text-anchor="end" font-family="Arial" font-size="10" fill="#7d879b">${value.toFixed(1)}</text>`; }
  data.processes.forEach((p,i) => {
    const gx = 75 + i * groupW;
    keys.forEach((key,j) => { const value = p[key], h = value / max * plotHeight, x = gx + j * 21; body += `<rect x="${x}" y="${baseY-h}" width="16" height="${h}" rx="3" fill="${colors[j]}"/><text x="${x+8}" y="${baseY-h-6}" text-anchor="middle" font-family="Arial" font-size="9" fill="${colors[j]}">${value}</text>`; });
    body += `<text x="${gx+22}" y="${baseY+22}" text-anchor="middle" font-family="Arial" font-size="10" fill="#34415e">${escapeHtml(p.name || `P${p.pid}`).slice(0,16)}</text>`;
  });
  const legendY = 430;
  ["Waiting Time", "Turnaround Time", "Response Time"].forEach((label,i) => { const x=width/2-170+i*125; body+=`<rect x="${x}" y="${legendY-10}" width="10" height="10" rx="2" fill="${colors[i]}"/><text x="${x+15}" y="${legendY}" font-family="Arial" font-size="10" fill="#667085">${label}</text>`; });
  downloadSvg("process-time-grouped-histogram.svg", "Process Time Grouped Histogram", body, width, height);
}

function exportAverage() {
  if (!lastResult) return;
  const vals = [
    {label:"Average Waiting Time",value:lastResult.averages.waitingTime,color:"#6475f5"},
    {label:"Average Turnaround Time",value:lastResult.averages.turnaroundTime,color:"#25b98a"},
    {label:"Average Response Time",value:lastResult.averages.responseTime,color:"#f6a63b"}
  ];
  const max=Math.max(1,...vals.map(v=>v.value));
  let body=`<text x="28" y="65" font-family="Arial" font-size="16" font-weight="700" fill="#202943">Average metrics comparison</text>`;
  vals.forEach((v,i)=>{const y=100+i*95,w=v.value/max*480;body+=`<text x="28" y="${y}" font-family="Arial" font-size="14" fill="#667085">${v.label}</text><text x="520" y="${y}" font-family="Arial" font-size="14" font-weight="700" fill="${v.color}">${v.value.toFixed(2)}</text><rect x="28" y="${y+13}" width="500" height="15" rx="7" fill="#f0f2f8"/><rect x="28" y="${y+13}" width="${w}" height="15" rx="7" fill="${v.color}"/>`;});
  const total=vals.reduce((sum,v)=>sum+Math.max(0,v.value),0), cx=760, cy=235, r=105;
  let angle=-Math.PI/2;
  vals.forEach(v=>{
    const portion=total>0?Math.max(0,v.value)/total:0, next=angle+portion*Math.PI*2;
    if(portion>0){
      const x1=cx+r*Math.cos(angle), y1=cy+r*Math.sin(angle), x2=cx+r*Math.cos(next), y2=cy+r*Math.sin(next), large=portion>0.5?1:0;
      body+=`<path d="M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z" fill="${v.color}" stroke="#ffffff" stroke-width="2"/>`;
    }
    angle=next;
  });
  body+=`<text x="760" y="90" text-anchor="middle" font-family="Arial" font-size="16" font-weight="700" fill="#202943">Distribution</text>`;
  vals.forEach((v,i)=>{const y=385+i*28;body+=`<rect x="635" y="${y-12}" width="12" height="12" rx="3" fill="${v.color}"/><text x="655" y="${y}" font-family="Arial" font-size="12" fill="#667085">${v.label}</text><text x="940" y="${y}" text-anchor="end" font-family="Arial" font-size="12" font-weight="700" fill="${v.color}">${v.value.toFixed(2)} (${total>0?(v.value/total*100).toFixed(1):"0.0"}%)</text>`;});
  downloadSvg("average-performance-with-pie-chart.svg","Average Performance & Pie Chart",body,1000,490);
}
$("downloadComparisonBtn").addEventListener("click", exportComparison);
$("downloadAverageBtn").addEventListener("click", exportAverage);
$("downloadHistogramBtn").addEventListener("click", exportHistogram);
// Keep timeline blocks and their matching time scale horizontally aligned.
$("timelineViewport").addEventListener("scroll", () => {});
// Sidebar selection follows the section currently in view, including scroll and clicks.
const navLinks = [...document.querySelectorAll(".nav[href^='#']")];
navLinks.forEach(link => link.addEventListener("click", () => { navLinks.forEach(item => item.classList.toggle("active", item === link)); }));
if ("IntersectionObserver" in window) {
  const navObserver = new IntersectionObserver(entries => {
    const visible = entries.filter(entry => entry.isIntersecting).sort((a,b) => b.intersectionRatio-a.intersectionRatio)[0];
    if (visible) navLinks.forEach(link => link.classList.toggle("active", link.getAttribute("href") === `#${visible.target.id}`));
  }, { rootMargin: "-15% 0px -65% 0px", threshold: [0, .2, .5] });
  [$("dashboard"), $("processes"), $("results"), $("performanceMetrics")].forEach(section => navObserver.observe(section));
}

setInterval(refreshLiveProcesses, 3000);
refreshLiveProcesses();

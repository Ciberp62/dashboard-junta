/**
 * app.js - Logic and Data Integration for Liceo Del Sur Financial Dashboard
 * Published at: https://ciberp62.github.io/dashboard-junta/
 */

// Default Apps Script API Web App URL
const DEFAULT_API_URL = "https://script.google.com/macros/s/AKfycbwFEtOnz4ILSpWrT73Lkme0NrWQGS08LiozXkopOzANWoBDLmNmBu5vmRA67uw1FXewhg/exec";

// Security: Token for API validation (must match the DASHBOARD_TOKEN constant in Apps Script)
const API_TOKEN = "JLS2026-SECURE-K7XQ";

// Allowed origin for validation on the client side
const ALLOWED_ORIGIN = "https://ciberp62.github.io";

// Sanitize text to avoid XSS in dynamic DOM insertions
function sanitize(str) {
  const div = document.createElement("div");
  div.textContent = String(str || "");
  return div.innerHTML;
}

// Source of Financing Mapping Configuration
const CODE_SOURCE_MAP = {
  "0.01.01": "Cocineras",
  "1.02.01": "Ley 6746",
  "1.02.02": "Ley 6746",
  "1.02.04": "Ley 6746",
  "1.03.03": "Ley 6746",
  "1.04.04": "Ley 7552",
  "1.04.06": "Ley 6746",
  "1.05.01": "Ley 6746",
  "1.06.01": "Ley 6746",
  "2.01.01": "Ley 7552",
  "2.02.03": "Alimentos (PAE)",
  "2.03.99": "Bingo",
  "2.99.01": "Ley 6746",
  "2.99.04": "Venta de Uniformes / Propios",
  "2.99.05": "Ley 7552",
  "2.99.06": "Ley 6746",
  "9.99.99": "Otros"
};

// Global App State
let appData = {
  presupuestos: [],
  ejecutados: []
};
let chartInstance = null;

// Currency Formatter (Costa Rican Colones)
const formatColones = (value) => {
  return new Intl.NumberFormat("es-CR", {
    style: "currency",
    currency: "CRC",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value);
};

// DOM Elements
const selectYear = document.getElementById("select-year");
const selectMonth = document.getElementById("select-month");
const apiStatusDot = document.querySelector("#api-status .status-dot");
const apiStatusText = document.querySelector("#api-status .status-text");

const kpiBudget = document.getElementById("kpi-budget");
const kpiExecuted = document.getElementById("kpi-executed");
const kpiRemaining = document.getElementById("kpi-remaining");
const kpiPercentage = document.getElementById("kpi-percentage");
const kpiPercentageStatus = document.getElementById("kpi-percentage-status");
const globalProgress = document.getElementById("global-progress");

const tableSourcesBody = document.querySelector("#table-sources tbody");
const tableSubpartidasBody = document.querySelector("#table-subpartidas tbody");
const searchSubpartidas = document.getElementById("search-subpartidas");

const sourcePeriodBadge = document.getElementById("source-period-badge");

// Initialize Application
document.addEventListener("DOMContentLoaded", () => {
  // Event Listeners
  selectYear.addEventListener("change", processAndRender);
  selectMonth.addEventListener("change", processAndRender);
  searchSubpartidas.addEventListener("input", processAndRender);

  // First fetch
  fetchData();
});

// Fetch Data from Apps Script
async function fetchData() {
  setLoadingState(true);
  const apiUrl = DEFAULT_API_URL;
  
  try {
    // Append security token to every request
    const secureUrl = `${apiUrl}?token=${encodeURIComponent(API_TOKEN)}`;
    const response = await fetch(secureUrl, { mode: "cors" });
    if (!response.ok) throw new Error("Respuesta de API incorrecta");
    const data = await response.json();
    
    if (data.status === "success") {
      appData.presupuestos = data.presupuestos || [];
      appData.ejecutados = data.ejecutados || [];
      
      setApiStatus("success", "Conectado");
      processAndRender();
    } else {
      throw new Error(data.message || "Error al procesar datos");
    }
  } catch (error) {
    console.error("API Fetch Error:", error);
    setApiStatus("error", "Error de conexión");
  } finally {
    setLoadingState(false);
  }
}

function setLoadingState(isLoading) {
  if (isLoading) {
    setApiStatus("warning", "Cargando...");
  }
}

function setApiStatus(status, text) {
  apiStatusDot.className = "status-dot " + (status === "success" ? "green" : status === "warning" ? "orange" : "red");
  apiStatusText.textContent = text;
}

// Process data according to filters and render UI
function processAndRender() {
  const selectedYearVal = parseInt(selectYear.value);
  const selectedMonthVal = selectMonth.value; // "all" or "1"-"12"
  const searchTerm = searchSubpartidas.value.toLowerCase().trim();

  // Filter raw data by selected year
  const yearBudgets = appData.presupuestos.filter(p => p.anio === selectedYearVal);
  const yearExecuted = appData.ejecutados.filter(e => e.anio === selectedYearVal);

  // Group budget details by code
  const budgetMap = {};
  yearBudgets.forEach(b => {
    budgetMap[b.codigo] = {
      subpartida: b.subpartida,
      inicial: b.inicial,
      total: b.total
    };
  });

  // Calculate executed amounts based on the selected period
  const processedData = [];
  
  // Keep track of all codes to make sure we render even non-executed ones
  const allCodes = new Set([...Object.keys(budgetMap), ...yearExecuted.map(e => e.codigo)]);

  allCodes.forEach(code => {
    const budgetInfo = budgetMap[code] || { subpartida: "Sin Presupuesto", inicial: 0, total: 0 };
    const execRow = yearExecuted.find(e => e.codigo === code);
    
    let executedAmount = 0;
    if (execRow && execRow.meses) {
      if (selectedMonthVal === "all") {
        // Sum all 12 months
        executedAmount = execRow.meses.reduce((sum, val) => sum + val, 0);
      } else {
        // Sum up to selected month (accumulated)
        const limitMonth = parseInt(selectedMonthVal);
        for (let m = 0; m < limitMonth; m++) {
          executedAmount += execRow.meses[m] || 0;
        }
      }
    }

    const budgetTotal = budgetInfo.total;
    const remaining = budgetTotal - executedAmount;
    const pct = budgetTotal > 0 ? (executedAmount / budgetTotal) * 100 : 0;
    
    processedData.push({
      codigo: code,
      subpartida: budgetInfo.subpartida,
      presupuesto: budgetTotal,
      ejecutado: executedAmount,
      saldo: remaining,
      porcentaje: pct,
      source: CODE_SOURCE_MAP[code] || "Otros"
    });
  });

  // Calculate Overall KPIs
  let totalBudget = 0;
  let totalExecuted = 0;
  
  processedData.forEach(item => {
    totalBudget += item.presupuesto;
    totalExecuted += item.ejecutado;
  });
  
  const totalRemaining = totalBudget - totalExecuted;
  const globalPct = totalBudget > 0 ? (totalExecuted / totalBudget) * 100 : 0;

  // Render KPIs values
  kpiBudget.textContent = formatColones(totalBudget);
  kpiExecuted.textContent = formatColones(totalExecuted);
  kpiRemaining.textContent = formatColones(totalRemaining);
  
  // Custom Gauge/Circular Progress Render
  kpiPercentage.textContent = globalPct.toFixed(2) + "%";
  globalProgress.style.background = `radial-gradient(closest-side, #0b0f19 79%, transparent 80% 100%), conic-gradient(var(--blue-primary) ${globalPct}%, rgba(255, 255, 255, 0.05) ${globalPct}%)`;
  
  // Expected progress description based on month selection
  if (selectedMonthVal === "all") {
    kpiPercentageStatus.textContent = "Esperado anual: ~100%";
    sourcePeriodBadge.textContent = "Anual";
  } else {
    const monthNum = parseInt(selectedMonthVal);
    const expectedPct = ((monthNum / 12) * 100).toFixed(0);
    kpiPercentageStatus.textContent = `Esperado al mes ${monthNum}: ~${expectedPct}%`;
    sourcePeriodBadge.textContent = `Acum. a Mes ${monthNum}`;
  }

  // Update Saldo indicator color if remaining is negative
  const remainingIcon = document.getElementById("kpi-saldo-icon");
  if (totalRemaining < 0) {
    remainingIcon.className = "kpi-icon red";
  } else {
    remainingIcon.className = "kpi-icon green";
  }

  // Group by Financing Source for Table and Chart
  const sourcesGroup = {};
  processedData.forEach(item => {
    if (!sourcesGroup[item.source]) {
      sourcesGroup[item.source] = { presupuesto: 0, ejecutado: 0 };
    }
    sourcesGroup[item.source].presupuesto += item.presupuesto;
    sourcesGroup[item.source].ejecutado += item.ejecutado;
  });

  // Render Financing Source Table
  tableSourcesBody.innerHTML = "";
  const chartLabels = [];
  const chartBudgetData = [];
  const chartExecData = [];
  
  // Sort sources by budget size
  Object.keys(sourcesGroup)
    .sort((a, b) => sourcesGroup[b].presupuesto - sourcesGroup[a].presupuesto)
    .forEach(sourceName => {
      const group = sourcesGroup[sourceName];
      const pct = group.presupuesto > 0 ? (group.ejecutado / group.presupuesto) * 100 : 0;
      
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td><strong>${sanitize(sourceName)}</strong></td>
        <td class="text-right">${sanitize(formatColones(group.presupuesto))}</td>
        <td class="text-right">${sanitize(formatColones(group.ejecutado))}</td>
        <td class="text-right"><span style="font-weight:600; color: ${pct > 100 ? 'var(--red-primary)' : 'var(--text-primary)'}">${sanitize(pct.toFixed(1))}%</span></td>
      `;
      tableSourcesBody.appendChild(tr);

      // Save chart metrics
      chartLabels.push(sourceName);
      chartBudgetData.push(group.presupuesto);
      chartExecData.push(group.ejecutado);
    });

  // Render/Update Chart.js Doughnut Chart
  renderChart(chartLabels, chartBudgetData, chartExecData);

  // Render Detailed Subpartidas Table with Search filter
  tableSubpartidasBody.innerHTML = "";
  
  const filteredSubpartidas = processedData.filter(item => {
    return item.codigo.toLowerCase().includes(searchTerm) || 
           item.subpartida.toLowerCase().includes(searchTerm);
  });

  // Sort subpartidas by code
  filteredSubpartidas.sort((a, b) => a.codigo.localeCompare(b.codigo));

  filteredSubpartidas.forEach(item => {
    let statusClass = "normal";
    let statusText = "Normal";
    
    if (item.porcentaje > 90) {
      statusClass = "critical";
      statusText = "Crítico";
    } else if (item.porcentaje > 50) {
      statusClass = "warning";
      statusText = "Advertencia";
    }

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><code>${sanitize(item.codigo)}</code></td>
      <td>${sanitize(item.subpartida)}</td>
      <td class="text-right">${sanitize(formatColones(item.presupuesto))}</td>
      <td class="text-right">${sanitize(formatColones(item.ejecutado))}</td>
      <td class="text-right" style="font-weight: 600;">${sanitize(item.porcentaje.toFixed(1))}%</td>
      <td><span class="badge-status ${sanitize(statusClass)}">${sanitize(statusText)}</span></td>
    `;
    tableSubpartidasBody.appendChild(tr);
  });
}

// Chart.js initialization and updates
function renderChart(labels, budgetData, execData) {
  const ctx = document.getElementById("chart-sources").getContext("2d");
  
  if (chartInstance) {
    chartInstance.destroy();
  }

  // Modern Chart Color Palette (tailored HSL shades)
  const backgroundColors = [
    "rgba(59, 130, 246, 0.75)",  // Blue
    "rgba(139, 92, 246, 0.75)",  // Purple
    "rgba(16, 185, 129, 0.75)",  // Green
    "rgba(245, 158, 11, 0.75)",  // Orange
    "rgba(236, 72, 153, 0.75)",  // Pink
    "rgba(100, 116, 139, 0.75)", // Slate/Gray
    "rgba(239, 68, 68, 0.75)"    // Red
  ];

  const borderColors = [
    "#3b82f6", "#8b5cf6", "#10b981", "#f59e0b", "#ec4899", "#64748b", "#ef4444"
  ];

  chartInstance = new Chart(ctx, {
    type: "doughnut",
    data: {
      labels: labels,
      datasets: [
        {
          label: "Presupuesto",
          data: budgetData,
          backgroundColor: backgroundColors,
          borderColor: borderColors,
          borderWidth: 1,
          hoverOffset: 4
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: "right",
          labels: {
            color: "#94a3b8",
            font: {
              family: "Inter",
              size: 11
            },
            padding: 10,
            boxWidth: 12
          }
        },
        tooltip: {
          backgroundColor: "#1e293b",
          titleColor: "#f8fafc",
          bodyColor: "#94a3b8",
          borderColor: "rgba(255,255,255,0.1)",
          borderWidth: 1,
          callbacks: {
            label: function(context) {
              const label = context.label || "";
              const val = context.raw || 0;
              return ` ${label}: ${formatColones(val)}`;
            }
          }
        }
      },
      cutout: "70%"
    }
  });
}

"use strict";
const $ = (selector) => document.querySelector(selector);
const labels = { bem: "Estou bem", desconforto: "Tenho desconforto", contato: "Quero conversar" };
const icons = { bem: "smile", desconforto: "neutral", contato: "chat" };
const STORAGE_KEY = "oncoflow-casa-demo-pending-v1";
const dateFormat = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
let pending = [], events = [], flushing = false, online = false, lastSignature = "", screenTimer;
try { pending = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"); } catch { pending = []; }
if (!Array.isArray(pending)) pending = [];
pending = pending.filter(e => e && typeof e.event_id === "string" && Object.hasOwn(labels, e.value) && e.source === "simulador").slice(0, 100);

function storeQueue() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(pending)); return true; }
  catch { return false; }
}
function network(connected) {
  online = connected;
  $("#connection").classList.toggle("online", connected);
  $("#connection").lastChild.textContent = connected ? "Painel conectado" : "Sem conexão";
  $("#screen-network").textContent = connected ? "Conectado" : "Sem conexão";
  $("#device-led").className = `device-led ${flushing ? "sending" : connected ? "online" : ""}`;
}
function screen(title, detail, icon = "smile") {
  $("#screen-title").textContent = title;
  $("#screen-detail").textContent = detail;
  $("#screen-icon use").setAttribute("href", `#${icon}`);
}
function delivery(message, waiting = false) {
  $("#delivery-text").textContent = message;
  $(".delivery").classList.toggle("pending", waiting);
  $("#retry").hidden = !waiting;
}
async function request(path, payload) {
  const response = await fetch(path, { method: payload ? "POST" : "GET", headers: payload ? { "Content-Type": "application/json" } : {}, body: payload ? JSON.stringify(payload) : undefined, signal: AbortSignal.timeout(5000), cache: "no-store" });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || "Falha ao enviar.");
  return body;
}
function render() {
  const signature = JSON.stringify(events);
  if (signature === lastSignature) return;
  lastSignature = signature;
  $("#event-count").textContent = events.length === 200 ? "200 recentes" : events.length;
  $("#export").disabled = !events.length;
  const contacts = events.filter(e => e.value === "contato" && !e.reviewed_at).length;
  $("#contact-banner").hidden = contacts === 0;
  $("#contact-count").textContent = `${contacts} ${contacts === 1 ? "pedido de contato pendente" : "pedidos de contato pendentes"}`;
  if (!events.length) return;
  const latest = events[0];
  $("#latest-text").textContent = labels[latest.value];
  $("#latest-time").textContent = `${dateFormat.format(new Date(latest.received_at))} · ${latest.source === "esp32" ? "Aparelho ESP32" : "Simulador"}`;
  $(".latest").dataset.value = latest.value;
  $("#latest-icon use").setAttribute("href", `#${icons[latest.value]}`);
  const focusedId = document.activeElement?.dataset?.eventId;
  const scrollTop = $("#timeline").scrollTop;
  const fragment = document.createDocumentFragment();
  for (const entry of events) {
    const node = $("#event-template").content.firstElementChild.cloneNode(true);
    node.dataset.value = entry.value;
    node.querySelector("use").setAttribute("href", `#${icons[entry.value]}`);
    node.querySelector("strong").textContent = labels[entry.value];
    const time = node.querySelector("time");
    time.dateTime = entry.received_at;
    time.textContent = dateFormat.format(new Date(entry.received_at));
    node.querySelector(".event-origin").textContent = `${entry.source === "esp32" ? "Aparelho ESP32" : "Simulador no navegador"} · ${entry.device_id}`;
    if (entry.reviewed_at) {
      const note = document.createElement("span");
      note.className = "reviewed";
      note.textContent = `Revisado no painel · ${dateFormat.format(new Date(entry.reviewed_at))}`;
      node.querySelector(".event-action").append(note);
    } else {
      const button = document.createElement("button");
      button.textContent = "Marcar como revisado";
      button.dataset.eventId = entry.event_id;
      button.addEventListener("click", async () => {
        button.disabled = true;
        try { await request("/api/review", { event_id: entry.event_id }); await refresh(); }
        catch { button.disabled = false; delivery("Não foi possível salvar a revisão. Tente novamente.", true); }
      });
      node.querySelector(".event-action").append(button);
    }
    fragment.append(node);
  }
  $("#timeline").replaceChildren(fragment);
  $("#timeline").scrollTop = scrollTop;
  if (focusedId) [...document.querySelectorAll("[data-event-id]")].find(el => el.dataset.eventId === focusedId)?.focus({ preventScroll: true });
}
async function refresh() {
  try { events = (await request("/api/events")).events; network(true); render(); }
  catch { network(false); }
}
async function flush() {
  if (flushing || !pending.length) return;
  flushing = true;
  network(online);
  try {
    while (pending.length) {
      const event = pending[0];
      await request("/api/events", event);
      pending.shift();
      storeQueue();
    }
    network(true);
    delivery("Recebido no painel. Registro confirmado.");
    screen("Registro recebido", "Seu toque chegou ao painel de demonstração", "check");
    clearTimeout(screenTimer);
    screenTimer = setTimeout(() => screen("Como você está hoje?", "Escolha um dos botões abaixo"), 4500);
    await refresh();
  } catch {
    network(false);
    const saved = storeQueue();
    delivery(`${pending.length} ${pending.length === 1 ? "registro aguardando envio" : "registros aguardando envio"}.${saved ? " Salvo neste navegador." : " Mantenha esta página aberta."}`, true);
    screen("Aguardando conexão", "Ainda não chegou ao painel. Tentaremos novamente.", "chat");
  } finally { flushing = false; network(online); }
}
document.querySelectorAll(".device-button").forEach(button => button.addEventListener("click", () => {
  if (pending.length >= 100) { delivery("Fila cheia. Reconecte para enviar os registros pendentes.", true); return; }
  clearTimeout(screenTimer);
  const value = button.dataset.value;
  pending.push({ event_id: crypto.randomUUID(), device_id: "CASA-001", value, source: "simulador" });
  storeQueue();
  screen(labels[value], "Enviando seu registro…", icons[value]);
  delivery("Enviando registro ao painel…");
  void flush();
}));
$("#retry").addEventListener("click", async () => { await refresh(); await flush(); });
$("#export").addEventListener("click", () => {
  const safe = value => `"${String(value ?? "").replace(/^[=+@\-\t\r]/, "'$&").replaceAll('"', '""')}"`;
  const rows = [["Registro", "Aparelho", "Resposta", "Origem", "Recebido UTC", "Revisado UTC"], ...events.map(e => [e.event_id, e.device_id, labels[e.value], e.source, e.received_at, e.reviewed_at])];
  const blob = new Blob(["\uFEFF" + rows.map(row => row.map(safe).join(";")).join("\r\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob), link = document.createElement("a");
  link.href = url; link.download = "oncoflow-casa-dados-ficticios.csv"; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
$("#screen-date").textContent = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "short" }).format(new Date());
void refresh().then(flush);
setInterval(async () => { await refresh(); await flush(); }, 2500);
window.addEventListener("online", () => { void refresh().then(flush); });

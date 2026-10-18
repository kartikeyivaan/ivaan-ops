const form = document.getElementById("pair-form");
const errorEl = document.getElementById("error");
const submitBtn = document.getElementById("submit");
const versionEl = document.getElementById("version");

async function init() {
  const defaults = await window.agentApi.getDefaults();
  document.getElementById("baseUrl").value = defaults.defaultBaseUrl;
  versionEl.textContent = `Agent version ${defaults.agentVersion}`;
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  errorEl.textContent = "";
  submitBtn.disabled = true;
  try {
    const code = document.getElementById("code").value.trim();
    const baseUrl = document.getElementById("baseUrl").value.trim();
    const label = document.getElementById("label").value.trim();
    await window.agentApi.pair({
      pairingCode: code,
      baseUrl,
      label: label || undefined,
    });
  } catch (cause) {
    errorEl.textContent = cause instanceof Error ? cause.message : "Pairing failed.";
    submitBtn.disabled = false;
  }
});

void init();

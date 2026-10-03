const form = document.getElementById("contractUploadForm");
const statusBox = document.getElementById("uploadStatus");
const token = new URLSearchParams(location.search).get("token") || "";
const submit = document.getElementById("uploadSubmit");

function showStatus(message, kind) {
  statusBox.textContent = message;
  statusBox.className = "upload-status " + (kind || "");
}
async function checkLink() {
  if (!token) {
    showStatus("Le lien est incomplet. Demandez un nouveau lien à M FactU.", "error");
    form.hidden = true;
    return;
  }
  try {
    const response = await fetch("/api/contracts?token=" + encodeURIComponent(token), { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "LINK_INVALID");
    document.getElementById("clientName").textContent = data.company;
    form.hidden = false;
  } catch {
    showStatus("Ce lien a expiré ou le contrat a déjà été envoyé. Demandez un nouveau lien à M FactU.", "error");
    form.hidden = true;
  }
}
form.addEventListener("submit", async event => {
  event.preventDefault();
  const file = document.getElementById("signedPdf").files[0];
  if (!file) return showStatus("Choisissez le PDF signé.", "error");
  if (file.size > 3 * 1024 * 1024) return showStatus("Le PDF doit faire 3 Mo maximum.", "error");
  submit.disabled = true;
  submit.textContent = "Envoi en cours…";
  showStatus("Envoi sécurisé du contrat…", "");
  try {
    const base64 = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("FILE_READ_FAILED"));
      reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
      reader.readAsDataURL(file);
    });
    const response = await fetch("/api/contracts?token=" + encodeURIComponent(token), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ filename: file.name, fileBase64: base64 })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "UPLOAD_FAILED");
    form.hidden = true;
    showStatus("Merci. Votre contrat signé a été reçu et ajouté au dossier M FactU.", "success");
  } catch {
    showStatus("L’envoi n’a pas abouti. Vérifiez votre connexion ou demandez un nouveau lien à M FactU.", "error");
  } finally {
    submit.disabled = false;
    submit.textContent = "Envoyer le contrat signé";
  }
});
checkLink();

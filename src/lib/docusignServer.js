import crypto from "node:crypto";

function required(name) {
  const value = String(process.env[name] || "").trim();
  if (!value) throw new Error(`Variable Vercel manquante : ${name}`);
  return value;
}

function base64url(value) {
  return Buffer.from(value).toString("base64url");
}

function privateKey() {
  const key = required("DOCUSIGN_PRIVATE_KEY").replace(/\\n/g, "\n");
  if (!key.includes("BEGIN") || !key.includes("PRIVATE KEY")) {
    throw new Error("DOCUSIGN_PRIVATE_KEY n'est pas une clé RSA PEM complète.");
  }
  return key;
}

function authServer() {
  return required("DOCUSIGN_AUTH_SERVER")
    .replace(/^https?:\/\//i, "")
    .replace(/\/$/, "");
}

export function docusignConsentUrl() {
  const params = new URLSearchParams({
    response_type: "code",
    scope: "signature impersonation",
    client_id: required("DOCUSIGN_INTEGRATION_KEY"),
    redirect_uri: required("DOCUSIGN_REDIRECT_URI"),
  });
  return `https://${authServer()}/oauth/auth?${params.toString()}`;
}

async function accessToken() {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64url(JSON.stringify({
    iss: required("DOCUSIGN_INTEGRATION_KEY"),
    sub: required("DOCUSIGN_USER_ID"),
    aud: authServer(),
    iat: now,
    exp: now + 3600,
    scope: "signature impersonation",
  }));
  const unsigned = `${header}.${payload}`;
  const signature = crypto.sign("RSA-SHA256", Buffer.from(unsigned), privateKey()).toString("base64url");

  const response = await fetch(`https://${authServer()}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${unsigned}.${signature}`,
    }),
    cache: "no-store",
  });
  const payloadResult = await response.json().catch(() => ({}));
  if (!response.ok || !payloadResult.access_token) {
    const error = new Error(
      payloadResult.error === "consent_required"
        ? "Consentement DocuSign requis. Ouvrez d'abord la connexion DocuSign."
        : `Authentification DocuSign impossible : ${payloadResult.error_description || payloadResult.error || response.status}`,
    );
    error.code = payloadResult.error || "docusign_auth_error";
    throw error;
  }
  return payloadResult.access_token;
}

async function accountContext(token) {
  const response = await fetch(`https://${authServer()}/oauth/userinfo`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error("Impossible de lire le compte DocuSign.");
  const account = payload.accounts?.find((item) => item.is_default) || payload.accounts?.[0];
  if (!account?.account_id) throw new Error("Aucun compte eSignature DocuSign disponible.");
  const configured = String(process.env.DOCUSIGN_BASE_PATH || "").trim().replace(/\/$/, "");
  const basePath = configured || `${String(account.base_uri || "").replace(/\/$/, "")}/restapi`;
  return { accountId: account.account_id, accountName: account.account_name || "", basePath };
}

export async function checkDocusignConnection() {
  const token = await accessToken();
  const account = await accountContext(token);
  return { accountId: account.accountId, accountName: account.accountName };
}

export async function sendDocusignEnvelope({ subject, html, signers, documentName = "Contrat ColoCrew.html", emailBlurb = "" }) {
  if (!Array.isArray(signers) || !signers.length) throw new Error("Aucun signataire DocuSign.");
  const token = await accessToken();
  const { accountId, basePath } = await accountContext(token);

  const recipients = signers.map((signer, index) => ({
    email: signer.email,
    name: signer.name,
    recipientId: String(index + 1),
    routingOrder: String(index + 1),
    emailNotification: {
      supportedLanguage: "fr",
      emailSubject: String(signer.emailSubject || subject).slice(0, 100),
      emailBody: String(
        signer.emailBody || emailBlurb || "Merci de vérifier et signer ce document ColoCrew.",
      ).slice(0, 10000),
    },
    tabs: {
      signHereTabs: [{
        anchorString: signer.anchor,
        anchorUnits: "pixels",
        anchorXOffset: "0",
        anchorYOffset: "24",
        scaleValue: "0.85",
      }],
      dateSignedTabs: [{
        anchorString: signer.anchor,
        anchorUnits: "pixels",
        anchorXOffset: "0",
        anchorYOffset: "80",
        font: "Arial",
        fontSize: "Size9",
        localePolicy: {
          cultureName: "fr-FR",
          dateFormat: "dd/MM/yyyy",
          customDateFormat: "dd/MM/yyyy",
        },
      }],
    },
  }));

  const response = await fetch(`${basePath}/v2.1/accounts/${encodeURIComponent(accountId)}/envelopes`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      emailSubject: subject,
      ...(emailBlurb ? { emailBlurb } : {}),
      documents: [{
        documentBase64: Buffer.from(html, "utf8").toString("base64"),
        name: documentName,
        fileExtension: "html",
        documentId: "1",
      }],
      recipients: { signers: recipients },
      status: "sent",
    }),
    cache: "no-store",
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.envelopeId) {
    throw new Error(`Envoi DocuSign impossible : ${result.message || result.errorCode || response.status}`);
  }
  return { envelopeId: result.envelopeId, status: result.status || "sent" };
}

export async function getDocusignEnvelope(envelopeId) {
  const token = await accessToken();
  const { accountId, basePath } = await accountContext(token);
  const response = await fetch(
    `${basePath}/v2.1/accounts/${encodeURIComponent(accountId)}/envelopes/${encodeURIComponent(envelopeId)}`,
    {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    },
  );
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`Lecture DocuSign impossible : ${result.message || result.errorCode || response.status}`);
  }
  return {
    envelopeId: result.envelopeId || envelopeId,
    status: result.status || "unknown",
    sentDateTime: result.sentDateTime || "",
    completedDateTime: result.completedDateTime || "",
    statusChangedDateTime: result.statusChangedDateTime || "",
  };
}

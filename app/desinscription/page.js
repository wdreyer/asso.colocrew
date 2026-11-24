import { normalizeEmail, verifyUnsubscribeToken } from "@/src/lib/unsubscribe";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Désinscription | ColoCrew",
  robots: { index: false, follow: false },
};

function Box({ title, children }) {
  return (
    <main className="min-h-[60vh] flex items-center justify-center px-4 py-24">
      <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-8 text-center shadow-sm">
        <h1 className="text-2xl font-bold text-gray-900 mb-4">{title}</h1>
        {children}
      </div>
    </main>
  );
}

export default async function Page({ searchParams }) {
  const params = await searchParams;
  const email = normalizeEmail(params?.e);
  const token = String(params?.t || "");

  if (params?.ok) {
    return (
      <Box title="C'est fait">
        <p className="text-gray-700">
          {email ? <><strong>{email}</strong> ne recevra plus nos mails d'information.</> : "Vous ne recevrez plus nos mails d'information."}
        </p>
        <p className="mt-3 text-sm text-gray-500">
          Les mails liés à une inscription en cours (confirmation, convocation…) restent envoyés.
        </p>
      </Box>
    );
  }

  if (params?.erreur || !email || !verifyUnsubscribeToken(email, token)) {
    return (
      <Box title="Lien invalide">
        <p className="text-gray-700">
          Ce lien de désinscription n'est pas valide ou est incomplet. Utilisez le lien présent en bas de notre mail,
          ou écrivez-nous à <a className="underline" href="mailto:contact@colocrew.com">contact@colocrew.com</a>.
        </p>
      </Box>
    );
  }

  return (
    <Box title="Se désinscrire">
      <p className="text-gray-700 mb-6">
        Vous ne recevrez plus les mails d'information de ColoCrew à l'adresse <strong className="break-all">{email}</strong>.
      </p>
      <form method="POST" action="/api/desinscription">
        <input type="hidden" name="e" value={email} />
        <input type="hidden" name="t" value={token} />
        <button type="submit" className="w-full rounded-full bg-gray-900 px-6 py-3 font-semibold text-white hover:bg-gray-700">
          Confirmer la désinscription
        </button>
      </form>
    </Box>
  );
}

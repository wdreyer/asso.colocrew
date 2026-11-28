import { adminErrorResponse, withDashboardAccess } from "@/src/lib/serverAdminAuth";
import { adminAuth, adminDb } from "@/src/lib/serverFirebase";
import { COLLECTIONS } from "@/src/lib/firebaseCollections";

const normalizeEmail = (value) => typeof value === "string" ? value.trim().toLowerCase() : "";

export const GET = withDashboardAccess([], async () => {
  try {
    const db = adminDb();
    const roles = await db.collection(COLLECTIONS.ADMINS).get();
    const lookup = [];
    for (let start = 0; start < roles.docs.length; start += 100) {
      lookup.push(adminAuth().getUsers(roles.docs.slice(start, start + 100).map(({ id }) => ({ uid: id }))));
    }
    const [users, members] = await Promise.all([
      Promise.all(lookup),
      db.collection(COLLECTIONS.STAFF_MEMBERS).select("accountUid", "email", "name", "firstName", "lastName").get(),
    ]);
    const namesByUid = new Map();
    const namesByEmail = new Map();
    for (const entry of members.docs) {
      const member = entry.data();
      const name = member.name || [member.firstName, member.lastName].filter(Boolean).join(" ");
      if (!name) continue;
      if (member.accountUid) namesByUid.set(member.accountUid, name);
      const email = normalizeEmail(member.email);
      if (email) namesByEmail.set(email, name);
    }
    const usersByUid = new Map(users.flatMap(({ users }) => users).map((user) => [user.uid, user]));
    return Response.json(roles.docs.map(({ id }) => {
      const user = usersByUid.get(id);
      const email = user?.email || "";
      const name = namesByUid.get(id) || namesByEmail.get(normalizeEmail(email)) || user?.displayName || "";
      return { id, name, email };
    }), { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return adminErrorResponse(error);
  }
});

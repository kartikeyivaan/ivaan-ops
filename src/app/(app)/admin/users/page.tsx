import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isSuperAdmin } from "@/lib/rbac";
import { ensureSystemRoles } from "@/lib/system-roles";
import { UserForm } from "@/components/admin/user-form";
import { UsersList } from "@/components/admin/users-list";

export default async function UsersAdminPage() {
  const session = await auth();
  if (!session?.user || !isSuperAdmin(session.user.roles)) {
    redirect("/dashboard");
  }

  await ensureSystemRoles(prisma);

  const [users, roles, companies] = await Promise.all([
    prisma.user.findMany({
      include: {
        roles: { include: { role: true } },
        companies: { include: { company: true } },
      },
      orderBy: { name: "asc" },
    }),
    prisma.role.findMany({ orderBy: { name: "asc" } }),
    prisma.company.findMany({ orderBy: { name: "asc" } }),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">User Management</h1>
        <p className="text-sm text-slate-500">
          Create, edit, deactivate, and manage passwords for users.
        </p>
      </div>

      <UserForm roles={roles} companies={companies} />

      <UsersList
        users={users}
        roles={roles}
        companies={companies}
        currentUserId={session.user.id}
      />
    </div>
  );
}

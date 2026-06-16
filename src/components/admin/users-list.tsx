"use client";

import { parseApiJson } from "@/lib/api-response";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { MoreVertical } from "lucide-react";
import { ChangePasswordDialog } from "@/components/admin/change-password-dialog";
import {
  UserEditDialog,
  type EditableUser,
} from "@/components/admin/user-edit-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type Role = { id: string; name: string };
type Company = { id: string; name: string; code: string };

export function UsersList({
  users,
  roles,
  companies,
  currentUserId,
}: {
  users: EditableUser[];
  roles: Role[];
  companies: Company[];
  currentUserId: string;
}) {
  const router = useRouter();
  const [editingUser, setEditingUser] = useState<EditableUser | null>(null);
  const [passwordUser, setPasswordUser] = useState<EditableUser | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function handleDelete(user: EditableUser) {
    if (user.id === currentUserId) {
      setMessage("You cannot delete your own account.");
      return;
    }

    const confirmed = window.confirm(
      `Delete ${user.name}? Users with existing records will be deactivated instead.`,
    );
    if (!confirmed) return;

    setDeletingId(user.id);
    setMessage(null);

    const response = await fetch(`/api/users/${user.id}`, { method: "DELETE" });
    const data = await parseApiJson<{ message?: string; deactivated?: boolean }>(response);
    setDeletingId(null);

    if (!response.ok) {
      setMessage(data.message ?? "Failed to delete user.");
      return;
    }

    if (data.deactivated) {
      setMessage(
        data.message ??
          "User has existing business records and was deactivated instead of permanently deleted.",
      );
    } else {
      setMessage(`${user.name} was permanently deleted.`);
    }

    router.refresh();
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Users</CardTitle>
        </CardHeader>
        <CardContent>
          {message ? <p className="mb-4 text-sm text-slate-600">{message}</p> : null}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Roles</TableHead>
                <TableHead>Companies</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((user) => (
                <TableRow key={user.id}>
                  <TableCell className="font-medium">{user.name}</TableCell>
                  <TableCell>{user.email}</TableCell>
                  <TableCell>{user.roles.map((r) => r.role.name).join(", ")}</TableCell>
                  <TableCell>{user.companies.map((c) => c.company.code).join(", ")}</TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        user.status === "ACTIVE"
                          ? "success"
                          : user.status === "LOCKED"
                            ? "warning"
                            : "danger"
                      }
                    >
                      {user.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0"
                          aria-label={`More options for ${user.name}`}
                        >
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => setEditingUser(user)}>
                          Edit User
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setPasswordUser(user)}>
                          {user.status === "LOCKED" ? "Unlock & Change Password" : "Change Password"}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-red-600 focus:bg-red-50 focus:text-red-700"
                          disabled={deletingId === user.id || user.id === currentUserId}
                          onClick={() => handleDelete(user)}
                        >
                          {deletingId === user.id ? "Deleting..." : "Delete User"}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {editingUser ? (
        <UserEditDialog
          user={editingUser}
          roles={roles}
          companies={companies}
          onClose={() => setEditingUser(null)}
        />
      ) : null}

      {passwordUser ? (
        <ChangePasswordDialog
          userId={passwordUser.id}
          userName={passwordUser.name}
          isLocked={passwordUser.status === "LOCKED"}
          onClose={() => setPasswordUser(null)}
        />
      ) : null}
    </>
  );
}

// src/components/admin/system/AdminManagerCard.tsx

import React from "react";
import { Users, Trash2 } from "lucide-react";
import Button from "../../ui/Button";
import Input from "../../ui/Input";
import type { AdminRole } from "../../../services/admin";

type EditableAdminRole = Exclude<AdminRole, "none">;

interface AdminManagerCardProps {
    adminsList: { email: string; addedAt?: string; role?: EditableAdminRole }[];
    currentUserRole: "general" | "core";
    newAdminEmail: string;
    setNewAdminEmail: (email: string) => void;
    addingAdmin: boolean;
    onAddAdmin: (e: React.FormEvent) => void;
    onDeleteAdmin: (email: string) => void;
    onRoleChange: (email: string, role: EditableAdminRole) => void;
}

const roleLabels: Record<EditableAdminRole, string> = {
    terminal: "端末専用",
    general: "一般管理者",
    core: "コア管理者"
};

export default function AdminManagerCard({
    adminsList,
    currentUserRole,
    newAdminEmail,
    setNewAdminEmail,
    addingAdmin,
    onAddAdmin,
    onDeleteAdmin,
    onRoleChange
}: AdminManagerCardProps) {
    return (
        <div className="bg-white dark:bg-slate-900 p-4 md:p-8 rounded-[24px] md:rounded-[32px] shadow-xl border border-slate-200 dark:border-slate-800">
            <div className="mb-6">
                <h3 className="text-xl font-black text-slate-800 dark:text-white flex items-center gap-2">
                    <Users className="text-blue-500" /> 管理者アカウントの管理
                </h3>
                <p className="text-slate-500 text-xs mt-1">
                    システム管理・運営スタッフを追加・管理します。登録されたメールアドレスで管理者サインインが可能になります。
                </p>
            </div>

            {currentUserRole === "core" ? (
                <form onSubmit={onAddAdmin} className="flex flex-col sm:flex-row gap-4 mb-6">
                    <Input
                        label="新規管理者メールアドレス"
                        type="email"
                        placeholder="staff@example.com"
                        value={newAdminEmail}
                        onChange={(e) => setNewAdminEmail(e.target.value)}
                        disabled={addingAdmin}
                        className="flex-1"
                    />
                    <Button
                        type="submit"
                        disabled={addingAdmin || !newAdminEmail}
                        className="px-6 sm:self-end shrink-0 py-3 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl transition"
                    >
                        管理者を追加
                    </Button>
                </form>
            ) : (
                <div className="bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 p-4 rounded-2xl text-sm font-bold flex items-center gap-2 mb-6">
                    一般管理者は、新規管理者の追加・変更・削除を行えません。
                </div>
            )}

            <div className="border border-slate-200 dark:border-slate-800 rounded-2xl overflow-x-auto bg-white dark:bg-slate-900/40">
                <table className="w-full min-w-[720px] text-left border-collapse text-sm">
                    <thead>
                        <tr className="bg-slate-50 dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                            <th className="px-6 py-4">メールアドレス</th>
                            <th className="px-6 py-4">タイプ</th>
                            <th className="px-6 py-4">登録日時</th>
                            <th className="px-6 py-4 text-right">アクション</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-medium">
                        {adminsList.map((adm) => (
                            <tr key={adm.email} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/10">
                                <td className="px-6 py-4 font-mono text-slate-800 dark:text-slate-200">{adm.email}</td>
                                <td className="px-6 py-4">
                                    {currentUserRole === "core" ? (
                                        <select
                                            value={adm.role || "general"}
                                            onChange={(e) => onRoleChange(adm.email, e.target.value as EditableAdminRole)}
                                            className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg px-2 py-1 text-xs font-bold focus:outline-none focus:border-blue-500 text-slate-800 dark:text-slate-200"
                                        >
                                            <option value="terminal">端末専用</option>
                                            <option value="general">一般管理者</option>
                                            <option value="core">コア管理者</option>
                                        </select>
                                    ) : (
                                        <span className={`px-2 py-1 border text-xs font-bold rounded-md ${adm.role === "core"
                                            ? "bg-red-500/10 border-red-500/20 text-red-500"
                                            : adm.role === "terminal"
                                                ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-500"
                                                : "bg-blue-500/10 border-blue-500/20 text-blue-500"
                                            }`}>
                                            {roleLabels[adm.role || "general"]}
                                        </span>
                                    )}
                                </td>
                                <td className="px-6 py-4 text-xs text-slate-500 font-mono">{adm.addedAt ? new Date(adm.addedAt).toLocaleString() : "-"}</td>
                                <td className="px-6 py-4 text-right">
                                    {currentUserRole === "core" && (
                                        <button
                                            onClick={() => onDeleteAdmin(adm.email)}
                                            className="text-slate-400 hover:text-red-500 p-2 rounded-lg transition"
                                            title="管理者を削除"
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

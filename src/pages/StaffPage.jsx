import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useStaff } from "../hooks/useStaff";
import { useToastStore } from "../stores/toastStore";
import { postStaffWhatsAppInvite } from "../services/api";

const emptyForm = {
  name: "",
  email: "",
  password: "",
  role: "CASHIER",
};

const emptyInvite = {
  fullName: "",
  phone: "",
  role: "CASHIER",
};

const inputClass =
  "w-full rounded-lg border border-stone-300 bg-stone-50 p-2.5 text-stone-900 placeholder:text-stone-500 dark:border-stone-600 dark:bg-stone-950 dark:text-stone-100";

export default function StaffPage() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState(emptyForm);
  const [inviteForm, setInviteForm] = useState(emptyInvite);
  const [lastInvite, setLastInvite] = useState(null);
  const { data: staff = [], isLoading, addStaff, disableStaffMember, reactivateStaffMember } = useStaff();
  const showToast = useToastStore((s) => s.showToast);

  const inviteMutation = useMutation({
    mutationFn: postStaffWhatsAppInvite,
    onSuccess: (data) => {
      setLastInvite(data);
      setInviteForm(emptyInvite);
      void queryClient.invalidateQueries({ queryKey: ["staff"] });
      showToast("Invite created. Open WhatsApp to send the link.", "success");
    },
  });

  const onSubmit = async (e) => {
    e.preventDefault();
    try {
      await addStaff.mutateAsync(form);
      setForm(emptyForm);
      showToast("Staff added.", "success");
    } catch (error) {
      const msg = error.response?.data?.message || "Could not add staff.";
      showToast(msg, "error");
    }
  };

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-bold text-stone-900 dark:text-stone-100">Staff</h1>
      <p className="text-sm text-stone-600 dark:text-stone-400">
        Add cashiers or managers for this business.
      </p>

      <section className="rounded-xl border border-teal-200 bg-teal-50/80 p-4 shadow-sm dark:border-teal-800 dark:bg-teal-950/30">
        <h2 className="text-lg font-semibold text-stone-900 dark:text-stone-100">
          WhatsApp invite (recommended)
        </h2>
        <p className="mt-1 text-xs text-stone-600 dark:text-stone-400">
          Staff opens the link on their phone, sets a PIN, then signs in with phone + PIN — no email password.
        </p>
        <form
          className="mt-3 grid gap-3 md:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            inviteMutation.mutate({
              fullName: inviteForm.fullName.trim(),
              phone: inviteForm.phone.trim(),
              role: inviteForm.role,
            });
          }}
        >
          <input
            className={inputClass}
            placeholder="Full name"
            value={inviteForm.fullName}
            onChange={(e) => setInviteForm((p) => ({ ...p, fullName: e.target.value }))}
            required
          />
          <input
            className={inputClass}
            placeholder="Phone (e.g. 2348012345678)"
            inputMode="tel"
            value={inviteForm.phone}
            onChange={(e) => setInviteForm((p) => ({ ...p, phone: e.target.value }))}
            required
          />
          <select
            className={inputClass}
            value={inviteForm.role}
            onChange={(e) => setInviteForm((p) => ({ ...p, role: e.target.value }))}
          >
            <option value="CASHIER">Cashier</option>
            <option value="MANAGER">Manager</option>
          </select>
          <button
            type="submit"
            disabled={inviteMutation.isPending}
            className="rounded-lg bg-teal-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50 dark:bg-teal-500 dark:text-stone-950"
          >
            {inviteMutation.isPending ? "Creating…" : "Create invite & WhatsApp"}
          </button>
        </form>
        {inviteMutation.isError && (
          <p className="mt-2 text-sm text-red-600 dark:text-red-400">
            {inviteMutation.error?.response?.data?.message || "Could not create invite."}
          </p>
        )}
        {lastInvite?.whatsappUrl && (
          <div className="mt-3 rounded-lg border border-stone-200 bg-white p-3 text-sm dark:border-stone-600 dark:bg-stone-900">
            <p className="font-medium text-stone-800 dark:text-stone-200">Send via WhatsApp</p>
            <a
              href={lastInvite.whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-flex rounded-lg bg-[#25D366] px-4 py-2.5 font-semibold text-white"
            >
              Open WhatsApp
            </a>
            <p className="mt-2 break-all text-xs text-stone-500 dark:text-stone-400">
              Link: {lastInvite.inviteUrl}
            </p>
          </div>
        )}
      </section>

      <form
        onSubmit={onSubmit}
        className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm dark:border-stone-700 dark:bg-stone-900"
      >
        <div className="grid gap-3 md:grid-cols-2">
          <input
            className={inputClass}
            placeholder="Full name"
            value={form.name}
            onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
            required
          />
          <input
            className={inputClass}
            type="email"
            placeholder="Email"
            value={form.email}
            onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
            required
          />
          <input
            className={inputClass}
            type="password"
            placeholder="Password"
            value={form.password}
            onChange={(e) => setForm((prev) => ({ ...prev, password: e.target.value }))}
            minLength={6}
            required
          />
          <select
            className={inputClass}
            value={form.role}
            onChange={(e) => setForm((prev) => ({ ...prev, role: e.target.value }))}
          >
            <option value="CASHIER">Cashier</option>
            <option value="MANAGER">Manager</option>
          </select>
        </div>
        <button
          type="submit"
          disabled={addStaff.isPending}
          className="mt-3 rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 dark:bg-teal-500 dark:text-stone-950"
        >
          {addStaff.isPending ? "Adding..." : "Add staff"}
        </button>
      </form>

      <section className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm dark:border-stone-700 dark:bg-stone-900">
        <h2 className="text-lg font-semibold">Team members</h2>
        <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">
          Phone shown for WhatsApp-invited staff; email for classic accounts.
        </p>
        {isLoading && <p className="mt-2 text-sm text-stone-500">Loading staff...</p>}
        {!isLoading && !staff.length && (
          <p className="mt-2 text-sm text-stone-500">
            No staff added yet. Add your first cashier.
          </p>
        )}
        {!!staff.length && (
          <div className="mt-3 grid gap-2">
            {staff.map((member) => (
              <div
                key={member.id}
                className="rounded-lg border border-stone-200 px-3 py-2 text-sm dark:border-stone-700"
              >
                <p className="font-medium">{member.name}</p>
                <p className="text-stone-500">
                  {member.phone ? (
                    <span className="font-mono">+{String(member.phone).replace(/^\+/, "")}</span>
                  ) : null}
                  {member.phone ? " · " : ""}
                  {member.email}
                </p>
                <p className="text-xs text-teal-700 dark:text-teal-400">
                  {member.role} · {member.isDisabled ? "Disabled" : "Active"} · Added{" "}
                  {new Date(member.createdAt).toLocaleDateString()}
                </p>
                <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">
                  Last activity: {member.lastActivityAt ? new Date(member.lastActivityAt).toLocaleString() : "No active session"}
                </p>
                <div className="mt-2 flex gap-2">
                  {!member.isDisabled ? (
                    <button
                      type="button"
                      className="rounded border border-red-300 px-2 py-1 text-xs text-red-700 dark:border-red-700 dark:text-red-300"
                      onClick={async () => {
                        try {
                          await disableStaffMember.mutateAsync(member.id);
                          showToast("Staff disabled and logged out from active sessions.", "success");
                        } catch (error) {
                          showToast(error.response?.data?.message || "Could not disable staff.", "error");
                        }
                      }}
                    >
                      Disable
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="rounded border border-teal-300 px-2 py-1 text-xs text-teal-700 dark:border-teal-700 dark:text-teal-300"
                      onClick={async () => {
                        const password = window.prompt("Set a new password for this staff account:");
                        if (!password) return;
                        try {
                          await reactivateStaffMember.mutateAsync({ id: member.id, password });
                          showToast("Staff reactivated with new password.", "success");
                        } catch (error) {
                          showToast(error.response?.data?.message || "Could not reactivate staff.", "error");
                        }
                      }}
                    >
                      Reactivate
                    </button>
                  )}
                </div>
                <Link to="/audit-logs" className="mt-2 inline-block text-xs text-teal-700 underline dark:text-teal-400">
                  View audit events
                </Link>
              </div>
            ))}
          </div>
        )}
      </section>
    </section>
  );
}

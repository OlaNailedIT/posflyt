import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import ConflictResolutionModal from "./ConflictResolutionModal";
import { useConflictStore } from "../stores/conflictStore";
import { useToastStore } from "../stores/toastStore";
import { putCustomer, putProduct } from "../services/api";

export default function ConflictResolutionHost() {
  const queryClient = useQueryClient();
  const showToast = useToastStore((s) => s.showToast);
  const conflict = useConflictStore((s) => s.conflict);
  const clearConflict = useConflictStore((s) => s.clearConflict);
  const [busy, setBusy] = useState(false);

  const onUseServer = () => {
    clearConflict();
    void queryClient.invalidateQueries({ queryKey: ["products"] });
    void queryClient.invalidateQueries({ queryKey: ["customers"] });
    showToast("Loaded the latest version from the server.", "success");
  };

  const onOverwrite = async () => {
    if (!conflict?.recordId || !conflict.kind || !conflict.originalPayload) {
      showToast("Could not retry this save. Refresh the page and try again.", "error");
      clearConflict();
      return;
    }
    setBusy(true);
    try {
      const payload = {
        ...conflict.originalPayload,
        force: true,
        lastKnownUpdatedAt: conflict.serverUpdatedAt,
      };
      if (conflict.kind === "product") {
        await putProduct(conflict.recordId, payload);
      } else {
        await putCustomer(conflict.recordId, payload);
      }
      clearConflict();
      void queryClient.invalidateQueries({
        queryKey: [conflict.kind === "product" ? "products" : "customers"],
      });
      showToast("Your changes were saved.", "success");
    } catch (err) {
      showToast(err.response?.data?.message || "Could not overwrite. Try again.", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <ConflictResolutionModal
      isOpen={Boolean(conflict)}
      conflictData={conflict}
      onClose={() => clearConflict()}
      onUseServer={onUseServer}
      onOverwrite={onOverwrite}
      busy={busy}
    />
  );
}

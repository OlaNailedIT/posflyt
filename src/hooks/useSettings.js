import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getSettings, putSettings } from "../services/api";
import { useSettingsStore } from "../stores/settingsStore";
import { useAuthStore } from "../stores/authStore";

export function useSettings() {
  const queryClient = useQueryClient();
  const setSettings = useSettingsStore((s) => s.setSettings);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  const query = useQuery({
    queryKey: ["settings"],
    queryFn: getSettings,
    enabled: isAuthenticated,
    staleTime: 1000 * 60 * 5,
  });

  useEffect(() => {
    if (query.data) setSettings(query.data);
  }, [query.data, setSettings]);

  const mutation = useMutation({
    mutationFn: putSettings,
    onSuccess: (data) => {
      setSettings(data);
      queryClient.setQueryData(["settings"], data);
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
    },
  });

  return {
    ...query,
    updateSettings: mutation.mutateAsync,
    isSaving: mutation.isPending,
  };
}

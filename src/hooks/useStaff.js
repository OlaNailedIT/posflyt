import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { disableStaff, getStaff, postStaff, reactivateStaff } from "../services/api";
import { useAuthStore } from "../stores/authStore";

export function useStaff() {
  const queryClient = useQueryClient();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const query = useQuery({
    queryKey: ["staff"],
    queryFn: getStaff,
    enabled: isAuthenticated,
    staleTime: 1000 * 60 * 2,
  });

  const addStaff = useMutation({
    mutationFn: postStaff,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["staff"] }),
  });

  const disableStaffMember = useMutation({
    mutationFn: disableStaff,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["staff"] }),
  });

  const reactivateStaffMember = useMutation({
    mutationFn: ({ id, password }) => reactivateStaff(id, { password }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["staff"] }),
  });

  return { ...query, addStaff, disableStaffMember, reactivateStaffMember };
}

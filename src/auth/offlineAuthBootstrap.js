import { loadOfflineStaffBundle, getOfflineSession } from "../offline/authOfflineStore";
import { useAuthStore } from "../stores/authStore";
import { userFromPayload } from "./offlineStaffLogin";

/**
 * Warm-resume: valid offline session row + bundle → auth without PIN.
 * @returns {Promise<boolean>}
 */
export async function bootstrapOfflineSession() {
  try {
    const sess = await getOfflineSession();
    if (!sess?.phone) return false;

    const bundle = await loadOfflineStaffBundle(sess.phone);
    if (!bundle?.staffId) return false;

    const user = userFromPayload(bundle, sess.phone);
    useAuthStore.getState().login({
      user,
      token: null,
      offlineSessionActive: true,
    });
    return true;
  } catch {
    return false;
  }
}

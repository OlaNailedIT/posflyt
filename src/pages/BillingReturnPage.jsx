import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useConfirmPayment } from "../hooks/useBilling";
import { useToastStore } from "../stores/toastStore";
import { useAuthStore } from "../stores/authStore";

export default function BillingReturnPage() {
  const [params] = useSearchParams();
  const confirm = useConfirmPayment();
  const showToast = useToastStore((s) => s.showToast);
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const navigate = useNavigate();

  useEffect(() => {
    const paymentStatus = params.get("payment_status");
    if (paymentStatus === "failed" || paymentStatus === "canceled") {
      showToast("Payment did not complete. You can try again from Billing.", "error");
      navigate("/billing");
      return;
    }

    const providerRef = params.get("payment_ref");
    const provider = params.get("provider");
    const plan = params.get("plan");
    if (!providerRef || !provider || !plan) {
      navigate("/billing");
      return;
    }
    confirm
      .mutateAsync({ providerRef, provider, plan })
      .then((sub) => {
        if (user) {
          setUser({ ...user, subscription_plan: sub.plan });
        }
        showToast("Payment confirmed. Your subscription is active.", "success");
        navigate("/billing");
      })
      .catch((error) => {
        if (error.response?.status === 401) return;
        showToast(
          "We could not confirm this payment yet. If you were charged, wait a moment or contact support.",
          "error"
        );
        navigate("/billing");
      });
  }, [confirm, navigate, params, setUser, showToast, user]);

  return <p className="p-6 text-sm text-stone-500">Confirming payment…</p>;
}

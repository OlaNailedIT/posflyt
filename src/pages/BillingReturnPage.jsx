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
        showToast("Payment confirmed. Subscription updated.", "success");
        navigate("/billing");
      })
      .catch((error) => {
        if (error.response?.status === 401) return;
        showToast("Payment confirmation failed.", "error");
        navigate("/billing");
      });
  }, [confirm, navigate, params, setUser, showToast, user]);

  return <p className="p-6 text-sm text-stone-500">Confirming payment...</p>;
}

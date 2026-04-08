import SeoHead from "../components/seo/SeoHead";
import TrackedLink from "../components/TrackedLink";

export default function ReferralPage() {
  return (
    <>
      <SeoHead
        title="Referral Program — POSflyt"
        description="Invite another business to POSflyt. Rewards and terms are configured per campaign—ask sales for the latest offer."
        keywords="POS referral, SMB referral program, POSflyt invite"
      />
      <div className="mx-auto max-w-3xl px-4 py-14 md:py-20">
        <h1 className="text-4xl font-black text-stone-900 dark:text-stone-50">Referral program</h1>
        <p className="mt-4 text-lg text-stone-600 dark:text-stone-400">
          Share POSflyt with retailers and operators you trust. When your referrals activate and subscribe, both sides can earn
          rewards—credits, extended trials, or discounts—depending on the active campaign.
        </p>
        <h2 className="mt-10 text-xl font-bold text-stone-900 dark:text-stone-100">How invites work</h2>
        <ol className="mt-4 list-inside list-decimal space-y-2 text-stone-700 dark:text-stone-300">
          <li>Share your personal link with <code className="rounded bg-stone-200 px-1 dark:bg-stone-800">?ref=YOUR_CODE</code> appended to any marketing URL (we capture <code className="rounded bg-stone-200 px-1 dark:bg-stone-800">ref</code> in session for analytics).</li>
          <li>Your referral creates an account and completes onboarding.</li>
          <li>When they upgrade to a paid plan, rewards are applied according to the current campaign rules.</li>
        </ol>
        <p className="mt-6 text-sm text-stone-600 dark:text-stone-400">
          Program details are finalized with finance and legal—contact sales for eligibility, payout timing, and tax documentation.
        </p>
        <div className="mt-10 flex flex-wrap gap-3">
          <TrackedLink
            to="/contact"
            eventName="referral_contact_sales"
            className="inline-flex rounded-lg bg-teal-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-teal-700 dark:bg-teal-500 dark:text-stone-950"
          >
            Talk to sales about referrals
          </TrackedLink>
          <TrackedLink
            to="/register"
            eventName="referral_get_started"
            className="inline-flex rounded-lg border border-stone-300 px-5 py-2.5 text-sm font-semibold text-stone-800 dark:border-stone-600 dark:text-stone-200"
          >
            Create your workspace
          </TrackedLink>
        </div>
      </div>
    </>
  );
}

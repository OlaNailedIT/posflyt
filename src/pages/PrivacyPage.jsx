import ExpandableSection from "../components/ui/ExpandableSection";

export default function PrivacyPage() {
  return (
    <section className="space-y-3">
      <h1 className="text-2xl font-bold text-stone-900 dark:text-stone-100">Privacy Policy</h1>
      <p className="text-sm text-stone-600 dark:text-stone-400">
        We collect only the data needed to run your POS operations and reports. We do not sell your
        data.
      </p>
      <ExpandableSection title="1. Data we collect">
        <ul className="space-y-1">
          <li>- Business info (name, email, phone, settings).</li>
          <li>- Transaction data (items, totals, timestamps, payment method).</li>
          <li>- User account data (staff users, roles, sessions).</li>
        </ul>
      </ExpandableSection>
      <ExpandableSection title="2. Why we collect it">
        To process sales, manage inventory, show dashboard insights, secure accounts, and provide
        support.
      </ExpandableSection>
      <ExpandableSection title="3. What we do not do">
        We do not sell your business or customer data.
      </ExpandableSection>
      <ExpandableSection title="4. Security approach">
        Data is protected with authentication, role access controls, and backup safeguards.
      </ExpandableSection>
      <ExpandableSection title="5. Contact">
        For privacy questions, contact support@posflyt.com.
      </ExpandableSection>
    </section>
  );
}

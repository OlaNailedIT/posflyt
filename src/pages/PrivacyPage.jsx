import ExpandableSection from "../components/ui/ExpandableSection";

export default function PrivacyPage() {
  return (
    <section className="space-y-3">
      <h1 className="text-2xl font-bold text-stone-900 dark:text-stone-100">Privacy Policy</h1>
      <p className="text-sm text-stone-600 dark:text-stone-400">
        We collect only what we need to run your store, protect accounts, and support you. We do not sell your business
        or customer lists.
      </p>
      <ExpandableSection title="1. Data we collect">
        <ul className="space-y-1">
          <li>- Business profile (name, contact email, phone where provided, settings such as time zone).</li>
          <li>- Transaction data (line items, totals, timestamps, payment method labels, optional customer links).</li>
          <li>- User accounts for your team (names, emails, roles, session activity as needed for security).</li>
          <li>- Technical data (IP address, device/browser type, error logs) to secure the service and diagnose issues.</li>
        </ul>
      </ExpandableSection>
      <ExpandableSection title="2. Why we use it">
        To process sales, manage inventory, show dashboard metrics, authenticate users, prevent fraud and abuse,
        deliver support, and meet legal obligations.
      </ExpandableSection>
      <ExpandableSection title="3. Legal bases (where GDPR-style rules apply)">
        We process data to perform our contract with you (providing POSFlyt), for legitimate interests (security,
        product improvement), and where required for legal compliance. You may have rights to access, rectify, delete,
        or export certain data, subject to law.
      </ExpandableSection>
      <ExpandableSection title="4. Data residency and transfers">
        Primary storage follows the region of your production database. If we use subprocessors in other regions, we
        apply appropriate safeguards (such as standard contractual clauses) where required.
      </ExpandableSection>
      <ExpandableSection title="5. Retention">
        We keep operational data while your account is active and for a reasonable period afterward for backups,
        disputes, and legal requirements. You may request deletion of personal data subject to applicable law.
      </ExpandableSection>
      <ExpandableSection title="6. Security">
        We use authentication, role-based access, encryption in transit (HTTPS), and industry-typical safeguards for
        hosted infrastructure. No online service is risk-free; protect your passwords and devices.
      </ExpandableSection>
      <ExpandableSection title="7. What we do not do">
        We do not sell your business or customer data to data brokers. We do not use your sales data to advertise
        third-party products to your customers.
      </ExpandableSection>
      <ExpandableSection title="8. Subprocessors">
        Infrastructure and email or payment providers may process limited data under contract. A current list is
        available on request from support.
      </ExpandableSection>
      <ExpandableSection title="9. Your rights and contact">
        To exercise privacy rights or ask questions, contact <span className="font-medium">support@posflyt.com</span>.
        We will respond within a reasonable time.
      </ExpandableSection>
    </section>
  );
}

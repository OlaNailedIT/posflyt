import ExpandableSection from "../components/ui/ExpandableSection";

export default function TermsPage() {
  return (
    <section className="space-y-3">
      <h1 className="text-2xl font-bold text-stone-900 dark:text-stone-100">Terms of Service</h1>
      <p className="text-sm text-stone-600 dark:text-stone-400">
        These terms govern your use of POSFlyt during the pilot and beyond. They are written to be clear; where the law
        in your country adds protections, those protections still apply.
      </p>
      <ExpandableSection title="1. What POSFlyt provides">
        POSFlyt provides point-of-sale checkout, inventory tracking, transaction records, staff roles, and dashboard
        reporting. Features may vary by plan or pilot configuration.
      </ExpandableSection>
      <ExpandableSection title="2. Your responsibilities">
        <ul className="space-y-1">
          <li>- Provide accurate business and sales data.</li>
          <li>- Use POSFlyt only for lawful retail or wholesale activities.</li>
          <li>- Keep login credentials secure and revoke access when staff leave.</li>
          <li>- Maintain your own backups or exports where required for your tax or audit obligations.</li>
        </ul>
      </ExpandableSection>
      <ExpandableSection title="3. Accounts and access">
        You are responsible for activity under your account. We may suspend access for non-payment, security risk, or
        breach of these terms, with notice where practical.
      </ExpandableSection>
      <ExpandableSection title="4. Payment terms">
        Paid plans are subscription-based and renew until canceled. Expired or failed payments can limit paid features.
        Taxes and invoicing follow the details shown at checkout or in your billing portal.
      </ExpandableSection>
      <ExpandableSection title="5. Service and pilot limitations">
        We work to keep POSFlyt available and accurate, but uninterrupted service cannot be guaranteed. Pilot releases
        may change with notice in the product or by email. Scheduled maintenance will be minimized.
      </ExpandableSection>
      <ExpandableSection title="6. Data location">
        Your operational data is processed and stored in the region associated with your production database (e.g. the
        region selected for your Postgres host). Contact support if you need written confirmation for compliance.
      </ExpandableSection>
      <ExpandableSection title="7. Liability">
        POSFlyt is provided as-is to the extent permitted by law. We are not liable for indirect or consequential
        losses from outages, third-party networks, or misuse of the service. Nothing in these terms limits liability
        that cannot be limited under applicable law.
      </ExpandableSection>
      <ExpandableSection title="8. Changes">
        We may update these terms; continued use after notice constitutes acceptance of material changes.
      </ExpandableSection>
      <ExpandableSection title="9. Contact">
        Questions about these terms: <span className="font-medium">support@posflyt.com</span>
      </ExpandableSection>
    </section>
  );
}

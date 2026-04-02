import ExpandableSection from "../components/ui/ExpandableSection";

export default function TermsPage() {
  return (
    <section className="space-y-3">
      <h1 className="text-2xl font-bold text-stone-900 dark:text-stone-100">Terms of Service</h1>
      <p className="text-sm text-stone-600 dark:text-stone-400">
        Short version: use POSflyt lawfully, keep account details secure, and follow your plan terms.
      </p>
      <ExpandableSection title="1. What POSflyt provides">
        POSflyt provides POS, inventory tracking, transaction records, and dashboard reporting.
      </ExpandableSection>
      <ExpandableSection title="2. Your responsibilities">
        <ul className="space-y-1">
          <li>- Provide accurate business and sales data.</li>
          <li>- Use POSflyt only for lawful activities.</li>
          <li>- Keep your login credentials secure.</li>
        </ul>
      </ExpandableSection>
      <ExpandableSection title="3. Payment terms">
        Paid plans are subscription-based and renew until canceled. Expired or failed payments can
        limit paid features.
      </ExpandableSection>
      <ExpandableSection title="4. Service limitations">
        We work to keep POSflyt available, but uninterrupted service cannot be guaranteed at all
        times.
      </ExpandableSection>
      <ExpandableSection title="5. Liability limits">
        POSflyt is provided as-is. To the extent allowed by law, we are not liable for indirect
        losses from outages or service interruptions.
      </ExpandableSection>
    </section>
  );
}

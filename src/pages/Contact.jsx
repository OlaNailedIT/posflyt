import { Link } from "react-router-dom";
import Hero from "../components/Hero";
import ContactForm from "../components/ContactForm";
import SeoHead from "../components/seo/SeoHead";

export default function Contact() {
  return (
    <>
      <SeoHead
        title="Contact POSflyt — Support, Sales & Demos"
        description="Get POSflyt support, talk to sales, or book a demo. We help SMBs roll out POS and inventory with confidence."
        keywords="contact POSflyt, request demo, POS support, SMB software help"
      />
      <Hero
        title="Let’s Talk Business"
        subtitle="Have questions? Need a demo? Our team is ready to help."
      />

      <div className="mx-auto grid max-w-6xl gap-10 px-4 pb-20 lg:grid-cols-2">
        <section>
          <h2 className="text-lg font-semibold text-stone-900 dark:text-stone-100">Send a message</h2>
          <ContactForm />
        </section>

        <section className="space-y-8">
          <div>
            <h2 className="text-lg font-semibold text-stone-900 dark:text-stone-100">Support &amp; sales</h2>
            <p className="mt-2 text-sm text-stone-600 dark:text-stone-400">
              Email:{" "}
              <a href="mailto:support@posflyt.com" className="font-medium text-teal-700 hover:underline dark:text-teal-400">
                support@posflyt.com
              </a>
            </p>
            <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">
              Phone: <span className="font-medium text-stone-800 dark:text-stone-200">+234 XXX XXX XXXX</span> (placeholder)
            </p>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-stone-900 dark:text-stone-100">Office location</h2>
            <p className="mt-2 text-sm text-stone-600 dark:text-stone-400">
              Map embed — add Google Maps iframe or provider URL in production.
            </p>
            <div
              className="mt-3 aspect-video w-full max-w-md rounded-xl border border-stone-200 bg-stone-100 dark:border-stone-700 dark:bg-stone-800"
              role="presentation"
              aria-hidden
            />
          </div>

          <div>
            <h2 className="text-lg font-semibold text-stone-900 dark:text-stone-100">Help</h2>
            <p className="mt-2 text-sm text-stone-600 dark:text-stone-400">
              Logged-in users can open{" "}
              <Link to="/login" className="font-medium text-teal-700 hover:underline dark:text-teal-400">
                the app
              </Link>{" "}
              for in-product help. Public documentation links can be added here.
            </p>
          </div>
        </section>
      </div>
    </>
  );
}

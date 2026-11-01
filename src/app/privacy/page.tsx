import { ConsentSettings } from "@/components/analytics/ConsentSettings";

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-24">
        <h1 className="text-3xl sm:text-4xl font-bold text-foreground mb-8">
          Privacy Policy
        </h1>

        <div className="prose prose-sm text-muted-foreground space-y-6">
          <p className="text-sm text-muted-foreground">
            Last updated: October 31, 2026
          </p>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-foreground">1. Information We Collect</h2>
            <p>
              When you sign in with Google, we receive your name and email address from your Google account. When you purchase Pro, our payment processor (Stripe) collects your payment information directly &mdash; we never see or store your full card details. If you answer our hunting-preferences questions, we receive the states, species, methods, units, points, goals, and notes you enter.
            </p>
            <p>
              If you use the &ldquo;Request a state&rdquo; form, we receive the information you enter: your name, email address, optional phone number, home state, the state you&apos;re requesting, your residency for that state, species, method of take, when you plan to hunt, any notes, and whether you want to be emailed when the state goes live. If you&apos;re signed in, the request also includes your account email and whether you&apos;re a Pro member.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-foreground">2. How We Use Your Information</h2>
            <p>
              We use your information to provide and improve HuntScout Pro, confirm your Pro access, answer your support requests, and contact you about your purchase or important service updates. Payment receipts are sent by Stripe.
            </p>
            <p>
              State requests are emailed to our team through Resend, our email provider. We use them only to follow up with you about your request and to decide which states to add next. We don&apos;t add you to a mailing list or share your request with anyone else.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-foreground">3. Data Storage</h2>
            <p>
              We do not keep a separate customer database. Your sign-in session is kept in an encrypted cookie in your browser. Your purchase record (including your email address, the amount, and the purchase date) is held by Stripe, and we check it with Stripe to confirm your Pro access. If you are a Pro member and answer our hunting-preferences questions, your answers are stored with your purchase record at Stripe, and a copy is emailed to our team so we can follow up. State requests are not stored in a database; they exist only as the email sent to our team. Hunt planner data is stored only in your browser; the planner&apos;s export option saves a file to your own device and does not send it to us.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-foreground">4. Third-Party Services</h2>
            <p>
              We use third-party services including Stripe for payment processing, Google for sign-in, Resend to send email, and Vercel to host the website. The analytics and advertising services we use are described in the next section. These services have their own privacy policies governing how they handle your data.
            </p>
          </section>

          <section id="analytics" className="space-y-3 scroll-mt-24">
            <h2 className="text-lg font-semibold text-foreground">5. Analytics, Advertising and Cookies</h2>
            <p>
              We use essential cookies to keep you signed in. We also use the following tools to understand how the site is used and to measure our advertising:
            </p>
            <ul className="list-disc pl-5 space-y-2">
              <li>
                <span className="font-semibold text-foreground">Vercel Web Analytics and Speed Insights.</span> Count page views and measure how fast pages load. They don&apos;t use cookies and don&apos;t identify you.
              </li>
              <li>
                <span className="font-semibold text-foreground">Microsoft Clarity.</span> Records how visitors move through pages (clicks, scrolling and taps) so we can watch session replays and see heatmaps. Text you type into forms is hidden from these recordings, and we also hide your name, email address and account details on screen. Clarity sets cookies to recognize repeat visits. When you&apos;re signed in, we send Clarity a one-way hash of your email address so we can group your visits; Clarity never receives the address itself. We also record which pages and features are used (for example which state, species or data tab you open, or that a purchase completed). See the{" "}
                <a href="https://www.microsoft.com/privacy/privacystatement" target="_blank" rel="noopener noreferrer" className="text-foreground underline underline-offset-2">
                  Microsoft Privacy Statement
                </a>
                .
              </li>
              <li>
                <span className="font-semibold text-foreground">Google Ads tag and Meta Pixel.</span> Only while we run ads on Google or Meta. They tell Google or Meta that someone who saw or clicked one of our ads visited the site or bought Pro (the purchase amount and an order number, never your card details), so we can measure whether the ads work. Google and Meta may set their own cookies and combine this with other information they hold. See{" "}
                <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer" className="text-foreground underline underline-offset-2">
                  Google&apos;s Privacy Policy
                </a>{" "}
                and{" "}
                <a href="https://www.facebook.com/privacy/policy/" target="_blank" rel="noopener noreferrer" className="text-foreground underline underline-offset-2">
                  Meta&apos;s Privacy Policy
                </a>
                .
              </li>
            </ul>
            <p>
              We don&apos;t sell your personal information for money. Some U.S. state laws treat letting advertising tags collect visit data as &ldquo;sharing&rdquo; it for advertising, and you can opt out of that in any of the ways below.
            </p>
            <h3 className="text-base font-semibold text-foreground pt-1">Your choices</h3>
            <ul className="list-disc pl-5 space-y-2">
              <li>
                <span className="font-semibold text-foreground">Global Privacy Control.</span> If your browser or an extension sends the Global Privacy Control signal, we don&apos;t load the Google Ads tag or the Meta Pixel and tell Clarity not to use your visit for advertising.
              </li>
              <li>
                <span className="font-semibold text-foreground">Visitors in the European Economic Area, the UK and Switzerland.</span> You&apos;ll see a banner on your first visit. Until you choose Accept, Clarity runs without cookies and no advertising tags load. Choosing Decline keeps it that way.
              </li>
              <li>
                <span className="font-semibold text-foreground">Change your choice for this browser at any time:</span>
                <ConsentSettings />
              </li>
              <li>
                You can also block or delete cookies in your browser settings, and manage ad personalization in{" "}
                <a href="https://myadcenter.google.com/" target="_blank" rel="noopener noreferrer" className="text-foreground underline underline-offset-2">
                  Google&apos;s My Ad Center
                </a>{" "}
                and{" "}
                <a href="https://www.facebook.com/adpreferences/" target="_blank" rel="noopener noreferrer" className="text-foreground underline underline-offset-2">
                  Meta&apos;s ad preferences
                </a>
                .
              </li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-foreground">6. Your Rights</h2>
            <p>
              You may request access to, correction of, or deletion of your personal data at any time. To make a request, email{" "}
              <a href="mailto:support@huntscoutpro.com" className="text-foreground underline underline-offset-2">
                support@huntscoutpro.com
              </a>
              .
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-foreground">7. Changes to This Policy</h2>
            <p>
              We may update this privacy policy from time to time. We will notify you of any material changes by posting the updated policy on this page with a revised date.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}

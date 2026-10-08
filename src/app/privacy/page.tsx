export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-24">
        <h1 className="text-3xl sm:text-4xl font-bold text-foreground mb-8">
          Privacy Policy
        </h1>

        <div className="prose prose-sm text-muted-foreground space-y-6">
          <p className="text-sm text-muted-foreground">
            Last updated: October 8, 2026
          </p>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-foreground">1. Information We Collect</h2>
            <p>
              When you sign in with Google, we receive your name and email address from your Google account. When you purchase Pro, our payment processor (Stripe) collects your payment information directly &mdash; we never see or store your full card details.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-foreground">2. How We Use Your Information</h2>
            <p>
              We use your information to provide and improve HuntScout Pro, confirm your Pro access, answer your support requests, and contact you about your purchase or important service updates. Payment receipts are sent by Stripe.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-foreground">3. Data Storage</h2>
            <p>
              We do not keep a separate customer database. Your sign-in session is kept in an encrypted cookie in your browser. Your purchase record (including your email address, the amount, and the purchase date) is held by Stripe, and we check it with Stripe to confirm your Pro access. Hunt planner data is stored only in your browser; the planner&apos;s export option saves a file to your own device and does not send it to us.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-foreground">4. Third-Party Services</h2>
            <p>
              We use third-party services including Stripe for payment processing, Google for sign-in, and Vercel to host the website. These services have their own privacy policies governing how they handle your data.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-foreground">5. Cookies</h2>
            <p>
              We use essential cookies for authentication and session management. We do not use tracking cookies or sell your data to advertisers.
            </p>
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

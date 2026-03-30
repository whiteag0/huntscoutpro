export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-24">
        <h1 className="text-3xl sm:text-4xl font-bold text-foreground mb-8">
          Privacy Policy
        </h1>

        <div className="prose prose-sm text-muted-foreground space-y-6">
          <p className="text-sm text-muted-foreground">
            Last updated: March 29, 2026
          </p>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-foreground">1. Information We Collect</h2>
            <p>
              When you create an account, we collect your name and email address. If you subscribe, our payment processor (Stripe) handles your payment information directly -- we never store your full card details.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-foreground">2. How We Use Your Information</h2>
            <p>
              We use your information to provide and improve HuntScout Pro, manage your subscription, send transactional emails (receipts, password resets), and communicate important service updates.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-foreground">3. Data Storage</h2>
            <p>
              Your account data is stored securely on our servers. Hunt planner data is stored locally in your browser and is not transmitted to our servers unless you explicitly export it.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-foreground">4. Third-Party Services</h2>
            <p>
              We use third-party services including Stripe for payment processing and Google for authentication. These services have their own privacy policies governing how they handle your data.
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
              You may request access to, correction of, or deletion of your personal data at any time. To make a request, contact us through the FAQ section on our website.
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

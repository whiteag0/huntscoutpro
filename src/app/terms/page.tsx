export default function TermsPage() {
  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-24">
        <h1 className="text-3xl sm:text-4xl font-bold text-foreground mb-8">
          Terms of Service
        </h1>

        <div className="prose prose-sm text-muted-foreground space-y-6">
          <p className="text-sm text-muted-foreground">
            Last updated: March 29, 2026
          </p>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-foreground">1. Acceptance of Terms</h2>
            <p>
              By accessing or using HuntScout Pro, you agree to be bound by these Terms of Service. If you do not agree to these terms, please do not use our service.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-foreground">2. Description of Service</h2>
            <p>
              HuntScout Pro provides hunting draw odds data, harvest statistics, point analysis, and planning tools aggregated from publicly available state wildlife agency data across all 50 U.S. states.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-foreground">3. Subscription and Billing</h2>
            <p>
              HuntScout Pro is offered as an annual subscription. By subscribing, you authorize us to charge the applicable fee to your payment method on a recurring annual basis until you cancel. You may cancel your subscription at any time from your account settings.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-foreground">4. Refund Policy</h2>
            <p>
              We offer a 30-day money-back guarantee on all new subscriptions. If you are not satisfied with HuntScout Pro within the first 30 days of your subscription, contact us for a full refund.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-foreground">5. Data Accuracy</h2>
            <p>
              While we strive to provide accurate and up-to-date data sourced from official state wildlife agencies, HuntScout Pro does not guarantee the accuracy, completeness, or timeliness of the data. Always verify critical information directly with the relevant state wildlife agency before making application decisions.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-foreground">6. User Accounts</h2>
            <p>
              You are responsible for maintaining the confidentiality of your account credentials. You agree to accept responsibility for all activities that occur under your account.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-foreground">7. Contact</h2>
            <p>
              If you have any questions about these Terms of Service, please reach out to us via the FAQ section on our website.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}

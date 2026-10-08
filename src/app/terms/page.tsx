export default function TermsPage() {
  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-24">
        <h1 className="text-3xl sm:text-4xl font-bold text-foreground mb-8">
          Terms of Service
        </h1>

        <div className="prose prose-sm text-muted-foreground space-y-6">
          <p className="text-sm text-muted-foreground">
            Last updated: October 8, 2026
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
              HuntScout Pro provides estimated draw odds, harvest statistics, point analysis, and planning tools for hunts in all 50 U.S. states. Draw odds, minimum points, and tag and applicant counts are estimates produced by our own model; they are not official draw results. Harvest and success figures use state wildlife agency harvest reports where available and are otherwise estimated. State pages label which harvest figures come from agency reports.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-foreground">3. Payment and Access Term</h2>
            <p>
              HuntScout Pro is sold as a one-time payment, currently $14.99, processed by Stripe. Each purchase includes 24 months of Pro access starting on the purchase date. This is not a subscription: your payment method is charged once and is not charged again automatically, so there is nothing to cancel. When your access term ends, Pro features end and you are not charged.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-foreground">4. Refund Policy</h2>
            <p>
              We offer a 30-day money-back guarantee. If you are not satisfied with HuntScout Pro, email{" "}
              <a href="mailto:support@huntscoutpro.com" className="text-foreground underline underline-offset-2">
                support@huntscoutpro.com
              </a>{" "}
              within 30 days of your purchase for a full refund.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-foreground">5. Data Accuracy</h2>
            <p>
              Draw odds, minimum points, tag and applicant counts, and any figures labeled as estimates are modeled approximations, not official agency data, and can differ substantially from actual draw results. Figures attributed to state wildlife agency reports are reproduced as compiled and may contain errors or be superseded by later agency revisions. HuntScout Pro does not guarantee the accuracy, completeness, or timeliness of any data. Always confirm draw odds, quotas, season dates, deadlines, and regulations directly with the relevant state wildlife agency before applying or hunting.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-foreground">6. User Accounts</h2>
            <p>
              You sign in to HuntScout Pro with your Google account, and Pro access is tied to the email address on that account. You are responsible for keeping your Google account secure and for activity that occurs under your HuntScout Pro account.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-foreground">7. Contact</h2>
            <p>
              If you have any questions about these Terms of Service, email{" "}
              <a href="mailto:support@huntscoutpro.com" className="text-foreground underline underline-offset-2">
                support@huntscoutpro.com
              </a>
              .
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}

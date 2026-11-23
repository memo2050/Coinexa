import LegalPage from '@/components/site/LegalPage';
import LegalReviewNote from '@/components/site/LegalReviewNote';

function Clause({ heading, children }) {
  return (
    <section>
      <h2 className="font-heading text-lg font-semibold text-white sm:text-xl">{heading}</h2>
      <div className="mt-3 space-y-3 text-sm leading-relaxed text-slate-400 sm:text-[0.95rem]">
        {children}
      </div>
    </section>
  );
}

export default function Terms() {
  return (
    <LegalPage
      title="Terms of Service"
      updated="16 November 2026"
      intro="These terms govern your use of Coinexa.net and the agent platform available through it. By using the service you agree to them. Provisions that need legal confirmation are marked rather than assumed."
    >
      <Clause heading="The service">
        <p>
          Coinexa.net lets you describe a business process, have an AI agent built for it, run that
          agent on real tasks, review step-by-step execution, and approve or reject steps that are
          marked as requiring human sign-off. Product research features gather public information
          and calculate profit and scoring estimates from the assumptions you supply.
        </p>
      </Clause>

      <Clause heading="Accounts and workspaces">
        <p>
          You are responsible for the accuracy of the information on your account, for keeping your
          credentials secure, and for the activity that happens under your account. Workspace
          administrators control who joins a workspace, which agents it holds, and can see the
          execution history of that workspace. If you belong to a workspace, its administrator can
          access the content you create inside it.
        </p>
      </Clause>

      <Clause heading="Acceptable use">
        <p>You agree not to use the service to:</p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>break any law, or infringe anyone's rights;</li>
          <li>process content you have no right to process, including other people's confidential or personal data without a lawful basis;</li>
          <li>attempt to reach another workspace's data, probe the access rules, or bypass plan limits;</li>
          <li>send spam, run deceptive campaigns, or generate material that harms people;</li>
          <li>upload malware, or attack or overload the service or its providers.</li>
        </ul>
      </Clause>

      <Clause heading="AI output is not guaranteed">
        <p>
          Agents generate output using statistical models. Output can be incomplete, out of date or
          simply wrong, and it may reflect errors in the sources it read. Check anything that
          matters before you rely on it, and keep human approval gates on decisions that affect
          money, customers or compliance. The service is a tool for your team, not a substitute for
          professional judgement.
        </p>
      </Clause>

      <Clause heading="Your content">
        <p>
          You keep ownership of the material you submit and of the results produced for you. You
          grant us the limited permission needed to store, process, transmit to model providers and
          display that material in order to run the service for you. We do not use your workspace
          content to train models of our own.
        </p>
      </Clause>

      <Clause heading="Fees and billing">
        <p>
          Paid plans are billed as a recurring subscription through Stripe, and plan limits apply to
          the workspace that holds the subscription. Payments are currently processed in test mode:
          no live charge is taken and no live subscription is created.
        </p>
        <LegalReviewNote>
          the refund and cancellation policy, the treatment of unused plan allowance, tax handling
          and the notice period for price changes must be set before live payments are enabled.
        </LegalReviewNote>
      </Clause>

      <Clause heading="Availability and changes">
        <p>
          We aim to keep the service available and may change, improve or retire features. Where a
          change materially reduces what you are paying for, we will give notice before it takes
          effect for your workspace. Dependence on third-party model and hosting providers means
          occasional interruption is possible.
        </p>
      </Clause>

      <Clause heading="Suspension and termination">
        <p>
          You may stop using the service at any time. We may suspend a workspace that is used in
          breach of these terms, that puts the service or other customers at risk, or that is
          overdue on payment. On termination, we handle workspace content as described in the
          Privacy Policy.
        </p>
      </Clause>

      <Clause heading="Liability">
        <p>
          The service is provided on an “as is” basis to the extent permitted by law, and we are
          not liable for indirect or consequential loss, or for decisions you take on the basis of
          AI output without review.
        </p>
        <LegalReviewNote>
          the liability cap, the exclusions that are enforceable, and any mandatory consumer
          protections in your jurisdiction must be drafted by counsel before these terms are
          published as final.
        </LegalReviewNote>
      </Clause>

      <Clause heading="Governing law and contact">
        <p>Questions about these terms: hello@coinexa.net.</p>
        <LegalReviewNote>
          the governing law, the courts with jurisdiction, and the contracting entity must be
          confirmed.
        </LegalReviewNote>
      </Clause>
    </LegalPage>
  );
}
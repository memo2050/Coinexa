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

// Information that does not exist yet is shown as a visible placeholder, never invented.
function Pending({ children = 'PENDING LEGAL CONFIRMATION' }) {
  return <span className="font-semibold text-amber-200">[{children}]</span>;
}

// DRAFT for attorney review (27 November 2026). Statements about billing, trials, grace
// periods, cancellation and data handling describe what the platform does today on staging.
// Placeholders mark company details, business decisions and legal terms that must be
// supplied or approved; nothing here has been reviewed by a lawyer yet.
export default function Terms() {
  return (
    <LegalPage
      title="Terms of Service"
      updated="27 November 2026 (draft, pending legal review)"
      intro="These terms govern your use of Coinexa.net and the agent platform available through it. By creating an account, hiring an agent or otherwise using the service you agree to them. They describe how the service works today; anything that still needs a company detail, a business decision or legal confirmation is marked as such rather than assumed."
    >
      <Clause heading="Who we are">
        <p>
          The service is provided by <Pending>PENDING LEGAL CONFIRMATION: registered legal name of the company</Pending>,
          a <Pending>PENDING: entity type, e.g. limited liability company</Pending> registered in{' '}
          <Pending>PENDING: state or country of registration</Pending> under registration number{' '}
          <Pending>PENDING</Pending>, with its registered address at{' '}
          <Pending>PENDING: registered business address</Pending> (“Coinexa”, “we”, “us”). Coinexa.net
          is the name of the service. You can reach us at hello@coinexa.net.
        </p>
        <LegalReviewNote>
          the contracting entity, its registration details and address must be supplied by the
          owner and confirmed by counsel. These terms must not be published as final while any of
          them is missing.
        </LegalReviewNote>
      </Clause>

      <Clause heading="The service">
        <p>
          Coinexa.net lets you describe a business process, have an AI agent built for it, run that
          agent on real tasks, review step-by-step execution, and approve or reject steps that are
          marked as requiring human sign-off. Product research features gather public information
          and calculate profit and scoring estimates from the assumptions you supply. Featured
          agents include a Recruitment Agent and a Cyber Security Scan Agent with a Windows
          network scanner, each covered by its own section below.
        </p>
        <p>
          Unless an agent's page says it is connected to an outside system, an agent works as a
          drafting assistant: it prepares text, plans and documents for you to review and use. It
          does not send, book, file or change anything in other systems on your behalf.
        </p>
      </Clause>

      <Clause heading="Business use and consumers">
        <p>
          The service is designed for businesses and professionals. If you use it for a business,
          you confirm that you are authorized to accept these terms on that business's behalf, and
          “you” includes that business. The service is not offered to anyone under 18.
        </p>
        <p>
          <Pending>PENDING BUSINESS DECISION: whether individuals acting as consumers may sign up</Pending>.
          If consumers may use the service, the consumer protection laws of their place of residence
          apply in addition to these terms, and nothing in these terms limits rights those laws say
          cannot be limited.
        </p>
        <LegalReviewNote>
          counsel must confirm which provisions (automatic renewal, refunds, liability, dispute
          resolution) need separate consumer wording, and whether a business-only sign-up
          confirmation is required.
        </LegalReviewNote>
      </Clause>

      <Clause heading="Accounts and workspaces">
        <p>
          You are responsible for the accuracy of the information on your account, for keeping your
          credentials secure, and for the activity that happens under your account. Two-step
          sign-in with an authenticator app is available to every account; we recommend turning it
          on. Workspace administrators control who joins a workspace, which agents it holds, and can
          see the execution history of that workspace. If you belong to a workspace, its
          administrator can access the content you create inside it. Tell us promptly at
          hello@coinexa.net if you believe your account has been used without your permission.
        </p>
      </Clause>

      <Clause heading="Acceptable use">
        <p>You agree not to use the service to:</p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>break any law, or infringe anyone's rights;</li>
          <li>process content you have no right to process, including other people's confidential or personal data without a lawful basis;</li>
          <li>scan, probe or test any network or device you do not own or are not explicitly authorized to test;</li>
          <li>make hiring, credit, insurance, housing or similar decisions about people based solely on AI output without human review;</li>
          <li>attempt to reach another workspace's data, probe the access rules, or bypass plan limits;</li>
          <li>send spam, run deceptive campaigns, or generate material that harms people;</li>
          <li>upload malware, or attack or overload the service or its providers.</li>
        </ul>
      </Clause>

      <Clause heading="Agents, prices and monthly allowances">
        <p>
          Each agent is hired individually for the monthly price shown on its card, in US dollars.
          All agents you hire in a workspace are billed together through one subscription for that
          workspace. Each agent includes a monthly allowance, shown on its card (for example tasks,
          scans, documents, evaluations or interviews). When an allowance is used up, that agent
          pauses until the next billing period; you are not charged for extra use automatically.
          Unused allowance does not carry over to the next period. To keep processing costs
          predictable, each agent also has a monthly AI-processing limit; if it is reached, the agent
          pauses until the next period in the same way.
        </p>
        <p>
          Each agent can be tried once for free with a small trial allowance (for example 10 tasks)
          before you hire it. No payment details are needed for a trial, and a trial never turns into
          a paid subscription by itself.
        </p>
        <p>
          Payments are currently processed in test mode: no live charge is taken and no live
          subscription is created.
        </p>
      </Clause>

      <Clause heading="Automatic renewal and your consent">
        <p>
          When you hire an agent, you authorize us, through our payment processor Stripe, to charge
          the payment method you provide the agent's monthly price on the day you hire it and then
          automatically every month on your billing date, until you cancel. The monthly price is
          shown before you confirm a hire, and you confirm the hire yourself; we do not hire agents
          for you. <Pending>PENDING PRODUCT CHANGE: the hire confirmation and Stripe checkout must also state that the agent renews automatically every month until cancelled, and how to cancel</Pending>.
        </p>
        <p>
          After each hire we send a confirmation that states the agent, its price, that it renews
          monthly, and how to cancel <Pending>PENDING: confirmation email, sent once the email domain is verified</Pending>.
        </p>
        <LegalReviewNote>
          counsel must confirm the wording and placement of the renewal disclosure and consent at
          checkout (including California's Automatic Renewal Law, as amended from 1 July 2025),
          whether a separate consent checkbox and an annual reminder are required, and how these
          apply to business customers.
        </LegalReviewNote>
      </Clause>

      <Clause heading="Adding agents and prorated charges">
        <p>
          If your workspace already has a subscription, an agent you hire is added to it. We show
          you the amount before you confirm, and once you confirm, your payment method on file is
          charged that amount right away for the rest of the current billing period (a prorated
          charge). From the next billing date, the agent renews at its full monthly price together
          with your other agents.
        </p>
      </Clause>

      <Clause heading="Cancellation">
        <p>
          You can cancel any agent at any time online, from that agent's card in your workspace
          (workspace owners and administrators). You do not need to contact us to cancel. A
          cancelled agent stays available until the end of the period you have already paid for,
          and is not charged again. If you cancel your last hired agent, the workspace subscription
          ends at the end of that period. You can also contact hello@coinexa.net and we will cancel
          for you.
        </p>
        <p>
          Payment details and past invoices are managed in Stripe's secure billing portal{' '}
          <Pending>PENDING PRODUCT CHANGE: link to the billing portal in the workspace</Pending>.
        </p>
      </Clause>

      <Clause heading="Refunds">
        <p>
          <Pending>PENDING BUSINESS DECISION: refund policy</Pending>. How the service works today:
          cancelling stops future charges and keeps the agent until the end of the paid period; no
          automatic refund is issued for the remainder of that period, and refunds can only be issued
          by us manually. Where a law gives you a right to a refund, that right applies regardless of
          this section.
        </p>
        <LegalReviewNote>
          the owner must choose a refund policy (for example: no refunds for partial periods, or a
          full refund within a set number of days of the first hire) and counsel must confirm it,
          including any consumer refund rights and how refunds interact with chargebacks.
        </LegalReviewNote>
      </Clause>

      <Clause heading="Failed payments">
        <p>
          If a renewal payment fails, Stripe may retry it, and you should update your payment method
          in the billing portal; the agent's card in your workspace shows “payment failed”. Your hired agents stay available for a grace period of 3 days
          after the payment fails. If the payment is still outstanding after that, the affected
          agents pause until it is paid. <Pending>PENDING BUSINESS DECISION: when an unpaid subscription is cancelled</Pending>.
        </p>
      </Clause>

      <Clause heading="Price changes">
        <p>
          We may change an agent's price. A new price applies to an agent you have already hired only
          from a billing date at least <Pending>PENDING BUSINESS DECISION: notice period, e.g. 30 days</Pending>{' '}
          after we tell you about it by email and in your workspace, and you can cancel before it takes
          effect. Price changes never apply to a period you have already paid for.
        </p>
      </Clause>

      <Clause heading="Taxes">
        <p>
          <Pending>PENDING BUSINESS DECISION AND TAX ADVICE: whether prices include or exclude sales tax, VAT or similar taxes, and where tax is collected</Pending>.
          You are responsible for any taxes that apply to your purchase and that we are not required
          to collect, and for providing accurate billing details (including a tax ID where relevant).
        </p>
        <LegalReviewNote>
          sales-tax and VAT obligations for software subscriptions depend on where customers are; an
          accountant or tax adviser must confirm registration and collection before live payments.
        </LegalReviewNote>
      </Clause>

      <Clause heading="Payment processing">
        <p>
          Payments are processed by Stripe. Card and bank details are entered on Stripe's own pages
          and are never received or stored by us; Stripe's terms and privacy policy apply to that
          processing. We receive the subscription, the agents it covers, billing periods and payment
          status, which we use to provide the agents you have paid for.
        </p>
      </Clause>

      <Clause heading="AI output and human oversight">
        <p>
          Agents generate output using statistical models. Output can be incomplete, out of date or
          simply wrong, and it may reflect errors in the sources it read. Check anything that
          matters before you rely on it, and keep human approval gates on decisions that affect
          money, customers, people or compliance. You are responsible for how you use the output.
          The service is a tool for your team, not a substitute for professional judgement, and
          does not provide legal, financial, tax, medical or security certification advice.
        </p>
      </Clause>

      <Clause heading="Network scanner: authorized use only">
        <p>
          The Cyber Security Scan Agent's Windows scanner may only be used on private networks that
          you own or that you have explicit, documented permission from the network owner to test.
          Before every scan the scanner asks you to confirm that authorization, and it refuses public
          internet addresses. By confirming, you state that you have that authorization.
        </p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>You are solely responsible for obtaining and keeping any permission needed for a scan, including from your employer, landlord, client or network provider.</li>
          <li>You must not use the scanner, or its results, to gain unauthorized access to any system.</li>
          <li>Scanning a network without authorization may be a criminal offence and may breach contracts; we may suspend accounts that do so.</li>
          <li>Scan reports point out likely weaknesses; they are not a complete security audit or a guarantee that a network is secure.</li>
        </ul>
        <LegalReviewNote>
          counsel must confirm the authorization wording, the customer indemnity for unauthorized
          scanning, and any export-control or computer-misuse considerations.
        </LegalReviewNote>
      </Clause>

      <Clause heading="Recruitment Agent and candidate data">
        <p>
          If you use the Recruitment Agent, you decide which candidates are added and why. For
          candidate data, your workspace decides what is collected and for what purpose, and we
          process it on your behalf to provide the service. You are responsible for:
        </p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>having a lawful basis to collect and use each candidate's data and to contact them;</li>
          <li>giving candidates any privacy notice the law requires, including candidates you add who did not apply through your Coinexa job page;</li>
          <li>honouring candidates' requests to access, correct or delete their data;</li>
          <li>complying with laws on AI and automated tools in hiring that apply where you recruit, which may require candidate notices or independent bias audits;</li>
          <li>the hiring decisions you make.</li>
        </ul>
        <p>
          Evaluation scores and reports are suggestions that support a person's decision. They are
          not automated hiring decisions, every contact with a candidate needs a person's approval,
          and you must not reject or select a candidate based solely on them. Candidate data is
          deleted automatically 180 days after a hiring campaign closes, unless your workspace sets a
          different period between 7 and 1,095 days.
        </p>
        <LegalReviewNote>
          a Data Processing Agreement between Coinexa and hiring workspaces is required where data
          protection law treats Coinexa as a processor, and counsel must confirm current obligations
          under AI-in-hiring rules (for example New York City Local Law 144, Illinois HB 3773 and
          the EU AI Act) before the Recruitment Agent is offered for those locations.
        </LegalReviewNote>
      </Clause>

      <Clause heading="Your content and data">
        <p>
          You keep ownership of the material you submit and of the results produced for you. You
          grant us the limited permission needed to store, process, transmit to our AI model
          provider and display that material in order to run the service for you, and to keep the
          records needed for billing, security and the audit log. We do not use your workspace
          content to train models of our own, and we do not sell it. Our Privacy Policy explains how
          personal data is handled.
        </p>
      </Clause>

      <Clause heading="Confidentiality">
        <p>
          We treat the content of your workspace as confidential. We use it only to provide and
          secure the service, and share it only with the service providers listed below that need it
          for that purpose, or where the law requires. Access to workspace records is enforced on our
          servers, and our staff access it only when needed to support you, secure the service or
          meet a legal requirement.
        </p>
        <LegalReviewNote>
          counsel must confirm the scope of mutual confidentiality obligations, permitted disclosures
          and breach-notification commitments.
        </LegalReviewNote>
      </Clause>

      <Clause heading="Keeping, exporting and deleting your data">
        <p>
          Workspace content stays available while your workspace is active. Before you close your
          workspace, you can download your agents' results from the workspace.{' '}
          <Pending>PENDING BUSINESS DECISION: how long data is kept after an account or workspace is closed before it is deleted, and how a full export is requested</Pending>.
          Billing records are kept for as long as tax and accounting law requires{' '}
          <Pending>PENDING: period</Pending>. Recruitment candidate data follows the retention period
          described above.
        </p>
      </Clause>

      <Clause heading="Our platform and intellectual property">
        <p>
          We and our licensors own the Coinexa.net platform, including its software, agent
          templates, workflows, design and the Coinexa name and logo. These terms give you the right
          to use the service while your account is in good standing; they do not transfer any
          ownership. You may not copy, resell, reverse engineer or build a competing service from the
          platform. If you send us feedback or suggestions, we may use them without obligation to
          you.
        </p>
      </Clause>

      <Clause heading="Service providers">
        <p>
          We use third-party providers to run the service: Supabase (database, sign-in, file storage
          and server functions), Hostinger (website hosting), Anthropic (AI model processing),
          Stripe (payments), Resend (account and recruitment emails) and Cloudflare Turnstile (a
          security check on sign-up, sign-in and job applications). Their availability affects the
          service, and their own terms apply to the processing they perform. We will update this list
          when it changes.
        </p>
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
          You may stop using the service at any time, and cancel your agents as described above. We
          may suspend a workspace or account that is used in breach of these terms (including
          unauthorized scanning or unlawful processing of candidate data), that puts the service or
          other customers at risk, or that is overdue on payment after the grace period. Where
          practical and lawful, we will tell you why and give you a chance to fix the problem
          before or promptly after suspending. We may end these terms for serious or repeated
          breaches. On termination, we handle workspace content as described in “Keeping, exporting
          and deleting your data” and in the Privacy Policy.
        </p>
        <LegalReviewNote>
          counsel must confirm notice periods for suspension and termination, and what happens to
          prepaid fees if we terminate.
        </LegalReviewNote>
      </Clause>

      <Clause heading="Disclaimers">
        <p>
          The service is provided on an “as is” and “as available” basis to the extent permitted by
          law. <Pending>PENDING LEGAL CONFIRMATION: wording and conspicuous formatting of warranty disclaimers</Pending>.
        </p>
      </Clause>

      <Clause heading="Liability">
        <p>
          To the extent permitted by law, we are not liable for indirect or consequential loss, or
          for decisions you take on the basis of AI output without review.{' '}
          <Pending>PENDING LEGAL CONFIRMATION: liability cap and its amount</Pending>. Nothing in
          these terms limits liability that cannot be limited by law.
        </p>
        <LegalReviewNote>
          the liability cap, the exclusions that are enforceable, and any mandatory consumer
          protections in your jurisdiction must be drafted by counsel before these terms are
          published as final.
        </LegalReviewNote>
      </Clause>

      <Clause heading="Your responsibility for claims">
        <p>
          You are responsible for, and will cover our reasonable losses from, third-party claims
          arising from networks you scan without authorization, personal data (including candidate
          data) you process through the service without a lawful basis, or content you submit that
          infringes someone else's rights.
        </p>
        <LegalReviewNote>
          the scope and wording of this indemnity, and whether it applies to consumers, must be
          drafted by counsel.
        </LegalReviewNote>
      </Clause>

      <Clause heading="Disputes and governing law">
        <p>
          If you have a concern, please contact hello@coinexa.net first so we can try to resolve it
          informally. These terms are governed by the laws of{' '}
          <Pending>PENDING LEGAL CONFIRMATION: governing law</Pending>, and disputes are decided by{' '}
          <Pending>PENDING LEGAL CONFIRMATION: courts or arbitration, and venue</Pending>. Consumers
          keep any right their local law gives them to bring a claim in their home courts.
        </p>
        <LegalReviewNote>
          counsel must choose the governing law and forum and decide whether to use arbitration and a
          class-action waiver, including their enforceability for consumers.
        </LegalReviewNote>
      </Clause>

      <Clause heading="Changes to these terms">
        <p>
          We may update these terms. We will change the date above and, for material changes, tell
          you by email or in the product before they take effect{' '}
          <Pending>PENDING BUSINESS DECISION: notice period</Pending>. If you continue to use the
          service after that, the updated terms apply; if you do not agree, you can cancel your agents
          before they take effect.
        </p>
      </Clause>

      <Clause heading="General">
        <p>
          <Pending>PENDING LEGAL CONFIRMATION: standard provisions on entire agreement, assignment, severability, waiver, force majeure, notices and export controls</Pending>.
        </p>
      </Clause>

      <Clause heading="Contact">
        <p>Questions about these terms: hello@coinexa.net.</p>
      </Clause>
    </LegalPage>
  );
}
